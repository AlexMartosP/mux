use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, utoipa::ToSchema)]
pub struct AgentStep {
    pub id: String,
    pub agent_id: String,
    pub parent_step_id: Option<String>,
    #[sqlx(rename = "type")]
    pub step_type: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentStep {
    pub agent_id: String,
    pub parent_step_id: Option<String>,
    pub step_type: String,
    pub title: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgentStep {
    pub title: Option<String>,
    pub content: Option<String>,
    pub status: Option<String>,
}
