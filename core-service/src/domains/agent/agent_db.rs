use uuid::Uuid;
use crate::utils::time::now_ms;
use crate::db::pool;

use super::agent_model::{Agent, CreateAgent, UpdateAgent};

pub async fn create(input: &CreateAgent) -> Result<Agent, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let now = now_ms();

    sqlx::query(
        "INSERT INTO agents (id, workspace_id, repository_id, name, status, base_branch, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'SettingUp', ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.workspace_id)
    .bind(&input.repository_id)
    .bind(&input.name)
    .bind(&input.base_branch)
    .bind(now)
    .bind(now)
    .execute(pool())
    .await?;

    get(&id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn get(id: &str) -> Result<Option<Agent>, sqlx::Error> {
    sqlx::query_as::<_, Agent>("SELECT * FROM agents WHERE id = ?")
        .bind(id)
        .fetch_optional(pool())
        .await
}

pub async fn list_by_workspace(
    workspace_id: &str,
) -> Result<Vec<Agent>, sqlx::Error> {
    sqlx::query_as::<_, Agent>(
        "SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at DESC",
    )
    .bind(workspace_id)
    .fetch_all(pool())
    .await
}

pub async fn update(
    id: &str,
    input: UpdateAgent,
) -> Result<Option<Agent>, sqlx::Error> {
    let now = now_ms();

    sqlx::query(
        "UPDATE agents
         SET name          = COALESCE(?, name),
             status        = COALESCE(?, status),
             branch        = COALESCE(?, branch),
             worktree_path = COALESCE(?, worktree_path),
             updated_at    = ?
         WHERE id = ?",
    )
    .bind(input.name)
    .bind(input.status)
    .bind(input.branch)
    .bind(input.worktree_path)
    .bind(now)
    .bind(id)
    .execute(pool())
    .await?;

    get(&id).await
}

pub async fn delete(id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM agents WHERE id = ?")
        .bind(id)
        .execute(pool())
        .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn get_all_branch_names(repository_id: &str) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT branch FROM agents WHERE repository_id = ? AND branch IS NOT NULL")
        .bind(repository_id)
        .fetch_all(pool())
        .await
}
