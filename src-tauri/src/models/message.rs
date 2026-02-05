use serde::{Deserialize, Serialize};

/// A part of a message - can be text, thinking, or tool usage
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessagePart {
    Text {
        content: String,
    },
    Thinking {
        content: String,
    },
    ToolUsage {
        tool_name: String,
        tool_input: serde_json::Value,
    },
}

impl MessagePart {
    /// Create a new text part
    pub fn text(content: String) -> Self {
        MessagePart::Text { content }
    }

    /// Create a new thinking part
    pub fn thinking(content: String) -> Self {
        MessagePart::Thinking { content }
    }

    /// Create a new tool usage part
    pub fn tool_usage(tool_name: String, tool_input: serde_json::Value) -> Self {
        MessagePart::ToolUsage { tool_name, tool_input }
    }
}

/// A message in an agent's conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub agent_id: String,
    pub role: String, // "assistant", "user", "system"
    pub parts: Vec<MessagePart>,
    pub timestamp: String,
}

impl Message {
    /// Create a new message with no parts
    pub fn new(id: String, agent_id: String, role: String, timestamp: String) -> Self {
        Message {
            id,
            agent_id,
            role,
            parts: Vec::new(),
            timestamp,
        }
    }

    /// Add a part to the message
    pub fn add_part(&mut self, part: MessagePart) {
        self.parts.push(part);
    }
}

/// Event for agent message updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessageEvent {
    pub agent_id: String,
    pub message_id: String,
    pub event_type: String, // "message_created", "message_part", or "message_complete"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part: Option<MessagePart>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parts: Option<Vec<MessagePart>>,
}

impl AgentMessageEvent {
    /// Create a message_created event (empty message, parts added later)
    pub fn message_created(agent_id: String, message_id: String, role: String, timestamp: String) -> Self {
        AgentMessageEvent {
            agent_id,
            message_id,
            event_type: "message_created".to_string(),
            role: Some(role),
            timestamp: Some(timestamp),
            part: None,
            parts: None,
        }
    }

    /// Create a message_complete event (message with all parts included)
    pub fn message_complete(agent_id: String, message_id: String, role: String, timestamp: String, parts: Vec<MessagePart>) -> Self {
        AgentMessageEvent {
            agent_id,
            message_id,
            event_type: "message_complete".to_string(),
            role: Some(role),
            timestamp: Some(timestamp),
            part: None,
            parts: Some(parts),
        }
    }

    /// Create a message_part event
    pub fn message_part(agent_id: String, message_id: String, part: MessagePart) -> Self {
        AgentMessageEvent {
            agent_id,
            message_id,
            event_type: "message_part".to_string(),
            role: None,
            timestamp: None,
            part: Some(part),
            parts: None,
        }
    }
}
