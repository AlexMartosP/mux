//! Output types for Claude Code responses
//!
//! This module provides types for representing and transmitting Claude output.

use serde::{Deserialize, Serialize};

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
    UserMessage, // User's follow-up messages
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
            OutputType::UserMessage => "user_message",
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
