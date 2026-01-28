use crate::db::Database;
use crate::error::{AppError, Result};
use crate::models::TaskStatus;
use crate::services::output::ParsedOutput;
use crate::services::output_batch::BatchedOutputEmitter;
use crate::services::shell;
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct StatusEvent {
    pub task_id: String,
    pub status: String,
}

/// Description update event
#[derive(Clone, Serialize)]
pub struct DescriptionEvent {
    pub task_id: String,
    pub description: String,
}

/// Claude Code JSON output message types
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
enum ClaudeMessage {
    #[serde(rename = "assistant")]
    Assistant { message: AssistantMessage },
    #[serde(rename = "result")]
    Result {
        result: String,
        cost_usd: Option<f64>,
        input_tokens: Option<i64>,
        output_tokens: Option<i64>,
    },
    #[serde(rename = "system")]
    System { message: String },
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AssistantMessage {
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    #[serde(rename = "tool_use")]
    ToolUse { name: String, input: serde_json::Value },
    #[serde(rename = "tool_result")]
    ToolResult { content: Option<String> },
}

pub struct ClaudeProcessService {
    processes: Arc<Mutex<HashMap<String, u32>>>, // task_id -> pid
    /// Tasks that were intentionally stopped (so monitor thread doesn't set Error status)
    intentionally_stopped: Arc<Mutex<std::collections::HashSet<String>>>,
}

impl ClaudeProcessService {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            intentionally_stopped: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }

    /// Start a Claude Code process in the given worktree with the prompt
    /// If `continue_conversation` is true, uses -c flag to continue the previous conversation
    pub fn start(
        &self,
        app_handle: AppHandle,
        db: Arc<Database>,
        task_id: &str,
        worktree_path: &str,
        prompt: &str,
        continue_conversation: bool,
    ) -> Result<u32> {
        let start_time = Instant::now();
        info!("[{}] Starting Claude process in {}", task_id, worktree_path);

        // Check if already running
        {
            let processes = self.processes.lock().unwrap();
            if processes.contains_key(task_id) {
                return Err(AppError::Process(format!(
                    "Process already running for task {}",
                    task_id
                )));
            }
        }

        // Clear intentionally_stopped flag so the monitor thread for this new
        // process correctly reports completion/error status
        {
            let mut stopped = self.intentionally_stopped.lock().unwrap();
            stopped.remove(task_id);
        }

        // Only clear output if starting fresh (not continuing)
        if !continue_conversation {
            let _ = db.clear_task_output(task_id);
        }

        // Check if we should prompt for permissions or auto-approve
        let prompt_for_permissions = db
            .get_setting("prompt_for_permissions")
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false);

        // Build command with JSON output format for structured activity tracking
        // We wrap Claude in a shell script to ensure:
        // 1. nvm is sourced
        // 2. If .nvmrc exists in the worktree, `nvm use` is run to use the correct Node version
        debug!("[{}] Building Claude command with nvm support...", task_id);

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let home = std::env::var("HOME").unwrap_or_default();

        // Build Claude arguments
        let mut claude_args = Vec::new();
        if continue_conversation {
            claude_args.push("-c".to_string());
        }
        if !prompt_for_permissions {
            claude_args.push("--dangerously-skip-permissions".to_string());
        }
        claude_args.push("--output-format".to_string());
        claude_args.push("stream-json".to_string());
        claude_args.push("--verbose".to_string());
        claude_args.push("-p".to_string());
        // Escape prompt for shell
        let escaped_prompt = prompt.replace("'", "'\\''");
        claude_args.push(format!("'{}'", escaped_prompt));

        let claude_cmd = format!("claude {}", claude_args.join(" "));

        // Build shell script that:
        // 1. Sources nvm
        // 2. Runs `nvm use` if .nvmrc exists in the worktree
        // 3. Executes Claude
        let script = format!(
            r#"
            # Source nvm if available
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

            # If .nvmrc exists in the working directory, use that node version
            if [ -f ".nvmrc" ]; then
                nvm use 2>/dev/null || nvm install 2>/dev/null
            fi

            # Run Claude
            {claude_cmd}
            "#,
            claude_cmd = claude_cmd,
        );

        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-c", &script])
            .current_dir(worktree_path)
            .env("HOME", &home)
            .env("AGENT_COORDINATOR_TASK_ID", task_id)
            .env("MUX_IPC_PORT", super::ipc_server::get_ipc_port().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Also apply the cached shell environment for other tools (PATH, etc.)
        if let Some(env) = shell::get_shell_env() {
            for (key, value) in env {
                // Don't override the ones we explicitly set
                if key != "HOME" && key != "AGENT_COORDINATOR_TASK_ID" && key != "MUX_IPC_PORT" {
                    cmd.env(key, value);
                }
            }
        }

        // Log the full command for debugging
        info!("[{}] Running: claude {} --output-format stream-json --verbose -p \"{}\"",
              task_id,
              if continue_conversation { "-c" } else { "" },
              if prompt.len() > 100 { format!("{}...", &prompt[..100]) } else { prompt.to_string() });
        info!("[{}] Working directory: {}", task_id, worktree_path);

        // Spawn the process
        debug!("[{}] Spawning Claude process...", task_id);
        let spawn_start = Instant::now();
        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Process(format!("Failed to start claude: {}", e)))?;

        let pid = child.id();
        info!("[{}] Claude spawned (PID: {}) in {:?}, total setup: {:?}",
              task_id, pid, spawn_start.elapsed(), start_time.elapsed());

        // Insert into processes map
        {
            let mut processes = self.processes.lock().unwrap();
            processes.insert(task_id.to_string(), pid);
        }

        // Store PID in database for crash recovery
        let _ = db.update_task_status_and_pid(task_id, TaskStatus::Running, Some(pid));

        // Take ownership of stdout and stderr
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Clone for threads
        let task_id_owned = task_id.to_string();

        // Spawn stdout monitoring with decoupled reading and processing
        // This prevents backpressure on the pipe from slowing down Claude
        if let Some(stdout) = stdout {
            let task_id = task_id_owned.clone();
            let task_id_for_reader = task_id.clone();
            let app_handle = app_handle.clone();
            let db = Arc::clone(&db);

            // Create a channel to decouple reading from processing
            // Large buffer to ensure we never block the reader
            let (tx, rx) = std::sync::mpsc::sync_channel::<String>(1000);

            // Shared counters for logging
            let lines_read = Arc::new(AtomicU64::new(0));
            let lines_read_clone = Arc::clone(&lines_read);
            let dropped_lines = Arc::new(AtomicU64::new(0));
            let dropped_lines_clone = Arc::clone(&dropped_lines);

            // Reader thread - ONLY reads from pipe, as fast as possible
            thread::spawn(move || {
                info!("[{}] Stdout reader thread started", task_id_for_reader);
                let start = Instant::now();
                let reader = BufReader::new(stdout);
                let mut count = 0u64;

                for line in reader.lines().map_while(|l| l.ok()) {
                    count += 1;
                    // Non-blocking send - if channel is full, drop the message
                    if tx.try_send(line).is_err() {
                        dropped_lines_clone.fetch_add(1, Ordering::Relaxed);
                    }

                    // Log every 100 lines
                    if count % 100 == 0 {
                        debug!("[{}] Read {} lines from stdout", task_id_for_reader, count);
                    }
                }

                lines_read_clone.store(count, Ordering::Relaxed);
                info!("[{}] Stdout reader finished: {} lines in {:?}",
                      task_id_for_reader, count, start.elapsed());
            });

            // Processor thread - handles JSON parsing and event emission
            thread::spawn(move || {
                info!("[{}] Stdout processor thread started", task_id);
                let start = Instant::now();
                let mut processed = 0u64;
                let emitter = BatchedOutputEmitter::new(app_handle.clone(), task_id.clone());

                while let Ok(line) = rx.recv() {
                    processed += 1;

                    // Try to parse as JSON for structured output
                    if let Ok(msg) = serde_json::from_str::<ClaudeMessage>(&line) {
                        match msg {
                            ClaudeMessage::Assistant { message } => {
                                for block in message.content {
                                    match block {
                                        ContentBlock::Text { text } => {
                                            emitter.emit(ParsedOutput::text(text));
                                        }
                                        ContentBlock::Thinking { thinking } => {
                                            emitter.emit(ParsedOutput::thinking(thinking));
                                        }
                                        ContentBlock::ToolUse { name, input } => {
                                            debug!("[{}] Tool use: {}", task_id, name);
                                            let summary = format_tool_summary(&name, &input);
                                            emitter.emit(ParsedOutput::tool(summary, name.clone(), input.clone()));

                                            // Update description from TodoWrite
                                            if name == "TodoWrite" {
                                                if let Some(description) = extract_description_from_todos(&input) {
                                                    let _ = db.update_task_description(&task_id, &description);
                                                    let desc_event = DescriptionEvent {
                                                        task_id: task_id.clone(),
                                                        description,
                                                    };
                                                    let _ = emitter.app_handle().emit("task-description", desc_event);
                                                }
                                            }
                                        }
                                        ContentBlock::ToolResult { content } => {
                                            if let Some(result) = content {
                                                emitter.emit_tool_result(result);
                                            }
                                        }
                                    }
                                }
                            }
                            ClaudeMessage::Result { cost_usd, input_tokens, output_tokens, .. } => {
                                let cost = cost_usd.unwrap_or(0.0);
                                let input_tok = input_tokens.unwrap_or(0);
                                let output_tok = output_tokens.unwrap_or(0);

                                if cost > 0.0 || input_tok > 0 || output_tok > 0 {
                                    info!("[{}] Result: ${:.4}, {}in/{}out tokens", task_id, cost, input_tok, output_tok);
                                    let _ = db.add_task_cost(&task_id, cost, input_tok, output_tok);
                                    // Emit cost event so frontend can update
                                    let _ = app_handle.emit("task-cost", serde_json::json!({
                                        "task_id": task_id,
                                        "cost_usd": cost,
                                        "input_tokens": input_tok,
                                        "output_tokens": output_tok,
                                    }));
                                    emitter.emit(ParsedOutput::result(format!("Completed (${:.4})", cost)));
                                }
                            }
                            ClaudeMessage::System { message } => {
                                debug!("[{}] System message: {}", task_id, message);
                                emitter.emit(ParsedOutput::system(message));
                            }
                        }
                    } else {
                        // Fallback for non-JSON output
                        emitter.emit(ParsedOutput::stdout(line));
                    }

                    // Log every 100 processed
                    if processed % 100 == 0 {
                        debug!("[{}] Processed {} messages", task_id, processed);
                    }
                }

                let dropped = dropped_lines.load(Ordering::Relaxed);
                if dropped > 0 {
                    warn!("[{}] Dropped {} lines due to backpressure!", task_id, dropped);
                }
                info!("[{}] Stdout processor finished: {} messages in {:?}",
                      task_id, processed, start.elapsed());
            });
        }

        // Spawn stderr monitoring with decoupled reading and processing
        if let Some(stderr) = stderr {
            let task_id = task_id_owned.clone();
            let app_handle = app_handle.clone();

            let (tx, rx) = std::sync::mpsc::sync_channel::<String>(1000);

            // Reader thread
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().map_while(|l| l.ok()) {
                    let _ = tx.try_send(line);
                }
            });

            // Processor thread
            thread::spawn(move || {
                let emitter = BatchedOutputEmitter::new(app_handle, task_id);
                while let Ok(line) = rx.recv() {
                    emitter.emit(ParsedOutput::stderr(line));
                }
            });
        }

        // Spawn a thread to monitor process completion
        let task_id_for_monitor = task_id_owned;
        let processes_ref = Arc::clone(&self.processes);
        let intentionally_stopped_ref = Arc::clone(&self.intentionally_stopped);
        let process_start = start_time;

        thread::spawn(move || {
            info!("[{}] Waiting for Claude process to complete...", task_id_for_monitor);
            let exit_status = child.wait();

            let total_time = process_start.elapsed();
            info!("[{}] Claude process exited: {:?}, total time: {:?}",
                  task_id_for_monitor, exit_status, total_time);

            // Remove from active processes
            {
                let mut procs = processes_ref.lock().unwrap();
                procs.remove(&task_id_for_monitor);
            }

            // Check if this was an intentional stop (follow-up, manual stop, etc.)
            let was_intentional = {
                let mut stopped = intentionally_stopped_ref.lock().unwrap();
                stopped.remove(&task_id_for_monitor)
            };

            if was_intentional {
                info!("[{}] Process was intentionally stopped, skipping status update", task_id_for_monitor);
                return;
            }

            // Determine final status
            let status = match exit_status {
                Ok(s) if s.success() => TaskStatus::Completed,
                _ => TaskStatus::Error,
            };

            // Update database - clear PID since process is done
            let _ = db.update_task_status_and_pid(&task_id_for_monitor, status.clone(), None);

            // Emit status change event
            let event = StatusEvent {
                task_id: task_id_for_monitor.clone(),
                status: status.as_str().to_string(),
            };
            let _ = app_handle.emit("task-status", event);

            // Save notification to DB and emit event
            let title = if status == TaskStatus::Completed { "Task Completed" } else { "Task Failed" };
            let body = format!("Task has {}", if status == TaskStatus::Completed { "completed successfully" } else { "encountered an error" });
            let notif_type = if status == TaskStatus::Completed { "completed" } else { "error" };
            let _ = db.insert_notification(Some(&task_id_for_monitor), title, &body, notif_type);
            let _ = app_handle.emit(
                "task-notification",
                serde_json::json!({
                    "task_id": task_id_for_monitor,
                    "title": title,
                    "body": body,
                    "notification_type": notif_type,
                }),
            );

            // Check queue: start next queued task if there's capacity
            Self::drain_queue(Arc::clone(&db), app_handle, processes_ref);
        });

        Ok(pid)
    }

    /// Stop a running Claude process
    pub fn stop(&self, task_id: &str) -> Result<()> {
        // Mark as intentionally stopped so monitor thread doesn't set Error status
        {
            let mut stopped = self.intentionally_stopped.lock().unwrap();
            stopped.insert(task_id.to_string());
        }

        let pid = {
            let mut processes = self.processes.lock().unwrap();
            processes.remove(task_id)
        };

        if let Some(pid) = pid {
            #[cfg(unix)]
            {
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
                // Give it a moment to terminate
                std::thread::sleep(std::time::Duration::from_millis(500));
                // Force kill if still running
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
            }
        }

        Ok(())
    }

    /// Check if a process is still running
    pub fn is_running(&self, task_id: &str) -> bool {
        let processes = self.processes.lock().unwrap();
        processes.contains_key(task_id)
    }

    /// Get the PID of a running process
    pub fn get_pid(&self, task_id: &str) -> Option<u32> {
        let processes = self.processes.lock().unwrap();
        processes.get(task_id).copied()
    }

    /// Check if a PID is still running (static method for startup recovery)
    pub fn is_pid_alive(pid: u32) -> bool {
        #[cfg(unix)]
        {
            // kill with signal 0 checks if process exists without actually sending a signal
            unsafe { libc::kill(pid as i32, 0) == 0 }
        }
        #[cfg(not(unix))]
        {
            // On Windows, we'd need different logic
            false
        }
    }

    /// Get all running PIDs (for graceful shutdown)
    pub fn get_all_running_pids(&self) -> Vec<(String, u32)> {
        let processes = self.processes.lock().unwrap();
        processes.iter().map(|(k, v)| (k.clone(), *v)).collect()
    }

    /// Shutdown all running processes gracefully
    pub fn shutdown_all(&self) {
        let pids: Vec<(String, u32)> = {
            let processes = self.processes.lock().unwrap();
            processes.iter().map(|(k, v)| (k.clone(), *v)).collect()
        };

        // Mark all as intentionally stopped
        {
            let mut stopped = self.intentionally_stopped.lock().unwrap();
            for (task_id, _) in &pids {
                stopped.insert(task_id.clone());
            }
        }

        for (task_id, pid) in pids {
            #[cfg(unix)]
            {
                // Send SIGTERM first
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }

            // Remove from map
            let mut processes = self.processes.lock().unwrap();
            processes.remove(&task_id);
        }

        // Wait a bit for processes to terminate
        std::thread::sleep(std::time::Duration::from_millis(1000));

        // Force kill any remaining (would need to track which didn't exit)
    }

    /// Check if there are queued tasks that should be started
    fn drain_queue(
        db: Arc<Database>,
        app_handle: AppHandle,
        processes: Arc<Mutex<HashMap<String, u32>>>,
    ) {
        let max_concurrent: u32 = db
            .get_setting("max_concurrent_tasks")
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        if max_concurrent == 0 {
            return; // Unlimited, nothing to drain
        }

        let running_count = {
            let procs = processes.lock().unwrap();
            procs.len() as u32
        };

        if running_count >= max_concurrent {
            return; // Still at capacity
        }

        // Get next queued task
        if let Ok(queued_tasks) = db.get_queued_tasks() {
            if let Some(next_task) = queued_tasks.into_iter().next() {
                info!("Draining queue: starting task {}", next_task.id);
                // Emit event so frontend knows to start this task
                let _ = app_handle.emit(
                    "queue-drain",
                    serde_json::json!({
                        "task_id": next_task.id,
                    }),
                );
            }
        }
    }
}

impl Default for ClaudeProcessService {
    fn default() -> Self {
        Self::new()
    }
}

/// Extract a description from TodoWrite input
fn extract_description_from_todos(input: &serde_json::Value) -> Option<String> {
    let todos = input.get("todos")?.as_array()?;

    // Find the in_progress task first, then any pending tasks
    let mut current_task: Option<&str> = None;
    let mut pending_tasks: Vec<&str> = Vec::new();
    let mut completed_count = 0;

    for todo in todos {
        let status = todo.get("status")?.as_str()?;
        let content = todo.get("content")?.as_str()?;

        match status {
            "in_progress" => current_task = Some(content),
            "pending" => pending_tasks.push(content),
            "completed" => completed_count += 1,
            _ => {}
        }
    }

    let total = todos.len();

    // Build description
    let mut description = String::new();

    if let Some(task) = current_task {
        description.push_str(&format!("Working on: {}", task));
    } else if !pending_tasks.is_empty() {
        description.push_str(&format!("Next: {}", pending_tasks[0]));
    }

    // Add progress info
    if total > 0 {
        if !description.is_empty() {
            description.push_str(" | ");
        }
        description.push_str(&format!("{}/{} tasks completed", completed_count, total));
    }

    if description.is_empty() {
        None
    } else {
        Some(description)
    }
}

/// Format a human-readable summary of tool usage
fn format_tool_summary(tool_name: &str, input: &serde_json::Value) -> String {
    match tool_name {
        "Read" => {
            let path = input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("file");
            format!("Reading {}", path)
        }
        "Write" => {
            let path = input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("file");
            format!("Writing {}", path)
        }
        "Edit" => {
            let path = input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("file");
            format!("Editing {}", path)
        }
        "Bash" => {
            let cmd = input
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("command");
            // Truncate long commands
            let cmd_short = if cmd.len() > 60 {
                format!("{}...", &cmd[..57])
            } else {
                cmd.to_string()
            };
            format!("Running: {}", cmd_short)
        }
        "Glob" => {
            let pattern = input
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("pattern");
            format!("Searching files: {}", pattern)
        }
        "Grep" => {
            let pattern = input
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("pattern");
            format!("Searching for: {}", pattern)
        }
        "Task" => {
            let desc = input
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("subtask");
            format!("Spawning agent: {}", desc)
        }
        "TodoWrite" => "Updating task list".to_string(),
        "WebFetch" => {
            let url = input
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("url");
            format!("Fetching: {}", url)
        }
        "WebSearch" => {
            let query = input
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("query");
            format!("Searching web: {}", query)
        }
        _ => format!("Using {}", tool_name),
    }
}
