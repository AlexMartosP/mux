use crate::commands::AppState;
use crate::error::{AppError, Result};
use crate::services::github::{GitHubService, PRCreateInput, PRPreview, PullRequest};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn check_github_auth() -> Result<bool> {
    GitHubService::check_auth()
}

#[tauri::command]
pub fn get_pr_preview(state: State<Arc<AppState>>, task_id: String) -> Result<PRPreview> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    GitHubService::get_pr_preview(&task.worktree_path, &task.prompt)
}

#[tauri::command]
pub fn create_pull_request(
    state: State<Arc<AppState>>,
    task_id: String,
    title: String,
    body: String,
    draft: bool,
) -> Result<PullRequest> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    let input = PRCreateInput {
        title,
        body,
        base: None, // Use default base branch
        draft,
    };

    let pr = GitHubService::create_pr(&task.worktree_path, input)?;

    // Update task with PR URL
    state.db.update_task_pr_url(&task_id, &pr.url)?;

    Ok(pr)
}

#[tauri::command]
pub fn open_pr_in_browser(url: String) -> Result<()> {
    GitHubService::open_pr_in_browser(&url)
}
