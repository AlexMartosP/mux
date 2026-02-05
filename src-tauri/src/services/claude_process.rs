use crate::db::Database;
use crate::error::{AppError, Result};
use crate::events::emit_agent_updated;
use crate::models::{AgentMessageEvent, AgentStatus, MessagePart};
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
use uuid::Uuid;


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

/// Mux Protocol: JSON events emitted by Claude Code to notify Mux of metadata changes
#[derive(Debug, Deserialize)]
struct MuxEvent {
    mux_event: MuxEventPayload,
}

#[derive(Debug, Deserialize)]
struct MuxEventPayload {
    #[serde(rename = "type")]
    event_type: String,
    data: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct BranchChangedData {
    old_branch: String,
    new_branch: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
struct TitleUpdatedData {
    old_title: String,
    new_title: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
struct PrCreatedData {
    pr_url: String,
    pr_number: u32,
    title: String,
    branch: String,
}

pub struct ClaudeProcessService {
    processes: Arc<Mutex<HashMap<String, u32>>>, // agent_id -> pid
    /// Agents that were intentionally stopped (so monitor thread doesn't set Error status)
    intentionally_stopped: Arc<Mutex<std::collections::HashSet<String>>>,
}

/// Builds a prompt with Mux protocol instructions prepended
fn build_prompt_with_mux_protocol(user_prompt: &str, agent_name: &str, agent_branch: &str) -> String {
    format!(
        r#"## Mux Integration Protocol

You are working in Mux, an AI agent coordinator. When you perform certain actions, please output a JSON block using this exact format so Mux can update its UI:

**Branch Name Changes:**
When you change or create a git branch, output:
```json
{{"mux_event":{{"type":"branch_changed","data":{{"old_branch":"previous-branch","new_branch":"new-branch","reason":"why changed"}}}}}}
```

**Agent Title Updates:**
When you want to update the agent's title/name (e.g., after understanding the task better), output:
```json
{{"mux_event":{{"type":"title_updated","data":{{"old_title":"previous-title","new_title":"new-title","reason":"why changed"}}}}}}
```

**Pull Request Creation:**
When you create a pull request using gh pr create or similar, output:
```json
{{"mux_event":{{"type":"pr_created","data":{{"pr_url":"https://...","pr_number":123,"title":"PR title","branch":"branch-name"}}}}}}
```

**Important:**
- Output these JSON blocks as assistant text (not as tool output)
- Current agent title: "{}"
- Current branch: "{}"
- Keep these events concise and only emit when actually performing the action
- The JSON must be on a single line

---

{}"#,
        agent_name,
        agent_branch,
        user_prompt
    )
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
        agent_id: &str,
        worktree_path: &str,
        prompt: &str,
        continue_conversation: bool,
    ) -> Result<u32> {
        let start_time = Instant::now();
        info!("[{}] Starting Claude process in {}", agent_id, worktree_path);

        // Check if already running
        {
            let processes = self.processes.lock().unwrap();
            if processes.contains_key(agent_id) {
                return Err(AppError::Process(format!(
                    "Process already running for agent {}",
                    agent_id
                )));
            }
        }

        // Clear intentionally_stopped flag so the monitor thread for this new
        // process correctly reports completion/error status
        {
            let mut stopped = self.intentionally_stopped.lock().unwrap();
            stopped.remove(agent_id);
        }

        // Only clear output if starting fresh (not continuing)
        if !continue_conversation {
            let _ = db.clear_agent_output(agent_id);
            // Also clear messages from the new table
            let _ = db.clear_agent_messages(agent_id);
        }

        // Store the user prompt as a user message (optimized: single DB op + single event)
        {
            let message_id = Uuid::new_v4().to_string();
            let timestamp = chrono::Utc::now().to_rfc3339();
            let parts = vec![MessagePart::text(prompt.to_string())];

            if let Err(e) = db.create_message_with_parts(&message_id, agent_id, "user", &timestamp, &parts) {
                warn!("[{}] Failed to create user message: {}", agent_id, e);
            } else {
                // Emit single message_complete event
                let _ = app_handle.emit(
                    "agent-message",
                    AgentMessageEvent::message_complete(
                        agent_id.to_string(),
                        message_id,
                        "user".to_string(),
                        timestamp,
                        parts,
                    ),
                );
            }
        }

        // Check if we should prompt for permissions or auto-approve
        let prompt_for_permissions = db
            .get_setting("prompt_for_permissions")
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false);

        // Get agent details for Mux protocol injection
        let agent = db.get_agent(agent_id)?.ok_or_else(|| {
            AppError::AgentNotFound(agent_id.to_string())
        })?;

        // Build prompt with Mux protocol instructions
        let prompt_with_protocol = build_prompt_with_mux_protocol(
            prompt,
            &agent.name,
            &agent.branch
        );
        debug!("[{}] Prompt starts with: {}", agent_id, &prompt_with_protocol.chars().take(200).collect::<String>());

        // Build command with JSON output format for structured activity tracking
        // We wrap Claude in a shell script to ensure:
        // 1. nvm is sourced
        // 2. If .nvmrc exists in the worktree, `nvm use` is run to use the correct Node version
        debug!("[{}] Building Claude command with nvm support...", agent_id);

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
        let escaped_prompt = prompt_with_protocol.replace("'", "'\\''");
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
            .env("AGENT_COORDINATOR_TASK_ID", agent_id)
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
              agent_id,
              if continue_conversation { "-c" } else { "" },
              if prompt.len() > 100 { format!("{}...", &prompt[..100]) } else { prompt.to_string() });
        info!("[{}] Working directory: {}", agent_id, worktree_path);

        // Spawn the process
        debug!("[{}] Spawning Claude process...", agent_id);
        let spawn_start = Instant::now();
        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Process(format!("Failed to start claude: {}", e)))?;

        let pid = child.id();
        info!("[{}] Claude spawned (PID: {}) in {:?}, total setup: {:?}",
              agent_id, pid, spawn_start.elapsed(), start_time.elapsed());

        // Insert into processes map
        {
            let mut processes = self.processes.lock().unwrap();
            processes.insert(agent_id.to_string(), pid);
        }

        // Store PID in database for crash recovery
        let _ = db.update_agent_status_and_pid(agent_id, AgentStatus::Running, Some(pid));

        // Take ownership of stdout and stderr
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Clone for threads
        let agent_id_owned = agent_id.to_string();

        // Spawn stdout monitoring with decoupled reading and processing
        // This prevents backpressure on the pipe from slowing down Claude
        if let Some(stdout) = stdout {
            let agent_id = agent_id_owned.clone();
            let agent_id_for_reader = agent_id.clone();
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
                info!("[{}] Stdout reader thread started", agent_id_for_reader);
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
                        debug!("[{}] Read {} lines from stdout", agent_id_for_reader, count);
                    }
                }

                lines_read_clone.store(count, Ordering::Relaxed);
                info!("[{}] Stdout reader finished: {} lines in {:?}",
                      agent_id_for_reader, count, start.elapsed());
            });

            // Processor thread - handles JSON parsing and event emission
            thread::spawn(move || {
                info!("[{}] Stdout processor thread started", agent_id);
                let start = Instant::now();
                let mut processed = 0u64;
                let emitter = BatchedOutputEmitter::new(app_handle.clone(), agent_id.clone());

                while let Ok(line) = rx.recv() {
                    processed += 1;

                    // Try to parse as Mux event first
                    if let Ok(mux_event) = serde_json::from_str::<MuxEvent>(&line) {
                        debug!("[{}] Received Mux event: {:?}", agent_id, mux_event);
                        handle_mux_event(mux_event, &agent_id, &db, &app_handle);
                        continue;
                    }

                    // Try to parse as JSON for structured output
                    if let Ok(msg) = serde_json::from_str::<ClaudeMessage>(&line) {
                        match msg {
                            ClaudeMessage::Assistant { message } => {
                                // Create a new message for this assistant turn
                                let message_id = Uuid::new_v4().to_string();
                                let timestamp = chrono::Utc::now().to_rfc3339();

                                // Create message in DB (with empty parts initially)
                                if let Err(e) = db.create_message(&message_id, &agent_id, "assistant", &timestamp) {
                                    warn!("[{}] Failed to create message in DB: {}", agent_id, e);
                                }

                                // Emit message_created event
                                let created_event = AgentMessageEvent::message_created(
                                    agent_id.clone(),
                                    message_id.clone(),
                                    "assistant".to_string(),
                                    timestamp.clone(),
                                );
                                let _ = app_handle.emit("agent-message", &created_event);

                                // Track if any content was actually added to this message
                                let mut has_content = false;

                                for block in message.content {
                                    match block {
                                        ContentBlock::Text { text } => {
                                            // Check if entire text is a standalone Mux event
                                            if let Ok(mux_event) = serde_json::from_str::<MuxEvent>(&text) {
                                                info!("[{}] Parsed standalone Mux event (type: {})", agent_id, mux_event.mux_event.event_type);
                                                handle_mux_event(mux_event, &agent_id, &db, &app_handle);
                                                // Skip storing/emitting - it's a protocol message
                                                continue;
                                            }

                                            // Check if text contains embedded Mux event JSON
                                            if text.contains("mux_event") {
                                                debug!("[{}] Text contains 'mux_event', attempting extraction...", agent_id);

                                                // Try to extract JSON object containing mux_event
                                                if let Some(json_str) = extract_json_from_text(&text) {
                                                    if let Ok(mux_event) = serde_json::from_str::<MuxEvent>(&json_str) {
                                                        info!("[{}] Extracted Mux event (type: {})", agent_id, mux_event.mux_event.event_type);
                                                        handle_mux_event(mux_event, &agent_id, &db, &app_handle);

                                                        // Remove the JSON from the text
                                                        let cleaned = text.replace(&json_str, "").trim().to_string();

                                                        // Skip if text is empty or only contains whitespace/code fence markers
                                                        let meaningful_text = cleaned.replace("```", "").replace("json", "").trim().to_string();
                                                        if meaningful_text.is_empty() {
                                                            // Text was only the Mux event (or just code fences) - skip storing/emitting
                                                            debug!("[{}] Text was only Mux event/whitespace, skipping", agent_id);
                                                            continue;
                                                        }

                                                        // Store and emit the cleaned text (without the JSON)
                                                        debug!("[{}] Storing cleaned text (len: {})", agent_id, cleaned.len());
                                                        let part = MessagePart::text(cleaned.clone());
                                                        if let Err(e) = db.append_message_part(&message_id, &part) {
                                                            warn!("[{}] Failed to append message part: {}", agent_id, e);
                                                        } else {
                                                            has_content = true;
                                                        }
                                                        let part_event = AgentMessageEvent::message_part(
                                                            agent_id.clone(),
                                                            message_id.clone(),
                                                            part,
                                                        );
                                                        let _ = app_handle.emit("agent-message", &part_event);
                                                        emitter.emit(ParsedOutput::text(cleaned));
                                                        continue;
                                                    } else {
                                                        warn!("[{}] Found mux_event in text but failed to parse extracted JSON", agent_id);
                                                    }
                                                } else {
                                                    warn!("[{}] Text contains 'mux_event' but couldn't extract valid JSON", agent_id);
                                                }
                                            }

                                            // Normal text - store and emit as-is
                                            let part = MessagePart::text(text.clone());
                                            if let Err(e) = db.append_message_part(&message_id, &part) {
                                                warn!("[{}] Failed to append message part: {}", agent_id, e);
                                            } else {
                                                has_content = true;
                                            }
                                            let part_event = AgentMessageEvent::message_part(
                                                agent_id.clone(),
                                                message_id.clone(),
                                                part,
                                            );
                                            let _ = app_handle.emit("agent-message", &part_event);
                                            emitter.emit(ParsedOutput::text(text));
                                        }
                                        ContentBlock::Thinking { thinking } => {
                                            // Create and store thinking part
                                            let part = MessagePart::thinking(thinking.clone());
                                            if let Err(e) = db.append_message_part(&message_id, &part) {
                                                warn!("[{}] Failed to append message part: {}", agent_id, e);
                                            } else {
                                                has_content = true;
                                            }
                                            // Emit message_part event
                                            let part_event = AgentMessageEvent::message_part(
                                                agent_id.clone(),
                                                message_id.clone(),
                                                part,
                                            );
                                            let _ = app_handle.emit("agent-message", &part_event);

                                            // Also emit old event for backward compatibility
                                            emitter.emit(ParsedOutput::thinking(thinking));
                                        }
                                        ContentBlock::ToolUse { name, input } => {
                                            debug!("[{}] Tool use: {}", agent_id, name);

                                            // Create and store tool_usage part
                                            let part = MessagePart::tool_usage(name.clone(), input.clone());
                                            if let Err(e) = db.append_message_part(&message_id, &part) {
                                                warn!("[{}] Failed to append message part: {}", agent_id, e);
                                            } else {
                                                has_content = true;
                                            }
                                            // Emit message_part event
                                            let part_event = AgentMessageEvent::message_part(
                                                agent_id.clone(),
                                                message_id.clone(),
                                                part,
                                            );
                                            let _ = app_handle.emit("agent-message", &part_event);

                                            // Also emit old event for backward compatibility
                                            let summary = format_tool_summary(&name, &input);
                                            emitter.emit(ParsedOutput::tool(summary, name.clone(), input.clone()));

                                            // Update description from TodoWrite
                                            if name == "TodoWrite" {
                                                if let Some(description) = extract_description_from_todos(&input) {
                                                    let _ = db.update_agent_description(&agent_id, &description);
                                                    emit_agent_updated(emitter.app_handle(), &db, &agent_id);
                                                }
                                            }
                                        }
                                        ContentBlock::ToolResult { content } => {
                                            if let Some(result) = content {
                                                // Note: Tool results go to the old system only for now
                                                // They're not part of the message model yet
                                                emitter.emit_tool_result(result);
                                            }
                                        }
                                    }
                                }

                                // If no content was added to the message, emit a deletion event
                                if !has_content {
                                    debug!("[{}] Message {} had no content (all Mux events), emitting deletion event", agent_id, message_id);
                                    // Emit a message_deleted event so frontend can remove the empty message
                                    let delete_event = serde_json::json!({
                                        "agent_id": agent_id.clone(),
                                        "message_id": message_id.clone(),
                                        "event_type": "message_deleted",
                                    });
                                    let _ = app_handle.emit("agent-message", &delete_event);
                                }
                            }
                            ClaudeMessage::Result { cost_usd, input_tokens, output_tokens, .. } => {
                                let cost = cost_usd.unwrap_or(0.0);
                                let input_tok = input_tokens.unwrap_or(0);
                                let output_tok = output_tokens.unwrap_or(0);

                                if cost > 0.0 || input_tok > 0 || output_tok > 0 {
                                    info!("[{}] Result: ${:.4}, {}in/{}out tokens", agent_id, cost, input_tok, output_tok);
                                    let _ = db.add_agent_cost(&agent_id, cost, input_tok, output_tok);
                                    // Emit unified agent update event
                                    emit_agent_updated(&app_handle, &db, &agent_id);
                                    emitter.emit(ParsedOutput::result(format!("Completed (${:.4})", cost)));
                                }
                            }
                            ClaudeMessage::System { message } => {
                                debug!("[{}] System message: {}", agent_id, message);
                                emitter.emit(ParsedOutput::system(message));
                            }
                        }
                    } else {
                        // Fallback for non-JSON output
                        emitter.emit(ParsedOutput::stdout(line));
                    }

                    // Log every 100 processed
                    if processed % 100 == 0 {
                        debug!("[{}] Processed {} messages", agent_id, processed);
                    }
                }

                let dropped = dropped_lines.load(Ordering::Relaxed);
                if dropped > 0 {
                    warn!("[{}] Dropped {} lines due to backpressure!", agent_id, dropped);
                }
                info!("[{}] Stdout processor finished: {} messages in {:?}",
                      agent_id, processed, start.elapsed());
            });
        }

        // Spawn stderr monitoring with decoupled reading and processing
        if let Some(stderr) = stderr {
            let agent_id = agent_id_owned.clone();
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
                let emitter = BatchedOutputEmitter::new(app_handle, agent_id);
                while let Ok(line) = rx.recv() {
                    emitter.emit(ParsedOutput::stderr(line));
                }
            });
        }

        // Spawn a thread to monitor process completion
        let agent_id_for_monitor = agent_id_owned;
        let processes_ref = Arc::clone(&self.processes);
        let intentionally_stopped_ref = Arc::clone(&self.intentionally_stopped);
        let process_start = start_time;

        thread::spawn(move || {
            info!("[{}] Waiting for Claude process to complete...", agent_id_for_monitor);
            let exit_status = child.wait();

            let total_time = process_start.elapsed();
            info!("[{}] Claude process exited: {:?}, total time: {:?}",
                  agent_id_for_monitor, exit_status, total_time);

            // Remove from active processes
            {
                let mut procs = processes_ref.lock().unwrap();
                procs.remove(&agent_id_for_monitor);
            }

            // Check if this was an intentional stop (follow-up, manual stop, etc.)
            let was_intentional = {
                let mut stopped = intentionally_stopped_ref.lock().unwrap();
                stopped.remove(&agent_id_for_monitor)
            };

            if was_intentional {
                info!("[{}] Process was intentionally stopped, skipping status update", agent_id_for_monitor);
                return;
            }

            // Determine final status
            let status = match exit_status {
                Ok(s) if s.success() => AgentStatus::Completed,
                _ => AgentStatus::Error,
            };

            // Update database - clear PID since process is done
            let _ = db.update_agent_status_and_pid(&agent_id_for_monitor, status.clone(), None);

            // Emit unified agent update event
            emit_agent_updated(&app_handle, &db, &agent_id_for_monitor);

            // Save notification to DB and emit event
            let title = if status == AgentStatus::Completed { "Agent Completed" } else { "Agent Failed" };
            let body = format!("Agent has {}", if status == AgentStatus::Completed { "completed successfully" } else { "encountered an error" });
            let notif_type = if status == AgentStatus::Completed { "completed" } else { "error" };
            let _ = db.insert_notification(Some(&agent_id_for_monitor), title, &body, notif_type);
            let _ = app_handle.emit(
                "agent-notification",
                serde_json::json!({
                    "agent_id": agent_id_for_monitor,
                    "title": title,
                    "body": body,
                    "notification_type": notif_type,
                }),
            );

            // Check queue: start next queued agent if there's capacity
            Self::drain_queue(Arc::clone(&db), app_handle, processes_ref);
        });

        Ok(pid)
    }

    /// Stop a running Claude process
    pub fn stop(&self, agent_id: &str) -> Result<()> {
        // Mark as intentionally stopped so monitor thread doesn't set Error status
        {
            let mut stopped = self.intentionally_stopped.lock().unwrap();
            stopped.insert(agent_id.to_string());
        }

        let pid = {
            let mut processes = self.processes.lock().unwrap();
            processes.remove(agent_id)
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
    pub fn is_running(&self, agent_id: &str) -> bool {
        let processes = self.processes.lock().unwrap();
        processes.contains_key(agent_id)
    }

    /// Get the PID of a running process
    pub fn get_pid(&self, agent_id: &str) -> Option<u32> {
        let processes = self.processes.lock().unwrap();
        processes.get(agent_id).copied()
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
            for (agent_id, _) in &pids {
                stopped.insert(agent_id.clone());
            }
        }

        for (agent_id, pid) in pids {
            #[cfg(unix)]
            {
                // Send SIGTERM first
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }

            // Remove from map
            let mut processes = self.processes.lock().unwrap();
            processes.remove(&agent_id);
        }

        // Wait a bit for processes to terminate
        std::thread::sleep(std::time::Duration::from_millis(1000));

        // Force kill any remaining (would need to track which didn't exit)
    }

    /// Check if there are queued agents that should be started
    fn drain_queue(
        db: Arc<Database>,
        app_handle: AppHandle,
        processes: Arc<Mutex<HashMap<String, u32>>>,
    ) {
        let max_concurrent: u32 = db
            .get_setting("max_concurrent_agents")
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

        // Get next queued agent
        if let Ok(queued_agents) = db.get_queued_agents() {
            if let Some(next_agent) = queued_agents.into_iter().next() {
                info!("Draining queue: starting agent {}", next_agent.id);
                // Emit event so frontend knows to start this agent
                let _ = app_handle.emit(
                    "queue-drain",
                    serde_json::json!({
                        "agent_id": next_agent.id,
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

/// Extract JSON object from text that might contain other content
/// Looks for JSON objects containing "mux_event" key
fn extract_json_from_text(text: &str) -> Option<String> {
    // Find all potential JSON objects by looking for balanced braces
    let mut brace_count = 0;
    let mut start_idx = None;
    let chars: Vec<char> = text.chars().collect();

    for (i, ch) in chars.iter().enumerate() {
        if *ch == '{' {
            if brace_count == 0 {
                start_idx = Some(i);
            }
            brace_count += 1;
        } else if *ch == '}' {
            brace_count -= 1;
            if brace_count == 0 {
                if let Some(start) = start_idx {
                    let json_str: String = chars[start..=i].iter().collect();
                    // Check if this JSON contains mux_event
                    if json_str.contains("mux_event") {
                        return Some(json_str);
                    }
                }
                start_idx = None;
            }
        }
    }

    None
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

/// Handles Mux protocol events from Claude Code
fn handle_mux_event(
    event: MuxEvent,
    agent_id: &str,
    db: &Database,
    app_handle: &AppHandle,
) {
    match event.mux_event.event_type.as_str() {
        "branch_changed" => {
            if let Ok(data) = serde_json::from_value::<BranchChangedData>(event.mux_event.data) {
                handle_branch_changed(agent_id, data, db, app_handle);
            } else {
                warn!("[{}] Failed to parse branch_changed data", agent_id);
            }
        }
        "title_updated" => {
            if let Ok(data) = serde_json::from_value::<TitleUpdatedData>(event.mux_event.data) {
                handle_title_updated(agent_id, data, db, app_handle);
            } else {
                warn!("[{}] Failed to parse title_updated data", agent_id);
            }
        }
        "pr_created" => {
            if let Ok(data) = serde_json::from_value::<PrCreatedData>(event.mux_event.data) {
                handle_pr_created(agent_id, data, db, app_handle);
            } else {
                warn!("[{}] Failed to parse pr_created data", agent_id);
            }
        }
        _ => {
            warn!("[{}] Unknown Mux event type: {}", agent_id, event.mux_event.event_type);
        }
    }
}

/// Handles branch name change events
/// Note: Claude Code has already performed the git branch rename.
/// We just need to update our database to reflect the change.
fn handle_branch_changed(
    agent_id: &str,
    data: BranchChangedData,
    db: &Database,
    app_handle: &AppHandle,
) {
    info!(
        "[Agent {}] Branch changed: {} -> {} (reason: {})",
        agent_id, data.old_branch, data.new_branch, data.reason
    );

    // Update database with new branch name
    // (Claude Code already renamed the git branch via its own git commands)
    if let Err(e) = db.update_agent_branch(agent_id, &data.new_branch) {
        warn!("[{}] Failed to update agent branch in DB: {}", agent_id, e);
        return;
    }

    // Emit agent-updated event to frontend
    emit_agent_updated(app_handle, db, agent_id);

    // Store notification
    let _ = db.insert_notification(
        Some(agent_id),
        "Branch Changed",
        &format!("Branch renamed to {}: {}", data.new_branch, data.reason),
        "info",
    );
}

/// Handles agent title update events
fn handle_title_updated(
    agent_id: &str,
    data: TitleUpdatedData,
    db: &Database,
    app_handle: &AppHandle,
) {
    info!(
        "[Agent {}] Title updated: {} -> {} (reason: {})",
        agent_id, data.old_title, data.new_title, data.reason
    );

    // Update database
    if let Err(e) = db.update_agent_name(agent_id, &data.new_title) {
        warn!("[{}] Failed to update agent name in DB: {}", agent_id, e);
        return;
    }

    // Emit agent-updated event to frontend
    emit_agent_updated(app_handle, db, agent_id);

    // Store notification
    let _ = db.insert_notification(
        Some(agent_id),
        "Title Updated",
        &format!("Agent renamed: {}", data.new_title),
        "info",
    );
}

/// Handles PR creation events
fn handle_pr_created(
    agent_id: &str,
    data: PrCreatedData,
    db: &Database,
    app_handle: &AppHandle,
) {
    info!(
        "[Agent {}] PR created: {} ({})",
        agent_id, data.pr_url, data.title
    );

    // Update PR URL
    if let Err(e) = db.update_agent_pr_url(agent_id, &data.pr_url) {
        warn!("[{}] Failed to update PR URL in DB: {}", agent_id, e);
        return;
    }

    // Update status to InReview
    if let Err(e) = db.update_agent_status(agent_id, AgentStatus::InReview) {
        warn!("[{}] Failed to update agent status: {}", agent_id, e);
    }

    // Emit agent-updated event to frontend
    emit_agent_updated(app_handle, db, agent_id);

    // Store notification
    let _ = db.insert_notification(
        Some(agent_id),
        "Pull Request Created",
        &format!("{}: {}", data.title, data.pr_url),
        "success",
    );

    // Emit PR-specific event (optional, for direct UI updates)
    let _ = app_handle.emit(
        "agent-pr-created",
        serde_json::json!({
            "agent_id": agent_id,
            "pr_url": data.pr_url,
            "pr_number": data.pr_number,
            "title": data.title,
            "branch": data.branch,
        }),
    );
}
