use crate::commands::AppState;
use crate::error::{AppError, Result};
use crate::services::github::{CIStatusResponse, GitHubService, PRCreateInput, PRPreview, PullRequest};
use crate::services::agent_generator;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn check_github_auth() -> Result<bool> {
    GitHubService::check_auth()
}

#[tauri::command]
pub fn get_pr_preview(state: State<Arc<AppState>>, agent_id: String) -> Result<PRPreview> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    GitHubService::get_pr_preview(&agent.worktree_path, &agent.prompt)
}

#[tauri::command]
pub fn create_pull_request(
    state: State<Arc<AppState>>,
    agent_id: String,
    title: String,
    body: String,
    draft: bool,
) -> Result<PullRequest> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    // Check if the branch has a human ID that needs to be renamed
    let new_branch_name = if GitHubService::is_human_id_branch(&agent.branch) {
        eprintln!(
            "Branch '{}' has human ID, generating proper name with Claude...",
            agent.branch
        );

        // Generate a proper branch name using Claude
        match agent_generator::generate_agent_info(&state.db, &agent.prompt, &agent.repository_path) {
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
        &agent.worktree_path,
        input,
        new_branch_name.as_deref(),
    )?;

    // Update agent with PR URL
    state.db.update_agent_pr_url(&agent_id, &pr.url)?;

    // Update agent status to InReview
    state
        .db
        .update_agent_status(&agent_id, crate::models::AgentStatus::InReview)?;

    // If branch was renamed, update the agent
    if let Some(new_branch) = renamed_branch {
        eprintln!("Updating agent branch from '{}' to '{}'", agent.branch, new_branch);
        state.db.update_agent_branch(&agent_id, &new_branch)?;
    }

    Ok(pr)
}

#[tauri::command]
pub fn open_pr_in_browser(url: String) -> Result<()> {
    GitHubService::open_pr_in_browser(&url)
}

#[tauri::command]
pub fn get_ci_status(pr_url: String) -> Result<CIStatusResponse> {
    GitHubService::get_ci_status(&pr_url)
}
