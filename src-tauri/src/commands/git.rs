use crate::commands::AppState;
use crate::error::{AppError, Result};
use crate::services::git::{CommitInfo, FileChange, FileDiff, GitService};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_task_changes(
    state: State<Arc<AppState>>,
    task_id: String,
) -> Result<Vec<FileChange>> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    let base_branch = GitService::get_default_branch(&task.repository_path)?;
    GitService::get_changed_files(&task.worktree_path, &base_branch)
}

#[tauri::command]
pub fn get_file_diff(
    state: State<Arc<AppState>>,
    task_id: String,
    file_path: String,
) -> Result<FileDiff> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    let base_branch = GitService::get_default_branch(&task.repository_path)?;
    GitService::get_file_diff(&task.worktree_path, &base_branch, &file_path)
}

#[tauri::command]
pub fn get_file_diff_with_context(
    state: State<Arc<AppState>>,
    task_id: String,
    file_path: String,
    context_lines: u32,
) -> Result<FileDiff> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    let base_branch = GitService::get_default_branch(&task.repository_path)?;
    GitService::get_file_diff_with_context(&task.worktree_path, &base_branch, &file_path, context_lines)
}

#[tauri::command]
pub fn get_full_diff(
    state: State<Arc<AppState>>,
    task_id: String,
) -> Result<String> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    let base_branch = GitService::get_default_branch(&task.repository_path)?;
    GitService::get_full_diff(&task.worktree_path, &base_branch)
}

#[tauri::command]
pub fn get_task_commits(
    state: State<Arc<AppState>>,
    task_id: String,
    limit: Option<i32>,
) -> Result<Vec<CommitInfo>> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    let base_branch = GitService::get_default_branch(&task.repository_path)?;
    GitService::get_commits(&task.worktree_path, &base_branch, limit)
}

/// Revert a specific file's changes in a worktree (restore from base branch)
#[tauri::command]
pub fn revert_file_changes(
    state: State<Arc<AppState>>,
    task_id: String,
    file_path: String,
) -> Result<()> {
    let task = state
        .db
        .get_task(&task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.clone()))?;

    let base_branch = GitService::get_default_branch(&task.repository_path)?;

    let output = std::process::Command::new("git")
        .args(["checkout", &format!("origin/{}", base_branch), "--", &file_path])
        .current_dir(&task.worktree_path)
        .output()
        .map_err(|e| AppError::Git(format!("Failed to revert file: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("did not match") || stderr.contains("not in") {
            let full_path = std::path::Path::new(&task.worktree_path).join(&file_path);
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
