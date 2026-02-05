use crate::db::Database;
use crate::error::Result;
use crate::events::emit_agent_updated;
use crate::models::AgentStatus;
use crate::services::ClaudeProcessService;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};
use directories::BaseDirs;

const IPC_PORT: u16 = if cfg!(debug_assertions) { 19533 } else { 19532 };

/// Pending permission requests waiting for user response
type PendingPermissions = Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<PermissionDecision>>>>;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
pub enum IPCCommand {
    #[serde(rename = "list")]
    List,
    #[serde(rename = "status")]
    Status { agent_id: String },
    #[serde(rename = "takeover")]
    Takeover { agent_id: String },
    #[serde(rename = "handback")]
    Handback {
        agent_id: String,
        prompt: Option<String>,
    },
    /// Permission request from Claude Code hook
    #[serde(rename = "permission_request")]
    PermissionRequest {
        request_id: String,
        #[serde(alias = "task_id")] // Claude Code sends task_id, we use it as agent_id
        agent_id: String,
        tool_name: String,
        tool_input: serde_json::Value,
    },
}

/// Permission request event sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct PermissionRequestEvent {
    pub request_id: String,
    pub agent_id: String,
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
pub struct AgentInfo {
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

/// Info about a permission request that timed out while waiting for user response
#[derive(Debug, Clone, Serialize)]
pub struct TimedOutRequest {
    pub agent_id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
}

/// Storage for timed-out requests (request_id -> info)
/// When user responds to these, we need to restart Claude instead of sending through channel
type TimedOutRequests = Arc<Mutex<HashMap<String, TimedOutRequest>>>;
static TIMED_OUT_REQUESTS: std::sync::OnceLock<TimedOutRequests> = std::sync::OnceLock::new();

fn get_timed_out_requests() -> &'static TimedOutRequests {
    TIMED_OUT_REQUESTS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

/// Pre-approved permission (approved after timeout, waiting for Claude to re-request)
#[derive(Debug, Clone)]
pub struct PreApprovedPermission {
    pub agent_id: String,
    pub tool_name: String,
    pub approved_at: std::time::Instant,
}

/// Storage for pre-approved permissions
/// These are auto-approved when Claude re-requests them after restart
type PreApprovedPermissions = Arc<Mutex<Vec<PreApprovedPermission>>>;
static PRE_APPROVED_PERMISSIONS: std::sync::OnceLock<PreApprovedPermissions> = std::sync::OnceLock::new();

fn get_pre_approved_permissions() -> &'static PreApprovedPermissions {
    PRE_APPROVED_PERMISSIONS.get_or_init(|| Arc::new(Mutex::new(Vec::new())))
}

/// Check if a permission was pre-approved (after a timeout)
pub fn check_pre_approved(agent_id: &str, tool_name: &str) -> Option<String> {
    let pre_approved = get_pre_approved_permissions();
    let mut list = pre_approved.lock().unwrap();

    // Clean up old pre-approvals (older than 5 minutes)
    let now = std::time::Instant::now();
    list.retain(|p| now.duration_since(p.approved_at).as_secs() < 300);

    // Find and remove matching pre-approval
    if let Some(pos) = list.iter().position(|p| p.agent_id == agent_id && p.tool_name == tool_name) {
        let approval = list.remove(pos);
        return Some(format!("Pre-approved after timeout: {}", approval.tool_name));
    }
    None
}

/// Add a pre-approved permission
pub fn add_pre_approved(agent_id: &str, tool_name: &str) {
    let pre_approved = get_pre_approved_permissions();
    let mut list = pre_approved.lock().unwrap();
    list.push(PreApprovedPermission {
        agent_id: agent_id.to_string(),
        tool_name: tool_name.to_string(),
        approved_at: std::time::Instant::now(),
    });
}

/// Get a timed-out request by ID (removes it from storage)
pub fn take_timed_out_request(request_id: &str) -> Option<TimedOutRequest> {
    let timed_out = get_timed_out_requests();
    let mut map = timed_out.lock().unwrap();
    map.remove(request_id)
}

/// Result of responding to a permission request
#[derive(Debug, Clone, Serialize)]
pub struct PermissionResponseResult {
    /// Whether the response was successfully sent
    pub sent: bool,
    /// If this was a timed-out request that was approved, contains agent info for restart
    pub restart_task: Option<TimedOutRequest>,
}

/// Respond to a pending permission request (called from Tauri command)
/// Returns info about whether to restart the task (for timed-out approvals)
pub fn respond_to_permission(request_id: &str, decision: PermissionDecision) -> PermissionResponseResult {
    // First, try to send through the active channel (request hasn't timed out yet)
    let pending = get_pending_permissions();
    let sender = {
        let mut map = pending.lock().unwrap();
        map.remove(request_id)
    };

    if let Some(sender) = sender {
        let sent = sender.send(decision).is_ok();
        return PermissionResponseResult { sent, restart_task: None };
    }

    // No active channel - check if this is a timed-out request
    if let Some(timed_out_req) = take_timed_out_request(request_id) {
        if decision.behavior == "allow" {
            // User approved after timeout - add pre-approval for when Claude restarts
            info!(
                "[{}] User approved timed-out permission for {}. Will auto-approve on restart.",
                timed_out_req.agent_id, timed_out_req.tool_name
            );
            add_pre_approved(&timed_out_req.agent_id, &timed_out_req.tool_name);
            return PermissionResponseResult {
                sent: true,
                restart_task: Some(timed_out_req),
            };
        } else {
            // User denied after timeout - just dismiss, agent stays stopped
            info!(
                "[{}] User denied timed-out permission for {}. Agent remains stopped.",
                timed_out_req.agent_id, timed_out_req.tool_name
            );
            return PermissionResponseResult { sent: true, restart_task: None };
        }
    }

    // Request not found in either storage
    PermissionResponseResult { sent: false, restart_task: None }
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
        // Try to bind, and if port is in use, try to kill stale process and retry
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", IPC_PORT)) {
            Ok(l) => l,
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
                warn!("IPC port {} already in use, attempting to recover...", IPC_PORT);

                // Try to find and kill the process using this port
                if let Ok(output) = std::process::Command::new("lsof")
                    .args(["-ti", &format!(":{}", IPC_PORT)])
                    .output()
                {
                    let pids = String::from_utf8_lossy(&output.stdout);
                    for pid_str in pids.lines() {
                        if let Ok(pid) = pid_str.trim().parse::<i32>() {
                            info!("Killing stale process {} on port {}", pid, IPC_PORT);
                            unsafe {
                                libc::kill(pid, libc::SIGTERM);
                            }
                        }
                    }

                    // Wait a moment for the port to be released
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }

                // Try again
                TcpListener::bind(format!("127.0.0.1:{}", IPC_PORT))
                    .map_err(|e| crate::error::AppError::Other(format!("Failed to bind IPC server after recovery attempt: {}", e)))?
            }
            Err(e) => {
                return Err(crate::error::AppError::Other(format!("Failed to bind IPC server: {}", e)));
            }
        };

        info!("IPC server listening on port {}", IPC_PORT);

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
    info!("[IPC] Received connection");
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    reader.read_line(&mut line)?;

    info!("[IPC] Received command: {}", line.trim());

    let command = match serde_json::from_str::<IPCCommand>(&line) {
        Ok(cmd) => cmd,
        Err(e) => {
            warn!("[IPC] Failed to parse command: {}", e);
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
        agent_id,
        tool_name,
        tool_input,
    } = command
    {
        info!("[IPC] Handling permission request: agent_id={}, tool_name={}", agent_id, tool_name);
        return handle_permission_request(
            stream,
            &db,
            &claude,
            &app_handle,
            request_id,
            agent_id,
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

// Permission timeout must be less than Claude Code's hook timeout (60s)
// to ensure we respond before Claude times out and potentially continues
const PERMISSION_TIMEOUT_SECS: u64 = 55;

fn handle_permission_request(
    mut stream: TcpStream,
    db: &Arc<Database>,
    claude: &Arc<ClaudeProcessService>,
    app_handle: &AppHandle,
    request_id: String,
    agent_id: String,
    tool_name: String,
    tool_input: serde_json::Value,
) -> Result<()> {
    // Clone values needed after the event emission (which moves agent_id, tool_input)
    let agent_id_for_timeout = agent_id.clone();
    let request_id_for_timeout = request_id.clone();
    let tool_name_for_timeout = tool_name.clone();
    let tool_input_for_timeout = tool_input.clone();

    // Check for pre-approved permission (approved after a previous timeout)
    if let Some(reason) = check_pre_approved(&agent_id, &tool_name) {
        info!("[{}] Auto-approving pre-approved permission: {} - {}", agent_id, tool_name, reason);
        let hook_response = serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": reason
            }
        });

        let response_json = serde_json::to_string(&hook_response).unwrap_or_default();
        stream.write_all(response_json.as_bytes())?;
        stream.write_all(b"\n")?;
        stream.flush()?;
        return Ok(());
    }

    // Check if permission prompting is enabled in settings
    let setting_value = db.get_setting("prompt_for_permissions").ok().flatten();
    info!("[IPC] prompt_for_permissions setting value: {:?}", setting_value);

    let prompt_for_permissions = setting_value
        .map(|v| v == "true")
        .unwrap_or(false);

    info!("[IPC] prompt_for_permissions enabled: {}", prompt_for_permissions);

    // If permissions are not prompted, auto-approve
    if !prompt_for_permissions {
        info!("[IPC] Auto-approving permission (prompts disabled)");
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

    // Check if this is a read-only operation that can be auto-approved
    if let Some(reason) = is_safe_read_only_operation(&tool_name, &tool_input) {
        info!("[{}] Auto-approving read-only operation: {} - {}", agent_id, tool_name, reason);
        let hook_response = serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": reason
            }
        });

        let response_json = serde_json::to_string(&hook_response).unwrap_or_default();
        stream.write_all(response_json.as_bytes())?;
        stream.write_all(b"\n")?;
        stream.flush()?;
        return Ok(());
    }

    // Check if auto_accept_edits is enabled for this agent (Write/Edit auto-approve)
    {
        let agent = db.get_agent(&agent_id).ok().flatten();
        if let Some(ref a) = agent {
            if a.auto_accept_edits && (tool_name == "Write" || tool_name == "Edit" || tool_name == "NotebookEdit") {
                info!("[{}] Auto-approving edit (auto_accept_edits enabled): {}", agent_id, tool_name);
                let hook_response = serde_json::json!({
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "allow",
                        "permissionDecisionReason": "Auto-approved (auto_accept_edits enabled for task)"
                    }
                });

                let response_json = serde_json::to_string(&hook_response).unwrap_or_default();
                stream.write_all(response_json.as_bytes())?;
                stream.write_all(b"\n")?;
                stream.flush()?;
                return Ok(());
            }
        }

        let working_dir = agent.map(|a| a.worktree_path.clone());
        if let Some(reason) = is_allowed_by_claude_settings(&tool_name, &tool_input, working_dir.as_deref()) {
            info!("[{}] Auto-approving via Claude settings: {} - {}", agent_id, tool_name, reason);
            let hook_response = serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": reason
                }
            });

            let response_json = serde_json::to_string(&hook_response).unwrap_or_default();
            stream.write_all(response_json.as_bytes())?;
            stream.write_all(b"\n")?;
            stream.flush()?;
            return Ok(());
        }
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
        agent_id,
        tool_name,
        tool_input,
    };
    if let Err(e) = app_handle.emit("permission-request", &event) {
        warn!("Failed to emit permission-request event: {}", e);
    } else {
        info!("Emitted permission-request event: request_id={}", request_id);
    }

    // Wait for user response (with timeout)
    // Timeout must be less than Claude Code's 60s hook timeout
    let decision = match receiver.recv_timeout(std::time::Duration::from_secs(PERMISSION_TIMEOUT_SECS)) {
        Ok(decision) => decision,
        Err(_) => {
            // Timeout - remove from pending channels
            let pending = get_pending_permissions();
            {
                let mut map = pending.lock().unwrap();
                map.remove(&request_id_for_timeout);
            }

            // Store as timed-out request so we can handle late responses
            {
                let timed_out = get_timed_out_requests();
                let mut map = timed_out.lock().unwrap();
                map.insert(request_id_for_timeout.clone(), TimedOutRequest {
                    agent_id: agent_id_for_timeout.clone(),
                    tool_name: tool_name_for_timeout.clone(),
                    tool_input: tool_input_for_timeout,
                });
            }

            // CRITICAL: Stop the Claude process to prevent it from continuing
            // without approval. Claude Code has a 60s timeout and may continue
            // executing if we don't respond in time.
            warn!(
                "[{}] Permission request timed out after {}s, stopping agent. User can still approve and agent will resume.",
                agent_id_for_timeout, PERMISSION_TIMEOUT_SECS
            );

            if let Err(e) = claude.stop(&agent_id_for_timeout) {
                warn!("[{}] Failed to stop agent after permission timeout: {}", agent_id_for_timeout, e);
            }

            // Update agent status to idle (paused, waiting for user)
            if let Err(e) = db.update_agent_status(&agent_id_for_timeout, AgentStatus::Idle) {
                warn!("[{}] Failed to update agent status after permission timeout: {}", agent_id_for_timeout, e);
            }

            // Emit unified agent update event
            emit_agent_updated(&app_handle, &db, &agent_id_for_timeout);

            let _ = app_handle.emit("permission-timeout", serde_json::json!({
                "agent_id": agent_id_for_timeout,
                "request_id": request_id_for_timeout,
                "tool_name": tool_name_for_timeout,
                "timed_out": true,
                "message": format!("Agent paused after {}s. Approve to continue.", PERMISSION_TIMEOUT_SECS)
            }));

            // Return deny to close the IPC connection gracefully
            // The permission request stays visible in UI for user to respond later
            PermissionDecision {
                behavior: "deny".to_string(),
                reason: Some("Timed out - agent paused, awaiting user response".to_string()),
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
        IPCCommand::Status { agent_id } => handle_status(db, &agent_id),
        IPCCommand::Takeover { agent_id } => handle_takeover(db, claude, app_handle, &agent_id),
        IPCCommand::Handback { agent_id, prompt } => {
            handle_handback(db, claude, app_handle, &agent_id, prompt)
        }
        // Permission requests are handled separately in handle_client
        IPCCommand::PermissionRequest { .. } => {
            IPCResponse::error("Permission requests should be handled separately")
        }
    }
}

fn handle_list(db: &Arc<Database>) -> IPCResponse {
    match db.get_all_agents() {
        Ok(agents) => {
            let agent_infos: Vec<AgentInfo> = agents
                .into_iter()
                .map(|a| AgentInfo {
                    id: a.id,
                    name: a.name,
                    status: a.status.as_str().to_string(),
                    worktree_path: a.worktree_path,
                    branch: a.branch,
                    repository: a.repository_path,
                })
                .collect();
            IPCResponse::success(agent_infos)
        }
        Err(e) => IPCResponse::error(format!("Failed to list agents: {}", e)),
    }
}

fn handle_status(db: &Arc<Database>, agent_id: &str) -> IPCResponse {
    match db.get_agent(agent_id) {
        Ok(Some(agent)) => IPCResponse::success(AgentInfo {
            id: agent.id,
            name: agent.name,
            status: agent.status.as_str().to_string(),
            worktree_path: agent.worktree_path,
            branch: agent.branch,
            repository: agent.repository_path,
        }),
        Ok(None) => IPCResponse::error(format!("Agent not found: {}", agent_id)),
        Err(e) => IPCResponse::error(format!("Failed to get agent: {}", e)),
    }
}

fn handle_takeover(
    db: &Arc<Database>,
    claude: &Arc<ClaudeProcessService>,
    app_handle: &AppHandle,
    agent_id: &str,
) -> IPCResponse {
    // Get the agent
    let agent = match db.get_agent(agent_id) {
        Ok(Some(a)) => a,
        Ok(None) => return IPCResponse::error(format!("Agent not found: {}", agent_id)),
        Err(e) => return IPCResponse::error(format!("Failed to get agent: {}", e)),
    };

    // Stop the Claude process if running
    if agent.status == AgentStatus::Running {
        if let Err(e) = claude.stop(agent_id) {
            return IPCResponse::error(format!("Failed to stop process: {}", e));
        }
    }

    // Update status to manual_control
    if let Err(e) = db.update_agent_status(agent_id, AgentStatus::ManualControl) {
        return IPCResponse::error(format!("Failed to update status: {}", e));
    }

    // Emit status change event
    let _ = app_handle.emit(
        "agent-status",
        serde_json::json!({
            "agent_id": agent_id,
            "status": "manual_control"
        }),
    );

    IPCResponse::success(serde_json::json!({
        "message": format!("Agent '{}' is now in manual control mode", agent.name),
        "worktree_path": agent.worktree_path,
        "branch": agent.branch,
        "hint": format!("cd {}", agent.worktree_path)
    }))
}

fn handle_handback(
    db: &Arc<Database>,
    claude: &Arc<ClaudeProcessService>,
    app_handle: &AppHandle,
    agent_id: &str,
    prompt: Option<String>,
) -> IPCResponse {
    // Get the agent
    let agent = match db.get_agent(agent_id) {
        Ok(Some(a)) => a,
        Ok(None) => return IPCResponse::error(format!("Agent not found: {}", agent_id)),
        Err(e) => return IPCResponse::error(format!("Failed to get agent: {}", e)),
    };

    // Check if agent is in manual control mode
    if agent.status != AgentStatus::ManualControl {
        return IPCResponse::error(format!(
            "Agent is not in manual control mode (current status: {})",
            agent.status.as_str()
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
        agent_id,
        &agent.worktree_path,
        &resume_prompt,
        true, // Continue conversation for handback
    ) {
        Ok(_) => {
            // Update status to running
            let _ = db.update_agent_status(agent_id, AgentStatus::Running);

            // Emit status change event
            let _ = app_handle.emit(
                "agent-status",
                serde_json::json!({
                    "agent_id": agent_id,
                    "status": "running"
                }),
            );

            IPCResponse::ok(format!(
                "Agent '{}' has been handed back to Claude",
                agent.name
            ))
        }
        Err(e) => IPCResponse::error(format!("Failed to restart Claude: {}", e)),
    }
}

/// Get the IPC port for CLI to connect to
pub fn get_ipc_port() -> u16 {
    IPC_PORT
}

/// Check if a tool operation is a safe read-only operation that can be auto-approved.
/// Returns Some(reason) if safe to auto-approve, None if it requires user approval.
fn is_safe_read_only_operation(tool_name: &str, tool_input: &serde_json::Value) -> Option<String> {
    match tool_name {
        // Glob, Grep, Task, and Todo tools are always safe
        "Glob" | "Grep" => Some(format!("{} is a read-only search operation", tool_name)),
        "Task" => Some("Task (agent spawn) is a safe operation".to_string()),
        "TodoWrite" | "TodoRead" | "TodoClear" => Some(format!("{} is a safe todo operation", tool_name)),

        // Read is safe unless it's a sensitive file
        "Read" => {
            if let Some(file_path) = tool_input.get("file_path").and_then(|v| v.as_str()) {
                if is_sensitive_file(file_path) {
                    None // Require approval for sensitive files
                } else {
                    Some("Read is a read-only operation".to_string())
                }
            } else {
                None // No file path, require approval
            }
        }

        // Bash commands need to be checked for read-only commands
        "Bash" => {
            if let Some(command) = tool_input.get("command").and_then(|v| v.as_str()) {
                if is_read_only_bash_command(command) {
                    Some(format!("Read-only bash command: {}", truncate_str(command, 50)))
                } else {
                    None // Not a read-only command, require approval
                }
            } else {
                None
            }
        }

        // All other tools require approval
        _ => None,
    }
}

/// Check if a file path is sensitive and should require approval
fn is_sensitive_file(file_path: &str) -> bool {
    let path_lower = file_path.to_lowercase();
    let file_name = std::path::Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Check for .env files
    if file_name.starts_with(".env") || file_name == "env" {
        return true;
    }

    // Check for common sensitive file patterns
    let sensitive_patterns = [
        ".env",
        "credentials",
        "secrets",
        ".secret",
        "password",
        ".pem",
        ".key",
        "id_rsa",
        "id_ed25519",
        ".ssh/",
        "aws/credentials",
        ".netrc",
        ".npmrc", // Can contain auth tokens
        ".pypirc",
        "token",
    ];

    for pattern in sensitive_patterns {
        if path_lower.contains(pattern) {
            return true;
        }
    }

    false
}

/// Check if a bash command is read-only (doesn't modify anything)
fn is_read_only_bash_command(command: &str) -> bool {
    let command_trimmed = command.trim();

    // Get the first word (the actual command)
    let first_word = command_trimmed
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();

    // Also check for commands after pipes, &&, ||, ;
    // If ANY command in the chain is not read-only, reject
    let dangerous_chars = ['>', '|', '&', ';', '`', '$', '('];

    // Simple commands without pipes/redirects are easiest to validate
    // For complex commands, be conservative and require approval
    if command_trimmed.chars().any(|c| dangerous_chars.contains(&c)) {
        // Exception: allow simple pipes to grep, head, tail, wc, sort, etc.
        if is_safe_piped_command(command_trimmed) {
            return true;
        }
        return false;
    }

    // List of known read-only commands
    let read_only_commands = [
        "ls", "cat", "head", "tail", "less", "more",
        "grep", "egrep", "fgrep", "rg", "ag",
        "find", "locate", "which", "whereis", "type",
        "wc", "sort", "uniq", "diff", "cmp",
        "file", "stat", "du", "df",
        "pwd", "echo", "printf", "date", "whoami", "id",
        "env", "printenv",
        "git status", "git log", "git diff", "git show", "git branch", "git remote",
        "ps", "top", "htop",
        "tree", "exa", "eza", "bat",
        "jq", "yq", // JSON/YAML query tools
        "curl", "wget", // These CAN be dangerous but typically used for reading
    ];

    // Check if the command starts with a read-only command
    for ro_cmd in read_only_commands {
        if first_word == ro_cmd || command_trimmed.starts_with(&format!("{} ", ro_cmd)) {
            return true;
        }
    }

    false
}

/// Check if a piped command is safe (all commands in pipeline are read-only)
fn is_safe_piped_command(command: &str) -> bool {
    // Only handle simple pipes for now
    if !command.contains('|') {
        return false;
    }

    // Don't allow output redirection
    if command.contains('>') {
        return false;
    }

    // Don't allow command substitution or subshells
    if command.contains('`') || command.contains("$(") {
        return false;
    }

    // Split by pipe and check each command
    let safe_pipe_commands = [
        "grep", "egrep", "fgrep", "rg", "ag",
        "head", "tail", "sort", "uniq", "wc",
        "cut", "awk", "sed", // sed without -i is read-only
        "tr", "tee", "xargs",
        "jq", "yq",
    ];

    for part in command.split('|') {
        let part_trimmed = part.trim();
        let first_word = part_trimmed
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_lowercase();

        // First command can be any read-only command
        let is_first = part_trimmed == command.split('|').next().unwrap_or("").trim();

        if is_first {
            // Use the full read-only check for the first command
            if !is_read_only_bash_command(part_trimmed.split('|').next().unwrap_or("")) {
                // But also allow commands that start with cat, ls, find, etc.
                let allowed_first = ["ls", "cat", "find", "grep", "rg", "ag", "git", "echo", "ps"];
                if !allowed_first.iter().any(|&cmd| first_word == cmd) {
                    return false;
                }
            }
        } else {
            // Subsequent commands must be safe pipe commands
            if !safe_pipe_commands.iter().any(|&cmd| first_word == cmd) {
                return false;
            }
        }
    }

    true
}

/// Check if a tool call is allowed by the user's Claude Code settings.
/// Reads permissions.allow from ~/.claude/settings.json and project .claude/settings.local.json.
/// Returns Some(reason) if allowed, None if not.
fn is_allowed_by_claude_settings(
    tool_name: &str,
    tool_input: &serde_json::Value,
    working_dir: Option<&str>,
) -> Option<String> {
    let mut allowed_rules: Vec<String> = Vec::new();

    // Read global settings
    if let Some(base_dirs) = BaseDirs::new() {
        let global_settings = base_dirs.home_dir().join(".claude").join("settings.json");
        if let Ok(content) = std::fs::read_to_string(&global_settings) {
            if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(allow) = settings
                    .get("permissions")
                    .and_then(|p| p.get("allow"))
                    .and_then(|a| a.as_array())
                {
                    for rule in allow {
                        if let Some(s) = rule.as_str() {
                            allowed_rules.push(s.to_string());
                        }
                    }
                }
            }
        }
    }

    // Read project-level settings
    if let Some(dir) = working_dir {
        // Check the worktree dir and parents for .claude/settings.local.json
        let mut path = std::path::PathBuf::from(dir);
        for _ in 0..5 {
            let project_settings = path.join(".claude").join("settings.local.json");
            if let Ok(content) = std::fs::read_to_string(&project_settings) {
                if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(allow) = settings
                        .get("permissions")
                        .and_then(|p| p.get("allow"))
                        .and_then(|a| a.as_array())
                    {
                        for rule in allow {
                            if let Some(s) = rule.as_str() {
                                allowed_rules.push(s.to_string());
                            }
                        }
                    }
                }
                break; // Found a settings file, stop searching
            }
            if !path.pop() {
                break;
            }
        }
    }

    if allowed_rules.is_empty() {
        return None;
    }

    // Build the tool descriptor to match against rules
    // Format: "ToolName" or "ToolName(argument)"
    let tool_arg = get_tool_match_argument(tool_name, tool_input);

    for rule in &allowed_rules {
        if matches_permission_rule(rule, tool_name, tool_arg.as_deref()) {
            return Some(format!("Allowed by Claude settings: {}", rule));
        }
    }

    None
}

/// Extract the argument used for permission matching from a tool input.
/// For Bash: the command string. For Read/Write/Edit: file_path. For WebFetch: domain. etc.
fn get_tool_match_argument(tool_name: &str, tool_input: &serde_json::Value) -> Option<String> {
    match tool_name {
        "Bash" => tool_input.get("command").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "Read" | "Write" | "Edit" => tool_input.get("file_path").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "Glob" => tool_input.get("pattern").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "Grep" => tool_input.get("pattern").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "WebFetch" => {
            // WebFetch rules use "domain:example.com"
            tool_input.get("url").and_then(|v| v.as_str()).map(|url| {
                // Extract domain from URL: strip protocol, take host part
                let without_proto = url
                    .strip_prefix("https://").or_else(|| url.strip_prefix("http://"))
                    .unwrap_or(url);
                let host = without_proto.split('/').next().unwrap_or(without_proto);
                let host = host.split(':').next().unwrap_or(host); // strip port
                format!("domain:{}", host)
            })
        }
        _ => None,
    }
}

/// Check if a permission rule matches the tool call.
/// Rules are in format: "ToolName" (matches all), "ToolName(pattern)" where pattern uses * as wildcard.
fn matches_permission_rule(rule: &str, tool_name: &str, tool_arg: Option<&str>) -> bool {
    // Simple case: rule is just the tool name (no parens) → matches all calls to that tool
    if rule == tool_name {
        return true;
    }

    // Check format: ToolName(pattern)
    if let Some(paren_start) = rule.find('(') {
        let rule_tool = &rule[..paren_start];
        if rule_tool != tool_name {
            return false;
        }

        // Extract pattern between parens
        if rule.ends_with(')') {
            let pattern = &rule[paren_start + 1..rule.len() - 1];

            if let Some(arg) = tool_arg {
                return glob_match(pattern, arg);
            }
            return false;
        }
    }

    false
}

/// Simple glob matching: * matches any substring, ** matches any path including separators.
/// The pattern from Claude settings uses * for wildcards.
fn glob_match(pattern: &str, text: &str) -> bool {
    // Handle the common case: pattern ends with :* (e.g., "git:*" matches "git status")
    // Claude uses colon as separator between command prefix and args
    if let Some(prefix) = pattern.strip_suffix(":*") {
        // Match if text starts with the prefix followed by space or is exactly the prefix
        return text == prefix || text.starts_with(&format!("{} ", prefix));
    }

    // Handle pattern ending with just *
    if let Some(prefix) = pattern.strip_suffix('*') {
        if !prefix.contains('*') {
            return text.starts_with(prefix);
        }
    }

    // Handle ** for path matching (e.g., /path/**)
    if pattern.contains("**") {
        let parts: Vec<&str> = pattern.split("**").collect();
        if parts.len() == 2 {
            return text.starts_with(parts[0]) && (parts[1].is_empty() || text.ends_with(parts[1]));
        }
    }

    // Exact match
    pattern == text
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}...", &s[..max_len])
    } else {
        s.to_string()
    }
}
