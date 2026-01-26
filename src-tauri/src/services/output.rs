//! Output multiplexer for Claude Code responses
//!
//! This module provides a unified interface for handling output from Claude Code.
//! Output is parsed once and then sent to both:
//! - The database for persistence
//! - The frontend via Tauri events

use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Unified output type that represents parsed Claude output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedOutput {
    pub output_type: OutputType,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
}

/// The type of output
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputType {
    Text,
    Thinking,
    Tool,
    Result,
    System,
    Stdout,
    Stderr,
}

impl OutputType {
    pub fn as_str(&self) -> &'static str {
        match self {
            OutputType::Text => "text",
            OutputType::Thinking => "thinking",
            OutputType::Tool => "tool",
            OutputType::Result => "result",
            OutputType::System => "system",
            OutputType::Stdout => "stdout",
            OutputType::Stderr => "stderr",
        }
    }
}

/// Event sent to the frontend
#[derive(Debug, Clone, Serialize)]
pub struct OutputEvent {
    pub task_id: String,
    pub output_type: String,
    pub content: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
}

/// Activity event sent to the frontend
#[derive(Debug, Clone, Serialize)]
pub struct ActivityEvent {
    pub task_id: String,
    pub activity_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub timestamp: String,
}

/// Output multiplexer that handles sending output to both DB and frontend
pub struct OutputMux {
    db: Arc<Database>,
    app_handle: AppHandle,
    task_id: String,
}

impl OutputMux {
    pub fn new(db: Arc<Database>, app_handle: AppHandle, task_id: String) -> Self {
        Self {
            db,
            app_handle,
            task_id,
        }
    }

    /// Emit parsed output to both database and frontend
    pub fn emit(&self, output: ParsedOutput) {
        let timestamp = chrono::Utc::now().to_rfc3339();

        // Store in database
        let _ = self.db.append_output(
            &self.task_id,
            output.output_type.as_str(),
            &output.content,
            output.tool_name.as_deref(),
            output.tool_input.as_ref(),
        );

        // Emit to frontend
        let event = OutputEvent {
            task_id: self.task_id.clone(),
            output_type: output.output_type.as_str().to_string(),
            content: output.content.clone(),
            timestamp: timestamp.clone(),
            tool_name: output.tool_name.clone(),
            tool_input: output.tool_input.clone(),
        };
        let _ = self.app_handle.emit("task-output", event);

        // Also emit activity for certain types
        match output.output_type {
            OutputType::Text => {
                let activity = ActivityEvent {
                    task_id: self.task_id.clone(),
                    activity_type: "text".to_string(),
                    tool_name: None,
                    tool_input: None,
                    content: Some(output.content),
                    timestamp,
                };
                let _ = self.app_handle.emit("task-activity", activity);
            }
            OutputType::Thinking => {
                let activity = ActivityEvent {
                    task_id: self.task_id.clone(),
                    activity_type: "thinking".to_string(),
                    tool_name: None,
                    tool_input: None,
                    content: Some(output.content),
                    timestamp,
                };
                let _ = self.app_handle.emit("task-activity", activity);
            }
            OutputType::Tool => {
                let activity = ActivityEvent {
                    task_id: self.task_id.clone(),
                    activity_type: "tool_use".to_string(),
                    tool_name: output.tool_name,
                    tool_input: output.tool_input,
                    content: None,
                    timestamp,
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

    /// Get reference to database for other operations
    pub fn db(&self) -> &Arc<Database> {
        &self.db
    }

    /// Get reference to app handle for other operations
    pub fn app_handle(&self) -> &AppHandle {
        &self.app_handle
    }

    /// Get the task ID
    pub fn task_id(&self) -> &str {
        &self.task_id
    }
}

/// Builder functions for creating ParsedOutput
impl ParsedOutput {
    pub fn text(content: String) -> Self {
        Self {
            output_type: OutputType::Text,
            content,
            tool_name: None,
            tool_input: None,
        }
    }

    pub fn thinking(content: String) -> Self {
        Self {
            output_type: OutputType::Thinking,
            content,
            tool_name: None,
            tool_input: None,
        }
    }

    pub fn tool(summary: String, name: String, input: serde_json::Value) -> Self {
        Self {
            output_type: OutputType::Tool,
            content: summary,
            tool_name: Some(name),
            tool_input: Some(input),
        }
    }

    pub fn result(content: String) -> Self {
        Self {
            output_type: OutputType::Result,
            content,
            tool_name: None,
            tool_input: None,
        }
    }

    pub fn system(content: String) -> Self {
        Self {
            output_type: OutputType::System,
            content,
            tool_name: None,
            tool_input: None,
        }
    }

    pub fn stdout(content: String) -> Self {
        Self {
            output_type: OutputType::Stdout,
            content,
            tool_name: None,
            tool_input: None,
        }
    }

    pub fn stderr(content: String) -> Self {
        Self {
            output_type: OutputType::Stderr,
            content,
            tool_name: None,
            tool_input: None,
        }
    }
}
