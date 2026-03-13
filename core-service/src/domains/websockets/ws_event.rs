use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum AgentEvent {
    StatusChanged {
        agent_id: String,
        status: String,
    },
    MessageCreated {
        agent_id: String,
        message_id: String,
        role: String,
        content: String,
    },
    StepCreated {
        agent_id: String,
        step_id: String,
        step_type: String,
        title: Option<String>,
        content: Option<String>,
    },
    StepUpdated {
        agent_id: String,
        step_id: String,
        status: String,
        content: Option<String>,
    },
    StreamChunk {
        agent_id: String,
        content: String,
    },
    AgentCompleted {
        agent_id: String,
    },
    AgentError {
        agent_id: String,
        error: String,
    },
}
