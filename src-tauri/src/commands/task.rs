use crate::db::{Database, OutputLine};
use crate::error::Result;
use crate::models::{CreateTaskInput, Task, TaskStatus};
use crate::services::{generate_task_info, ClaudeProcessService, GeneratedTaskInfo, WorktreeService};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Arc<Database>,
    pub claude: Arc<ClaudeProcessService>,
}

/// Event emitted when task metadata is updated
#[derive(Clone, serde::Serialize)]
pub struct TaskMetadataEvent {
    pub task_id: String,
    pub name: String,
    pub description: String,
    pub branch: String,
    pub worktree_path: String,
}

#[tauri::command]
pub fn get_tasks(state: State<Arc<AppState>>) -> Result<Vec<Task>> {
    state.db.get_all_tasks()
}

#[tauri::command]
pub fn get_task(state: State<Arc<AppState>>, id: String) -> Result<Option<Task>> {
    state.db.get_task(&id)
}

#[tauri::command]
pub async fn create_task(
    app_handle: AppHandle,
    state: State<'_, Arc<AppState>>,
    input: CreateTaskInput,
) -> Result<Task> {
    // 1. Create task immediately with temp name for instant UI feedback
    let task = Task::new_with_temp_name(input.repository_path.clone(), input.prompt.clone());

    // 2. Save to database immediately (with metadata_loading: true)
    state.db.insert_task(&task)?;

    // Clone what we need for background tasks
    let task_id = task.id.clone();
    let repo_path = task.repository_path.clone();
    let branch = task.branch.clone();
    let worktree_path = task.worktree_path.clone();
    let prompt = task.prompt.clone();
    let db = Arc::clone(&state.db);
    let claude = Arc::clone(&state.claude);
    let app_handle_clone = app_handle.clone();

    // 3. Spawn background task for worktree creation + Claude work
    tokio::spawn(async move {
        // Create worktree (blocking)
        let wt_result = tokio::task::spawn_blocking({
            let repo_path = repo_path.clone();
            let branch = branch.clone();
            let worktree_path = worktree_path.clone();
            move || WorktreeService::create_worktree(&repo_path, &branch, &worktree_path)
        })
        .await;

        match wt_result {
            Ok(Ok(())) => {
                // Worktree created, start Claude to work on the task
                let _ = claude.start(
                    app_handle_clone.clone(),
                    Arc::clone(&db),
                    &task_id,
                    &worktree_path,
                    &prompt,
                    false,
                );
                let _ = db.update_task_status(&task_id, TaskStatus::Running);
            }
            Ok(Err(e)) => {
                // Worktree creation failed
                eprintln!("Failed to create worktree: {}", e);
                let _ = db.update_task_status(&task_id, TaskStatus::Error);
            }
            Err(e) => {
                // Task panicked
                eprintln!("Worktree task panicked: {}", e);
                let _ = db.update_task_status(&task_id, TaskStatus::Error);
            }
        }
    });

    // 4. Spawn background task for metadata generation
    let task_id_for_meta = task.id.clone();
    let prompt_for_meta = task.prompt.clone();
    let repo_path_for_meta = task.repository_path.clone();
    let db_for_meta = Arc::clone(&state.db);
    let app_handle_for_meta = app_handle.clone();

    tokio::spawn(async move {
        // Clone variables for use inside spawn_blocking
        let db_for_blocking = Arc::clone(&db_for_meta);
        let prompt_for_blocking = prompt_for_meta.clone();

        // Generate metadata (blocking - calls Claude)
        let meta_result = tokio::task::spawn_blocking(move || {
            generate_task_info(&db_for_blocking, &prompt_for_blocking, &repo_path_for_meta)
        })
        .await;

        if let Ok(Ok(metadata)) = meta_result {
            // Update task in database
            if let Ok(Some(current_task)) = db_for_meta.get_task(&task_id_for_meta) {
                // Rename the git branch if the generated name is different
                let new_branch = if metadata.branch_name != current_task.branch {
                    // Try to rename the branch in the worktree
                    match WorktreeService::rename_branch(
                        &current_task.worktree_path,
                        &current_task.branch,
                        &metadata.branch_name,
                    ) {
                        Ok(()) => metadata.branch_name.clone(),
                        Err(e) => {
                            eprintln!("Failed to rename branch: {}", e);
                            current_task.branch.clone() // Keep original on error
                        }
                    }
                } else {
                    current_task.branch.clone()
                };

                // Keep the original worktree_path since we already created the worktree
                let _ = db_for_meta.update_task_metadata(
                    &task_id_for_meta,
                    &metadata.title,
                    &metadata.description,
                    &new_branch,
                    &current_task.worktree_path,
                );

                // Emit event to notify frontend
                let _ = app_handle_for_meta.emit(
                    "task-metadata",
                    TaskMetadataEvent {
                        task_id: task_id_for_meta,
                        name: metadata.title,
                        description: metadata.description,
                        branch: new_branch,
                        worktree_path: current_task.worktree_path,
                    },
                );
            }
        } else {
            // Metadata generation failed, use fallback
            if let Ok(Some(current_task)) = db_for_meta.get_task(&task_id_for_meta) {
                let fallback_title: String = prompt_for_meta.chars().take(50).collect();
                let fallback_desc: String = prompt_for_meta.chars().take(100).collect();

                let _ = db_for_meta.update_task_metadata(
                    &task_id_for_meta,
                    &fallback_title,
                    &fallback_desc,
                    &current_task.branch,
                    &current_task.worktree_path,
                );

                let _ = app_handle_for_meta.emit(
                    "task-metadata",
                    TaskMetadataEvent {
                        task_id: task_id_for_meta,
                        name: fallback_title,
                        description: fallback_desc,
                        branch: current_task.branch,
                        worktree_path: current_task.worktree_path,
                    },
                );
            }
        }
    });

    // 5. Return task immediately (frontend shows loading skeleton)
    Ok(task)
}

#[tauri::command]
pub async fn delete_task(state: State<'_, Arc<AppState>>, id: String) -> Result<()> {
    // Get task first
    let task = state.db.get_task(&id)?
        .ok_or_else(|| crate::error::AppError::TaskNotFound(id.clone()))?;

    // Stop process if running
    state.claude.stop(&id)?;

    // Remove worktree in background (can be slow)
    let repo_path = task.repository_path.clone();
    let worktree_path = task.worktree_path.clone();
    tokio::task::spawn_blocking(move || {
        let _ = WorktreeService::remove_worktree(&repo_path, &worktree_path);
    })
    .await
    .ok();

    // Delete from database
    state.db.delete_task(&id)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_tasks(state: State<'_, Arc<AppState>>, ids: Vec<String>) -> Result<u32> {
    let mut deleted_count = 0u32;

    for id in ids {
        // Get task first
        if let Ok(Some(task)) = state.db.get_task(&id) {
            // Stop process if running
            let _ = state.claude.stop(&id);

            // Remove worktree in background
            let repo_path = task.repository_path.clone();
            let worktree_path = task.worktree_path.clone();
            tokio::task::spawn_blocking(move || {
                let _ = WorktreeService::remove_worktree(&repo_path, &worktree_path);
            })
            .await
            .ok();

            // Delete from database
            if state.db.delete_task(&id).is_ok() {
                deleted_count += 1;
            }
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
pub fn stop_task(state: State<Arc<AppState>>, id: String) -> Result<()> {
    state.claude.stop(&id)?;
    state.db.update_task_status(&id, TaskStatus::Idle)?;
    Ok(())
}

#[tauri::command]
pub fn restart_task(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
    prompt: Option<String>,
) -> Result<()> {
    let task = state.db.get_task(&id)?
        .ok_or_else(|| crate::error::AppError::TaskNotFound(id.clone()))?;

    // Stop if already running
    state.claude.stop(&id)?;

    // Determine if this is a follow-up (continue conversation) or fresh restart
    let is_follow_up = prompt.is_some();
    let prompt_to_use = prompt.unwrap_or(task.prompt);

    // Start Claude process (continue conversation if follow-up)
    state.claude.start(
        app_handle,
        Arc::clone(&state.db),
        &id,
        &task.worktree_path,
        &prompt_to_use,
        is_follow_up, // Continue conversation for follow-ups
    )?;
    state.db.update_task_status(&id, TaskStatus::Running)?;

    Ok(())
}

#[tauri::command]
pub fn get_task_output(
    state: State<Arc<AppState>>,
    task_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<OutputLine>> {
    state.db.get_task_output(&task_id, limit, offset)
}

#[tauri::command]
pub fn get_task_output_count(
    state: State<Arc<AppState>>,
    task_id: String,
) -> Result<i64> {
    state.db.get_task_output_count(&task_id)
}

/// Generate task info (title, description, branch name) from a prompt
#[tauri::command]
pub fn generate_task_metadata(
    state: State<Arc<AppState>>,
    prompt: String,
    repository_path: String,
) -> Result<GeneratedTaskInfo> {
    generate_task_info(&state.db, &prompt, &repository_path)
}

/// Update task name
#[tauri::command]
pub fn update_task_name(
    state: State<Arc<AppState>>,
    id: String,
    name: String,
) -> Result<()> {
    state.db.update_task_name(&id, &name)
}

/// Update task description
#[tauri::command]
pub fn update_task_description(
    state: State<Arc<AppState>>,
    id: String,
    description: String,
) -> Result<()> {
    state.db.update_task_description(&id, &description)
}

#[tauri::command]
pub fn set_task_auto_accept_edits(
    state: State<Arc<AppState>>,
    id: String,
    enabled: bool,
) -> Result<()> {
    state.db.set_task_auto_accept_edits(&id, enabled)
}

/// Take over manual control of a task (stops Claude, checkouts branch in root)
#[tauri::command]
pub fn takeover_task(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
) -> Result<TakeoverResult> {
    use crate::services::GitService;

    let task = state.db.get_task(&id)?
        .ok_or_else(|| crate::error::AppError::TaskNotFound(id.clone()))?;

    // Stop the Claude process if running
    if task.status == TaskStatus::Running {
        state.claude.stop(&id)?;
    }

    // 1. Commit any uncommitted changes in the worktree
    let wip_commit = if GitService::has_uncommitted_changes(&task.worktree_path)? {
        GitService::commit_all(&task.worktree_path, "WIP: takeover checkpoint")?
    } else {
        // Get current HEAD as the "wip commit" reference point
        let output = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&task.worktree_path)
            .output()
            .map_err(|e| crate::error::AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    };

    // 2. Get the current branch in the repo root
    let original_branch = GitService::get_current_branch(&task.repository_path)?;

    // 3. Stash any uncommitted changes in the repo root
    let had_stash = GitService::stash_push(&task.repository_path, &format!("mux-takeover-{}", id))?;

    // 4. Checkout the worktree's branch in the repo root
    GitService::checkout_branch(&task.repository_path, &task.branch)?;

    // 5. Store takeover state
    state.db.set_takeover_state(&id, &original_branch, &wip_commit, had_stash)?;

    // 6. Update status to manual_control
    state.db.update_task_status(&id, TaskStatus::ManualControl)?;

    // Emit status change event
    let _ = app_handle.emit(
        "task-status",
        serde_json::json!({
            "task_id": id,
            "status": "manual_control"
        }),
    );

    Ok(TakeoverResult {
        original_branch,
        wip_commit,
        had_stash,
        repo_path: task.repository_path,
        branch: task.branch,
    })
}

#[derive(Debug, serde::Serialize)]
pub struct TakeoverResult {
    pub original_branch: String,
    pub wip_commit: String,
    pub had_stash: bool,
    pub repo_path: String,
    pub branch: String,
}

/// Hand back control to Claude (commits, restores root, resumes task)
#[tauri::command]
pub fn handback_task(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
    commit_message: Option<String>,
    prompt: Option<String>,
) -> Result<()> {
    use crate::services::GitService;

    let task = state.db.get_task(&id)?
        .ok_or_else(|| crate::error::AppError::TaskNotFound(id.clone()))?;

    // Check if task is in manual control mode
    if task.status != TaskStatus::ManualControl {
        return Err(crate::error::AppError::Other(format!(
            "Task is not in manual control mode (current status: {})",
            task.status.as_str()
        )));
    }

    // Get takeover state
    let takeover_state = state.db.get_takeover_state(&id)?
        .ok_or_else(|| crate::error::AppError::Other("No takeover state found".to_string()))?;

    // 1. If user made changes in root (which is now on the task branch), commit them
    if GitService::has_uncommitted_changes(&task.repository_path)? {
        let msg = commit_message.clone().unwrap_or_else(|| "Manual changes during takeover".to_string());
        GitService::commit_all(&task.repository_path, &msg)?;
    }

    // 2. If we have a WIP commit and user provided a commit message, squash them
    //    This is done by soft-resetting to before the WIP commit and re-committing
    if commit_message.is_some() {
        // Check if WIP commit exists and we can squash
        let current_head = {
            let output = std::process::Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(&task.repository_path)
                .output()
                .map_err(|e| crate::error::AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        };

        // If current HEAD is different from WIP commit, we have new commits to potentially squash
        if current_head != takeover_state.wip_commit {
            // Get the parent of the WIP commit to reset to
            if let Ok(parent) = GitService::get_parent_commit(&task.repository_path, &takeover_state.wip_commit) {
                // Soft reset to parent of WIP commit (keeps all changes staged)
                GitService::soft_reset(&task.repository_path, &parent)?;
                // Commit with user's message (squashing WIP + user changes)
                let msg = commit_message.unwrap_or_else(|| "Manual changes during takeover".to_string());
                GitService::commit_all(&task.repository_path, &msg)?;
            }
        }
    }

    // 3. Pull the changes back to the worktree (since we committed in root)
    //    The worktree shares the same git objects, so we just need to update it
    let _ = std::process::Command::new("git")
        .args(["checkout", &task.branch])
        .current_dir(&task.worktree_path)
        .output();

    // 4. Checkout original branch in root
    GitService::checkout_branch(&task.repository_path, &takeover_state.original_branch)?;

    // 5. Pop stash if we had one
    if takeover_state.had_stash {
        let _ = GitService::stash_pop(&task.repository_path);
    }

    // 6. Clear takeover state
    state.db.clear_takeover_state(&id)?;

    // 7. Determine the prompt to use
    let resume_prompt = prompt.unwrap_or_else(|| {
        "Continue working on the task. I made some manual changes - please review them and continue from where you left off.".to_string()
    });

    // 8. Start Claude process (continue conversation since we're resuming)
    state.claude.start(
        app_handle,
        Arc::clone(&state.db),
        &id,
        &task.worktree_path,
        &resume_prompt,
        true, // Continue conversation for handback
    )?;

    // Update status to running
    state.db.update_task_status(&id, TaskStatus::Running)?;

    Ok(())
}
