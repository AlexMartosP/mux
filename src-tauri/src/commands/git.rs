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
