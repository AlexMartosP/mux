//! Batched output writer for improved performance
//!
//! This module provides a global database writer that batches writes
//! across all tasks for better throughput. Events are emitted immediately
//! for real-time UI updates, while database writes are batched.

use crate::db::Database;
use crate::services::output::{ActivityEvent, OutputEvent, OutputType};
use crate::services::output::ParsedOutput;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Configuration for the batched writer
const BATCH_SIZE: usize = 50;
const FLUSH_INTERVAL_MS: u64 = 100;

/// Global sender for database writes
static DB_WRITER: OnceLock<Sender<DbWriteMessage>> = OnceLock::new();

/// Message for database writes only (no AppHandle needed)
struct DbWriteMessage {
    task_id: String,
    output_type: String,
    content: String,
    tool_name: Option<String>,
    tool_input: Option<serde_json::Value>,
    timestamp: String,
}

/// Initialize the global database writer thread
/// Call this once during app startup
pub fn init_db_writer(db: Arc<Database>) {
    let (sender, receiver) = mpsc::channel::<DbWriteMessage>();

    // Try to set the global sender
    if DB_WRITER.set(sender).is_err() {
        return; // Already initialized
    }

    // Spawn background writer thread
    thread::spawn(move || {
        let mut buffer: Vec<DbWriteMessage> = Vec::with_capacity(BATCH_SIZE);
        let mut last_flush = Instant::now();

        loop {
            // Try to receive with a timeout
            match receiver.recv_timeout(Duration::from_millis(10)) {
                Ok(msg) => {
                    buffer.push(msg);

                    // Flush if buffer is full
                    if buffer.len() >= BATCH_SIZE {
                        flush_db_buffer(&db, &mut buffer);
                        last_flush = Instant::now();
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Check if we should flush based on time
                    if !buffer.is_empty()
                        && last_flush.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS)
                    {
                        flush_db_buffer(&db, &mut buffer);
                        last_flush = Instant::now();
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    // Channel closed, flush remaining and exit
                    if !buffer.is_empty() {
                        flush_db_buffer(&db, &mut buffer);
                    }
                    break;
                }
            }
        }
    });
}

/// Flush buffer to database in a single transaction
fn flush_db_buffer(db: &Database, buffer: &mut Vec<DbWriteMessage>) {
    if buffer.is_empty() {
        return;
    }

    // Use batch insert for better performance
    if let Err(e) = db.append_output_batch(buffer.iter().map(|msg| {
        (
            msg.task_id.as_str(),
            msg.output_type.as_str(),
            msg.content.as_str(),
            msg.tool_name.as_deref(),
            msg.tool_input.as_ref(),
            msg.timestamp.as_str(),
        )
    })) {
        eprintln!("Failed to batch write output: {}", e);
    }

    buffer.clear();
}

/// Batched output emitter for a specific task
/// Emits Tauri events immediately, queues database writes
pub struct BatchedOutputEmitter {
    app_handle: AppHandle,
    task_id: String,
}

impl BatchedOutputEmitter {
    pub fn new(app_handle: AppHandle, task_id: String) -> Self {
        Self {
            app_handle,
            task_id,
        }
    }

    /// Emit output: sends Tauri events immediately, queues DB write
    pub fn emit(&self, output: ParsedOutput) {
        let timestamp = chrono::Utc::now().to_rfc3339();

        // Emit Tauri events immediately for real-time updates
        self.emit_events(&output, &timestamp);

        // Queue database write (non-blocking)
        if let Some(sender) = DB_WRITER.get() {
            let msg = DbWriteMessage {
                task_id: self.task_id.clone(),
                output_type: output.output_type.as_str().to_string(),
                content: output.content.clone(),
                tool_name: output.tool_name.clone(),
                tool_input: output.tool_input.clone(),
                timestamp,
            };
            let _ = sender.send(msg);
        }
    }

    /// Emit Tauri events for real-time UI updates
    fn emit_events(&self, output: &ParsedOutput, timestamp: &str) {
        // Emit task-output event
        let event = OutputEvent {
            task_id: self.task_id.clone(),
            output_type: output.output_type.as_str().to_string(),
            content: output.content.clone(),
            timestamp: timestamp.to_string(),
            tool_name: output.tool_name.clone(),
            tool_input: output.tool_input.clone(),
        };
        let _ = self.app_handle.emit("task-output", event);

        // Emit activity event for certain types
        match output.output_type {
            OutputType::Text => {
                let activity = ActivityEvent {
                    task_id: self.task_id.clone(),
                    activity_type: "text".to_string(),
                    tool_name: None,
                    tool_input: None,
                    content: Some(output.content.clone()),
                    timestamp: timestamp.to_string(),
                };
                let _ = self.app_handle.emit("task-activity", activity);
            }
            OutputType::Thinking => {
                let activity = ActivityEvent {
                    task_id: self.task_id.clone(),
                    activity_type: "thinking".to_string(),
                    tool_name: None,
                    tool_input: None,
                    content: Some(output.content.clone()),
                    timestamp: timestamp.to_string(),
                };
                let _ = self.app_handle.emit("task-activity", activity);
            }
            OutputType::Tool => {
                let activity = ActivityEvent {
                    task_id: self.task_id.clone(),
                    activity_type: "tool_use".to_string(),
                    tool_name: output.tool_name.clone(),
                    tool_input: output.tool_input.clone(),
                    content: None,
                    timestamp: timestamp.to_string(),
                };
                let _ = self.app_handle.emit("task-activity", activity);
            }
            _ => {}
        }
    }

    /// Emit a tool result activity (doesn't store in DB, just activity feed)
    pub fn emit_tool_result(&self, content: String) {
        let timestamp = chrono::Utc::now().to_rfc3339();
        let activity = ActivityEvent {
            task_id: self.task_id.clone(),
            activity_type: "tool_result".to_string(),
            tool_name: None,
            tool_input: None,
            content: Some(content),
            timestamp,
        };
        let _ = self.app_handle.emit("task-activity", activity);
    }

    /// Get reference to app handle for other operations
    pub fn app_handle(&self) -> &AppHandle {
        &self.app_handle
    }
}
