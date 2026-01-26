use crate::db::Database;
use crate::error::Result;
use crate::models::TaskStatus;
use crate::services::ClaudeProcessService;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

const IPC_PORT: u16 = 19532; // Random port for IPC

/// Pending permission requests waiting for user response
type PendingPermissions = Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<PermissionDecision>>>>;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
pub enum IPCCommand {
    #[serde(rename = "list")]
    List,
    #[serde(rename = "status")]
    Status { task_id: String },
    #[serde(rename = "takeover")]
    Takeover { task_id: String },
    #[serde(rename = "handback")]
    Handback {
        task_id: String,
        prompt: Option<String>,
    },
    /// Permission request from Claude Code hook
    #[serde(rename = "permission_request")]
    PermissionRequest {
        request_id: String,
        task_id: String,
        tool_name: String,
        tool_input: serde_json::Value,
    },
}

/// Permission request event sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct PermissionRequestEvent {
    pub request_id: String,
    pub task_id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
}

/// Permission decision from user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionDecision {
    pub behavior: String, // "allow" or "deny"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IPCResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<serde_json::Value>,
}

impl IPCResponse {
    pub fn success(data: impl Serialize) -> Self {
        Self {
            success: true,
            message: None,
            data: Some(serde_json::to_value(data).unwrap_or(serde_json::Value::Null)),
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: Some(message.into()),
            data: None,
        }
    }

    pub fn ok(message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: Some(message.into()),
            data: None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TaskInfo {
    pub id: String,
    pub name: String,
    pub status: String,
    pub worktree_path: String,
    pub branch: String,
    pub repository: String,
}

/// Global pending permissions (needed for Tauri commands to respond)
static PENDING_PERMISSIONS: std::sync::OnceLock<PendingPermissions> = std::sync::OnceLock::new();

fn get_pending_permissions() -> &'static PendingPermissions {
    PENDING_PERMISSIONS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

/// Respond to a pending permission request (called from Tauri command)
pub fn respond_to_permission(request_id: &str, decision: PermissionDecision) -> bool {
    let pending = get_pending_permissions();
    let sender = {
        let mut map = pending.lock().unwrap();
        map.remove(request_id)
    };

    if let Some(sender) = sender {
        sender.send(decision).is_ok()
    } else {
        false
    }
}

pub struct IPCServer {
    db: Arc<Database>,
    claude: Arc<ClaudeProcessService>,
    app_handle: AppHandle,
}

impl IPCServer {
    pub fn new(db: Arc<Database>, claude: Arc<ClaudeProcessService>, app_handle: AppHandle) -> Self {
        Self {
            db,
            claude,
            app_handle,
        }
    }

    pub fn start(self) -> Result<()> {
        let listener = TcpListener::bind(format!("127.0.0.1:{}", IPC_PORT))
            .map_err(|e| crate::error::AppError::Other(format!("Failed to bind IPC server: {}", e)))?;

        eprintln!("IPC server listening on port {}", IPC_PORT);

        thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        let db = Arc::clone(&self.db);
                        let claude = Arc::clone(&self.claude);
                        let app_handle = self.app_handle.clone();

                        thread::spawn(move || {
                            if let Err(e) = handle_client(stream, db, claude, app_handle) {
                                eprintln!("IPC client error: {}", e);
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("IPC connection error: {}", e);
                    }
                }
            }
        });

        Ok(())
    }
}

fn handle_client(
    mut stream: TcpStream,
    db: Arc<Database>,
    claude: Arc<ClaudeProcessService>,
    app_handle: AppHandle,
) -> Result<()> {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    reader.read_line(&mut line)?;

    let command = match serde_json::from_str::<IPCCommand>(&line) {
        Ok(cmd) => cmd,
        Err(e) => {
            let response = IPCResponse::error(format!("Invalid command: {}", e));
            let response_json = serde_json::to_string(&response).unwrap_or_default();
            stream.write_all(response_json.as_bytes())?;
            stream.write_all(b"\n")?;
            stream.flush()?;
            return Ok(());
        }
    };

    // Handle permission requests specially - they need to block until user responds
    if let IPCCommand::PermissionRequest {
        request_id,
        task_id,
        tool_name,
        tool_input,
    } = command
    {
        return handle_permission_request(
            stream,
            &db,
            &app_handle,
            request_id,
            task_id,
            tool_name,
            tool_input,
        );
    }

    // Handle other commands normally
    let response = process_command(command, &db, &claude, &app_handle);

    let response_json = serde_json::to_string(&response).unwrap_or_else(|_| {
        r#"{"success":false,"message":"Failed to serialize response"}"#.to_string()
    });

    stream.write_all(response_json.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()?;

    Ok(())
}

fn handle_permission_request(
    mut stream: TcpStream,
    db: &Arc<Database>,
    app_handle: &AppHandle,
    request_id: String,
    task_id: String,
    tool_name: String,
    tool_input: serde_json::Value,
) -> Result<()> {
    // Check if permission prompting is enabled in settings
    let prompt_for_permissions = db
        .get_setting("prompt_for_permissions")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    // If permissions are not prompted, auto-approve
    if !prompt_for_permissions {
        let hook_response = serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Auto-approved (prompt_for_permissions disabled)"
            }
        });

        let response_json = serde_json::to_string(&hook_response).unwrap_or_default();
        stream.write_all(response_json.as_bytes())?;
        stream.write_all(b"\n")?;
        stream.flush()?;
        return Ok(());
    }

    // Create a channel for receiving the user's decision
    let (sender, receiver) = std::sync::mpsc::channel::<PermissionDecision>();

    // Store the sender in pending permissions
    {
        let pending = get_pending_permissions();
        let mut map = pending.lock().unwrap();
        map.insert(request_id.clone(), sender);
    }

    // Emit event to frontend
    let event = PermissionRequestEvent {
        request_id: request_id.clone(),
        task_id,
        tool_name,
        tool_input,
    };
    let _ = app_handle.emit("permission-request", event);

    // Wait for user response (with timeout)
    let decision = match receiver.recv_timeout(std::time::Duration::from_secs(300)) {
        Ok(decision) => decision,
        Err(_) => {
            // Timeout or sender dropped - remove from pending and deny
            let pending = get_pending_permissions();
            let mut map = pending.lock().unwrap();
            map.remove(&request_id);
            PermissionDecision {
                behavior: "deny".to_string(),
                reason: Some("Permission request timed out".to_string()),
            }
        }
    };

    // Build Claude Code PreToolUse hook response format
    let hook_response = serde_json::json!({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision.behavior,
            "permissionDecisionReason": decision.reason.unwrap_or_default()
        }
    });

    let response_json = serde_json::to_string(&hook_response).unwrap_or_default();
    stream.write_all(response_json.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()?;

    Ok(())
}

fn process_command(
    command: IPCCommand,
    db: &Arc<Database>,
    claude: &Arc<ClaudeProcessService>,
    app_handle: &AppHandle,
) -> IPCResponse {
    match command {
        IPCCommand::List => handle_list(db),
        IPCCommand::Status { task_id } => handle_status(db, &task_id),
        IPCCommand::Takeover { task_id } => handle_takeover(db, claude, app_handle, &task_id),
        IPCCommand::Handback { task_id, prompt } => {
            handle_handback(db, claude, app_handle, &task_id, prompt)
        }
        // Permission requests are handled separately in handle_client
        IPCCommand::PermissionRequest { .. } => {
            IPCResponse::error("Permission requests should be handled separately")
        }
    }
}

fn handle_list(db: &Arc<Database>) -> IPCResponse {
    match db.get_all_tasks() {
        Ok(tasks) => {
            let task_infos: Vec<TaskInfo> = tasks
                .into_iter()
                .map(|t| TaskInfo {
                    id: t.id,
                    name: t.name,
                    status: t.status.as_str().to_string(),
                    worktree_path: t.worktree_path,
                    branch: t.branch,
                    repository: t.repository_path,
                })
                .collect();
            IPCResponse::success(task_infos)
        }
        Err(e) => IPCResponse::error(format!("Failed to list tasks: {}", e)),
    }
}

fn handle_status(db: &Arc<Database>, task_id: &str) -> IPCResponse {
    match db.get_task(task_id) {
        Ok(Some(task)) => IPCResponse::success(TaskInfo {
            id: task.id,
            name: task.name,
            status: task.status.as_str().to_string(),
            worktree_path: task.worktree_path,
            branch: task.branch,
            repository: task.repository_path,
        }),
        Ok(None) => IPCResponse::error(format!("Task not found: {}", task_id)),
        Err(e) => IPCResponse::error(format!("Failed to get task: {}", e)),
    }
}

fn handle_takeover(
    db: &Arc<Database>,
    claude: &Arc<ClaudeProcessService>,
    app_handle: &AppHandle,
    task_id: &str,
) -> IPCResponse {
    // Get the task
    let task = match db.get_task(task_id) {
        Ok(Some(t)) => t,
        Ok(None) => return IPCResponse::error(format!("Task not found: {}", task_id)),
        Err(e) => return IPCResponse::error(format!("Failed to get task: {}", e)),
    };

    // Stop the Claude process if running
    if task.status == TaskStatus::Running {
        if let Err(e) = claude.stop(task_id) {
            return IPCResponse::error(format!("Failed to stop process: {}", e));
        }
    }

    // Update status to manual_control
    if let Err(e) = db.update_task_status(task_id, TaskStatus::ManualControl) {
        return IPCResponse::error(format!("Failed to update status: {}", e));
    }

    // Emit status change event
    let _ = app_handle.emit(
        "task-status",
        serde_json::json!({
            "task_id": task_id,
            "status": "manual_control"
        }),
    );

    IPCResponse::success(serde_json::json!({
        "message": format!("Task '{}' is now in manual control mode", task.name),
        "worktree_path": task.worktree_path,
        "branch": task.branch,
        "hint": format!("cd {}", task.worktree_path)
    }))
}

fn handle_handback(
    db: &Arc<Database>,
    claude: &Arc<ClaudeProcessService>,
    app_handle: &AppHandle,
    task_id: &str,
    prompt: Option<String>,
) -> IPCResponse {
    // Get the task
    let task = match db.get_task(task_id) {
        Ok(Some(t)) => t,
        Ok(None) => return IPCResponse::error(format!("Task not found: {}", task_id)),
        Err(e) => return IPCResponse::error(format!("Failed to get task: {}", e)),
    };

    // Check if task is in manual control mode
    if task.status != TaskStatus::ManualControl {
        return IPCResponse::error(format!(
            "Task is not in manual control mode (current status: {})",
            task.status.as_str()
        ));
    }

    // Determine the prompt to use
    let resume_prompt = prompt.unwrap_or_else(|| {
        "Continue working on the task. Check for any changes that were made manually and incorporate them.".to_string()
    });

    // Start Claude process (continue conversation since we're resuming)
    match claude.start(
        app_handle.clone(),
        Arc::clone(db),
        task_id,
        &task.worktree_path,
        &resume_prompt,
        true, // Continue conversation for handback
    ) {
        Ok(_) => {
            // Update status to running
            let _ = db.update_task_status(task_id, TaskStatus::Running);

            // Emit status change event
            let _ = app_handle.emit(
                "task-status",
                serde_json::json!({
                    "task_id": task_id,
                    "status": "running"
                }),
            );

            IPCResponse::ok(format!(
                "Task '{}' has been handed back to Claude",
                task.name
            ))
        }
        Err(e) => IPCResponse::error(format!("Failed to restart Claude: {}", e)),
    }
}

/// Get the IPC port for CLI to connect to
pub fn get_ipc_port() -> u16 {
    IPC_PORT
}
