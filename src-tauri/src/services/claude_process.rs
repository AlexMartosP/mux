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
    Result { result: String, cost_usd: Option<f64> },
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
        // Use shell environment to ensure nvm/node versions are correctly loaded
        debug!("[{}] Getting shell environment...", task_id);
        let shell_env_start = Instant::now();
        let mut cmd = shell::command_with_shell_env("claude");
        debug!("[{}] Shell env loaded in {:?}", task_id, shell_env_start.elapsed());

        // Add continue flag if this is a follow-up
        if continue_conversation {
            cmd.arg("-c");
        }

        // Only skip permissions if user hasn't enabled permission prompts
        if !prompt_for_permissions {
            cmd.arg("--dangerously-skip-permissions");
        }

        // Set environment variable for task ID so hook can identify the task
        cmd.env("AGENT_COORDINATOR_TASK_ID", task_id);

        cmd.arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .arg("-p")
            .arg(prompt)
            .current_dir(worktree_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

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
                            ClaudeMessage::Result { cost_usd, .. } => {
                                // Only show cost info, not the result text (already shown above)
                                if let Some(cost) = cost_usd {
                                    info!("[{}] Result received, cost: ${:.4}", task_id, cost);
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

            // Send notification
            let _ = app_handle.emit(
                "task-notification",
                serde_json::json!({
                    "task_id": task_id_for_monitor,
                    "title": if status == TaskStatus::Completed { "Task Completed" } else { "Task Failed" },
                    "body": format!("Task has {}", if status == TaskStatus::Completed { "completed successfully" } else { "encountered an error" }),
                }),
            );
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
