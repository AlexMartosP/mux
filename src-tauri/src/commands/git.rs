use crate::commands::AppState;
use crate::error::{AppError, Result};
use crate::services::git::{CommitInfo, FileChange, FileDiff, GitService};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_agent_changes(
    state: State<Arc<AppState>>,
    agent_id: String,
) -> Result<Vec<FileChange>> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    let base_branch = GitService::get_default_branch(&agent.repository_path)?;
    GitService::get_changed_files(&agent.worktree_path, &base_branch)
}

#[tauri::command]
pub fn get_file_diff(
    state: State<Arc<AppState>>,
    agent_id: String,
    file_path: String,
) -> Result<FileDiff> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    let base_branch = GitService::get_default_branch(&agent.repository_path)?;
    GitService::get_file_diff(&agent.worktree_path, &base_branch, &file_path)
}

#[tauri::command]
pub fn get_file_diff_with_context(
    state: State<Arc<AppState>>,
    agent_id: String,
    file_path: String,
    context_lines: u32,
) -> Result<FileDiff> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    let base_branch = GitService::get_default_branch(&agent.repository_path)?;
    GitService::get_file_diff_with_context(&agent.worktree_path, &base_branch, &file_path, context_lines)
}

#[tauri::command]
pub fn get_full_diff(
    state: State<Arc<AppState>>,
    agent_id: String,
) -> Result<String> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    let base_branch = GitService::get_default_branch(&agent.repository_path)?;
    GitService::get_full_diff(&agent.worktree_path, &base_branch)
}

#[tauri::command]
pub fn get_agent_commits(
    state: State<Arc<AppState>>,
    agent_id: String,
    limit: Option<i32>,
) -> Result<Vec<CommitInfo>> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    let base_branch = GitService::get_default_branch(&agent.repository_path)?;
    GitService::get_commits(&agent.worktree_path, &base_branch, limit)
}

/// Revert a specific file's changes in a worktree (restore from base branch)
#[tauri::command]
pub fn revert_file_changes(
    state: State<Arc<AppState>>,
    agent_id: String,
    file_path: String,
) -> Result<()> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    let base_branch = GitService::get_default_branch(&agent.repository_path)?;

    let output = std::process::Command::new("git")
        .args(["checkout", &format!("origin/{}", base_branch), "--", &file_path])
        .current_dir(&agent.worktree_path)
        .output()
        .map_err(|e| AppError::Git(format!("Failed to revert file: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("did not match") || stderr.contains("not in") {
            let full_path = std::path::Path::new(&agent.worktree_path).join(&file_path);
            if full_path.exists() {
                std::fs::remove_file(&full_path)?;
            }
        } else {
            return Err(AppError::Git(format!("Failed to revert file: {}", stderr)));
        }
    }

    Ok(())
}

/// List local branches for a repository
#[tauri::command]
pub fn list_branches(repository_path: String) -> Result<Vec<BranchInfo>> {
    let output = std::process::Command::new("git")
        .args(["branch", "--format=%(refname:short)%(HEAD) %(objectname:short) %(committerdate:relative)"])
        .current_dir(&repository_path)
        .output()
        .map_err(|e| AppError::Git(format!("Failed to list branches: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::Git("Failed to list branches".into()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<BranchInfo> = stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() { return None; }
            // Format: "branch-name* short-hash relative-date" (star if current)
            let is_current = line.contains('*');
            let line = line.replace('*', "");
            let parts: Vec<&str> = line.splitn(3, ' ').collect();
            if parts.is_empty() { return None; }
            Some(BranchInfo {
                name: parts[0].trim().to_string(),
                is_current,
                short_hash: parts.get(1).unwrap_or(&"").to_string(),
                last_commit_date: parts.get(2).unwrap_or(&"").to_string(),
            })
        })
        .collect();

    Ok(branches)
}

#[derive(Debug, serde::Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub short_hash: String,
    pub last_commit_date: String,
}

/// Get the base branch that an agent's branch was forked from
/// This queries git to find the merge-base with common branches
#[tauri::command]
pub fn get_branch_base(
    state: State<Arc<AppState>>,
    agent_id: String,
) -> Result<Option<String>> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    // If we have a stored base_branch, verify it's still valid
    if let Some(ref base) = agent.base_branch {
        // Check if the base branch still exists
        let check = std::process::Command::new("git")
            .args(["rev-parse", "--verify", &format!("origin/{}", base)])
            .current_dir(&agent.worktree_path)
            .output();

        if check.is_ok() && check.unwrap().status.success() {
            return Ok(Some(base.clone()));
        }
    }

    // Fall back to finding merge-base with default branch
    let default_branch = GitService::get_default_branch(&agent.repository_path)?;

    // Get merge-base between current branch and default branch
    let output = std::process::Command::new("git")
        .args(["merge-base", "HEAD", &format!("origin/{}", default_branch)])
        .current_dir(&agent.worktree_path)
        .output()
        .map_err(|e| AppError::Git(format!("Failed to get merge-base: {}", e)))?;

    if output.status.success() {
        Ok(Some(default_branch))
    } else {
        Ok(agent.base_branch.clone())
    }
}

/// Update the base_branch field for an agent (called when branch is rebased)
#[tauri::command]
pub fn update_agent_base_branch(
    state: State<Arc<AppState>>,
    agent_id: String,
    base_branch: String,
) -> Result<()> {
    state.db.update_agent_base_branch(&agent_id, &base_branch)
}

/// Refresh git stats (total additions/deletions) for an agent
#[tauri::command]
pub fn refresh_agent_git_stats(
    state: State<Arc<AppState>>,
    agent_id: String,
) -> Result<(i32, i32)> {
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    let base_branch = GitService::get_default_branch(&agent.repository_path)?;
    let changes = GitService::get_changed_files(&agent.worktree_path, &base_branch)?;

    // Sum up all additions and deletions
    let total_additions: i32 = changes.iter().map(|c| c.additions).sum();
    let total_deletions: i32 = changes.iter().map(|c| c.deletions).sum();

    // Update the agent in the database
    state.db.update_agent_git_stats(&agent_id, total_additions, total_deletions)?;

    Ok((total_additions, total_deletions))
}
