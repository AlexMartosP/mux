use crate::commands::AppState;
use crate::error::{AppError, Result};
use crate::services::github::{GitHubService, PRCreateInput, PRPreview, PullRequest};
use crate::services::task_generator;
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

    // Check if the branch has a human ID that needs to be renamed
    let new_branch_name = if GitHubService::is_human_id_branch(&task.branch) {
        eprintln!(
            "Branch '{}' has human ID, generating proper name with Claude...",
            task.branch
        );

        // Generate a proper branch name using Claude
        match task_generator::generate_task_info(&state.db, &task.prompt, &task.repository_path) {
            Ok(info) => {
                eprintln!("Generated branch name: {}", info.branch_name);
                Some(info.branch_name)
            }
            Err(e) => {
                eprintln!("Failed to generate branch name with Claude: {}, using fallback", e);
                // Fallback to timestamp-based name
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                Some(format!("agent/task-{}", timestamp))
            }
        }
    } else {
        None
    };

    let input = PRCreateInput {
        title,
        body,
        base: None, // Use default base branch
        draft,
    };

    let (pr, renamed_branch) = GitHubService::create_pr(
        &task.worktree_path,
        input,
        new_branch_name.as_deref(),
    )?;

    // Update task with PR URL
    state.db.update_task_pr_url(&task_id, &pr.url)?;

    // If branch was renamed, update the task
    if let Some(new_branch) = renamed_branch {
        eprintln!("Updating task branch from '{}' to '{}'", task.branch, new_branch);
        state.db.update_task_branch(&task_id, &new_branch)?;
    }

    Ok(pr)
}

#[tauri::command]
pub fn open_pr_in_browser(url: String) -> Result<()> {
    GitHubService::open_pr_in_browser(&url)
}
