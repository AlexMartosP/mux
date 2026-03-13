use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, strum_macros::Display)]
pub enum AgentStatus {
    SettingUp,
    Running,
    Completed,
    Idle,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, utoipa::ToSchema)]
pub struct Agent {
    pub id: String,
    pub workspace_id: String,
    pub repository_id: Option<String>,
    pub name: String,
    pub status: String,
    pub base_branch: String,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgent {
    pub workspace_id: String,
    pub repository_id: String,
    pub name: String,
    pub base_branch: String,
    pub initial_message: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct UpdateAgent {
    pub name: Option<String>,
    pub status: Option<String>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
}
