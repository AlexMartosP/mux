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
    log::info!("[create_task] repo={}, existing_branch={:?}, base_branch={:?}, prompt={}...",
        input.repository_path,
        input.existing_branch,
        input.base_branch,
        &input.prompt[..input.prompt.len().min(80)]);
    // 1. Create task immediately with temp name for instant UI feedback
    let task = if let Some(ref existing_branch) = input.existing_branch {
        // Use existing branch - create task with that branch name
        Task::new_with_metadata(
            input.repository_path.clone(),
            input.prompt.clone(),
            format!("Working on {}", existing_branch),
            String::new(),
            existing_branch.clone(),
            true, // metadata_loading
            input.base_branch.clone(),
        )
    } else {
        Task::new_with_temp_name(input.repository_path.clone(), input.prompt.clone(), input.base_branch.clone())
    };

    // 2. Save to database immediately (with metadata_loading: true)
    state.db.insert_task(&task)?;

    // Clone what we need for background tasks
    let task_id = task.id.clone();
    let repo_path = task.repository_path.clone();
    let branch = task.branch.clone();
    let worktree_path = task.worktree_path.clone();
    let prompt = task.prompt.clone();
    let existing_branch = input.existing_branch.clone();
    let base_branch = input.base_branch.clone();
    let db = Arc::clone(&state.db);
    let claude = Arc::clone(&state.claude);
    let app_handle_clone = app_handle.clone();

    // Check max concurrent tasks setting
    let max_concurrent: u32 = state.db
        .get_setting("max_concurrent_tasks")
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let running_count = state.db.get_running_task_count().unwrap_or(0) as u32;
    let should_queue = max_concurrent > 0 && running_count >= max_concurrent;

    // 3. Spawn background task for worktree creation + Claude work
    tokio::spawn(async move {
        // Create worktree (blocking)
        let wt_result = tokio::task::spawn_blocking({
            let repo_path = repo_path.clone();
            let branch = branch.clone();
            let worktree_path = worktree_path.clone();
            let existing_branch = existing_branch.clone();
            let base_branch = base_branch.clone();
            move || {
                if existing_branch.is_some() {
                    WorktreeService::create_worktree_from_branch(&repo_path, &branch, &worktree_path)
                } else {
                    WorktreeService::create_worktree(&repo_path, &branch, &worktree_path, base_branch.as_deref())
                }
            }
        })
        .await;

        match wt_result {
            Ok(Ok(())) => {
                if should_queue {
                    // Queue the task - it will be started when a slot opens
                    let _ = db.update_task_status(&task_id, TaskStatus::Queued);
                    let _ = app_handle_clone.emit("task-status", serde_json::json!({
                        "task_id": task_id,
                        "status": "queued"
                    }));
                } else {
                    // Worktree created, start Claude to work on the task
                    match claude.start(
                        app_handle_clone.clone(),
                        Arc::clone(&db),
                        &task_id,
                        &worktree_path,
                        &prompt,
                        false,
                    ) {
                        Ok(_) => {
                            let _ = db.update_task_status(&task_id, TaskStatus::Running);
                            let _ = app_handle_clone.emit("task-status", serde_json::json!({
                                "task_id": task_id,
                                "status": "running"
                            }));
                        }
                        Err(e) => {
                            log::error!("[create_task] Failed to start Claude for task {}: {}", task_id, e);
                            let _ = db.update_task_status(&task_id, TaskStatus::Error);
                            let _ = app_handle_clone.emit("task-status", serde_json::json!({
                                "task_id": task_id,
                                "status": "error"
                            }));
                        }
                    }
                }
            }
            Ok(Err(e)) => {
                log::error!("[create_task] Failed to create worktree for task {}: {}", task_id, e);
                let _ = db.update_task_status(&task_id, TaskStatus::Error);
                let _ = app_handle_clone.emit("task-status", serde_json::json!({
                    "task_id": task_id,
                    "status": "error"
                }));
            }
            Err(e) => {
                log::error!("[create_task] Worktree task panicked for task {}: {}", task_id, e);
                let _ = db.update_task_status(&task_id, TaskStatus::Error);
                let _ = app_handle_clone.emit("task-status", serde_json::json!({
                    "task_id": task_id,
                    "status": "error"
                }));
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
                    // Wait for worktree to exist before renaming (it's created in parallel)
                    let worktree_exists = {
                        let mut attempts = 0;
                        const MAX_ATTEMPTS: u32 = 30; // 30 seconds max wait
                        loop {
                            if std::path::Path::new(&current_task.worktree_path).exists() {
                                break true;
                            }
                            attempts += 1;
                            if attempts >= MAX_ATTEMPTS {
                                log::warn!(
                                    "[{}] Worktree not created after {}s, skipping branch rename",
                                    task_id_for_meta,
                                    MAX_ATTEMPTS
                                );
                                break false;
                            }
                            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        }
                    };

                    if worktree_exists {
                        // Try to rename the branch in the worktree
                        log::info!(
                            "[{}] Renaming branch from '{}' to '{}'",
                            task_id_for_meta,
                            current_task.branch,
                            metadata.branch_name
                        );
                        match WorktreeService::rename_branch(
                            &current_task.worktree_path,
                            &current_task.branch,
                            &metadata.branch_name,
                        ) {
                            Ok(()) => {
                                log::info!(
                                    "[{}] Branch renamed successfully to '{}'",
                                    task_id_for_meta,
                                    metadata.branch_name
                                );
                                metadata.branch_name.clone()
                            }
                            Err(e) => {
                                log::error!(
                                    "[{}] Failed to rename branch from '{}' to '{}': {}",
                                    task_id_for_meta,
                                    current_task.branch,
                                    metadata.branch_name,
                                    e
                                );
                                current_task.branch.clone() // Keep original on error
                            }
                        }
                    } else {
                        current_task.branch.clone() // Keep original if worktree doesn't exist
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
pub fn stop_task(app_handle: AppHandle, state: State<Arc<AppState>>, id: String) -> Result<()> {
    log::info!("[stop_task] Stopping task {}", id);
    state.claude.stop(&id)?;
    state.db.update_task_status(&id, TaskStatus::Idle)?;
    let _ = app_handle.emit("task-status", serde_json::json!({
        "task_id": id,
        "status": "idle"
    }));
    log::info!("[stop_task] Task {} stopped", id);
    Ok(())
}

#[tauri::command]
pub fn restart_task(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
    prompt: Option<String>,
) -> Result<()> {
    log::info!("[restart_task] Restarting task {}, is_follow_up={}", id, prompt.is_some());

    let task = state.db.get_task(&id)?
        .ok_or_else(|| crate::error::AppError::TaskNotFound(id.clone()))?;

    // Stop if already running
    state.claude.stop(&id)?;

    // Determine if this is a follow-up (continue conversation) or fresh restart
    let is_follow_up = prompt.is_some();

    // If this is a follow-up, save the user message to the database
    if let Some(ref follow_up_prompt) = prompt {
        let timestamp = chrono::Utc::now().to_rfc3339();
        state.db.append_output(
            &id,
            "user_message",
            follow_up_prompt,
            None,
            None,
        )?;
        log::info!("[restart_task] Saved user follow-up message to database");

        // Emit the user message as output so the frontend can display it immediately
        let _ = app_handle.emit("task-output", serde_json::json!({
            "task_id": id,
            "output_type": "user_message",
            "content": follow_up_prompt,
            "timestamp": timestamp
        }));
    }

    let prompt_to_use = prompt.unwrap_or(task.prompt);

    log::info!("[restart_task] Starting Claude in worktree={}, continue={}", task.worktree_path, is_follow_up);

    // Start Claude process (continue conversation if follow-up)
    match state.claude.start(
        app_handle.clone(),
        Arc::clone(&state.db),
        &id,
        &task.worktree_path,
        &prompt_to_use,
        is_follow_up,
    ) {
        Ok(_) => {
            state.db.update_task_status(&id, TaskStatus::Running)?;
            let _ = app_handle.emit("task-status", serde_json::json!({
                "task_id": id,
                "status": "running"
            }));
            log::info!("[restart_task] Task {} restarted successfully", id);
            Ok(())
        }
        Err(e) => {
            log::error!("[restart_task] Failed to start Claude for task {}: {}", id, e);
            state.db.update_task_status(&id, TaskStatus::Error)?;
            let _ = app_handle.emit("task-status", serde_json::json!({
                "task_id": id,
                "status": "error"
            }));
            Err(e)
        }
    }
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
pub fn get_cost_summary(
    state: State<Arc<AppState>>,
) -> Result<crate::db::CostSummary> {
    state.db.get_cost_summary()
}

#[tauri::command]
pub fn set_task_pinned(
    state: State<Arc<AppState>>,
    id: String,
    pinned: bool,
) -> Result<()> {
    state.db.set_task_pinned(&id, pinned)
}

#[tauri::command]
pub fn get_notifications(
    state: State<Arc<AppState>>,
    limit: Option<i64>,
    include_read: Option<bool>,
) -> Result<Vec<crate::db::NotificationEntry>> {
    state.db.get_notifications(limit.unwrap_or(50), include_read.unwrap_or(true))
}

#[tauri::command]
pub fn get_unread_notification_count(
    state: State<Arc<AppState>>,
) -> Result<i64> {
    state.db.get_unread_notification_count()
}

#[tauri::command]
pub fn mark_notification_read(
    state: State<Arc<AppState>>,
    id: i64,
) -> Result<()> {
    state.db.mark_notification_read(id)
}

#[tauri::command]
pub fn mark_all_notifications_read(
    state: State<Arc<AppState>>,
) -> Result<()> {
    state.db.mark_all_notifications_read()
}

#[tauri::command]
pub fn clear_notifications(
    state: State<Arc<AppState>>,
) -> Result<()> {
    state.db.clear_notifications()
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

    log::info!("[takeover] Starting takeover for task {}", id);

    let task = state.db.get_task(&id)?
        .ok_or_else(|| crate::error::AppError::TaskNotFound(id.clone()))?;

    log::info!("[takeover] Task status={}, branch={}, worktree={}, repo={}",
        task.status.as_str(), task.branch, task.worktree_path, task.repository_path);

    // Stop the Claude process if running
    if task.status == TaskStatus::Running {
        log::info!("[takeover] Stopping running Claude process for task {}", id);
        state.claude.stop(&id)?;
        log::info!("[takeover] Claude process stopped");
    }

    // 1. Commit any uncommitted changes in the worktree
    log::info!("[takeover] Step 1: Checking for uncommitted changes in worktree");
    let wip_commit = if GitService::has_uncommitted_changes(&task.worktree_path)? {
        log::info!("[takeover] Worktree has uncommitted changes, creating WIP commit");
        let commit = GitService::commit_all(&task.worktree_path, "WIP: takeover checkpoint")?;
        log::info!("[takeover] WIP commit created: {}", commit);
        commit
    } else {
        log::info!("[takeover] No uncommitted changes in worktree, getting HEAD");
        let output = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&task.worktree_path)
            .output()
            .map_err(|e| crate::error::AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        let head = String::from_utf8_lossy(&output.stdout).trim().to_string();
        log::info!("[takeover] Worktree HEAD: {}", head);
        head
    };

    // 2. Get the current branch in the repo root
    log::info!("[takeover] Step 2: Getting current branch in repo root");
    let original_branch = GitService::get_current_branch(&task.repository_path)?;
    log::info!("[takeover] Original branch: {}", original_branch);

    // 3. Stash any uncommitted changes in the repo root
    log::info!("[takeover] Step 3: Stashing uncommitted changes in repo root");
    let had_stash = GitService::stash_push(&task.repository_path, &format!("mux-takeover-{}", id))?;
    log::info!("[takeover] Had stash: {}", had_stash);

    // 4. Detach HEAD in the worktree so the branch is freed for checkout in root
    log::info!("[takeover] Step 4: Detaching HEAD in worktree to free branch '{}'", task.branch);

    // First verify the worktree path exists
    if !std::path::Path::new(&task.worktree_path).exists() {
        log::error!("[takeover] Worktree path does not exist: {}", task.worktree_path);
        return Err(crate::error::AppError::Git(format!(
            "Worktree path does not exist: {}. The worktree may have been deleted externally.",
            task.worktree_path
        )));
    }

    let detach_output = std::process::Command::new("git")
        .args(["checkout", "--detach"])
        .current_dir(&task.worktree_path)
        .output()
        .map_err(|e| crate::error::AppError::Git(format!("Failed to detach worktree HEAD: {}", e)))?;
    if !detach_output.status.success() {
        let stderr = String::from_utf8_lossy(&detach_output.stderr);
        log::error!("[takeover] Failed to detach worktree HEAD: {}", stderr);
        return Err(crate::error::AppError::Git(format!("Failed to detach worktree HEAD: {}", stderr)));
    }
    log::info!("[takeover] Worktree HEAD detached successfully");

    // 5. Checkout the worktree's branch in the repo root
    log::info!("[takeover] Step 5: Checking out branch '{}' in repo root", task.branch);
    GitService::checkout_branch(&task.repository_path, &task.branch)?;
    log::info!("[takeover] Branch checked out in repo root");

    // 6. Store takeover state
    log::info!("[takeover] Step 6: Storing takeover state in DB");
    state.db.set_takeover_state(&id, &original_branch, &wip_commit, had_stash)?;

    // 7. Update status to manual_control
    log::info!("[takeover] Step 7: Updating task status to manual_control");
    state.db.update_task_status(&id, TaskStatus::ManualControl)?;

    // Emit status change event
    let _ = app_handle.emit(
        "task-status",
        serde_json::json!({
            "task_id": id,
            "status": "manual_control"
        }),
    );

    log::info!("[takeover] Takeover complete for task {}", id);

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

    log::info!("[handback] Starting handback for task {}", id);

    let task = state.db.get_task(&id)?
        .ok_or_else(|| crate::error::AppError::TaskNotFound(id.clone()))?;

    log::info!("[handback] Task status={}, branch={}, worktree={}, repo={}",
        task.status.as_str(), task.branch, task.worktree_path, task.repository_path);

    // Check if task is in manual control mode
    if task.status != TaskStatus::ManualControl {
        log::error!("[handback] Task not in manual_control mode: {}", task.status.as_str());
        return Err(crate::error::AppError::Other(format!(
            "Task is not in manual control mode (current status: {})",
            task.status.as_str()
        )));
    }

    // Get takeover state
    let takeover_state = state.db.get_takeover_state(&id)?
        .ok_or_else(|| {
            log::error!("[handback] No takeover state found for task {}", id);
            crate::error::AppError::Other("No takeover state found".to_string())
        })?;

    log::info!("[handback] Takeover state: original_branch={}, wip_commit={}, had_stash={}",
        takeover_state.original_branch, takeover_state.wip_commit, takeover_state.had_stash);

    // 1. If user made changes in root (which is now on the task branch), commit them
    log::info!("[handback] Step 1: Checking for uncommitted changes in repo root");
    if GitService::has_uncommitted_changes(&task.repository_path)? {
        let msg = commit_message.clone().unwrap_or_else(|| "Manual changes during takeover".to_string());
        log::info!("[handback] Committing changes in repo root: {}", msg);
        GitService::commit_all(&task.repository_path, &msg)?;
    } else {
        log::info!("[handback] No uncommitted changes in repo root");
    }

    // 2. If we have a WIP commit and user provided a commit message, squash them
    log::info!("[handback] Step 2: Checking if squash is needed");
    if commit_message.is_some() {
        let current_head = {
            let output = std::process::Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(&task.repository_path)
                .output()
                .map_err(|e| crate::error::AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        };
        log::info!("[handback] Current HEAD: {}, WIP commit: {}", current_head, takeover_state.wip_commit);

        if current_head != takeover_state.wip_commit {
            // Verify WIP commit is an ancestor of current HEAD before squashing
            // This prevents data loss if user hard-reset or rebased
            let is_ancestor = std::process::Command::new("git")
                .args(["merge-base", "--is-ancestor", &takeover_state.wip_commit, &current_head])
                .current_dir(&task.repository_path)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);

            if !is_ancestor {
                log::warn!("[handback] WIP commit {} is not an ancestor of HEAD {}, skipping squash to prevent data loss",
                    takeover_state.wip_commit, current_head);
            } else if let Ok(parent) = GitService::get_parent_commit(&task.repository_path, &takeover_state.wip_commit) {
                log::info!("[handback] Squashing: soft reset to parent {} and re-commit", parent);
                GitService::soft_reset(&task.repository_path, &parent)?;
                let msg = commit_message.unwrap_or_else(|| "Manual changes during takeover".to_string());
                GitService::commit_all(&task.repository_path, &msg)?;
            } else {
                log::warn!("[handback] Could not get parent of WIP commit, skipping squash");
            }
        } else {
            log::info!("[handback] HEAD == WIP commit, no squash needed");
        }
    }

    // 3. Re-attach worktree to the branch (it was detached during takeover)
    log::info!("[handback] Step 3: Re-attaching worktree to branch '{}'", task.branch);

    // First verify the worktree path exists
    if !std::path::Path::new(&task.worktree_path).exists() {
        log::error!("[handback] Worktree path does not exist: {}", task.worktree_path);
        return Err(crate::error::AppError::Git(format!(
            "Worktree path does not exist: {}. The worktree may have been deleted externally.",
            task.worktree_path
        )));
    }

    let checkout_output = std::process::Command::new("git")
        .args(["checkout", &task.branch])
        .current_dir(&task.worktree_path)
        .output()
        .map_err(|e| crate::error::AppError::Git(format!(
            "Failed to execute checkout in worktree: {}", e
        )))?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr);
        log::error!("[handback] Failed to re-attach worktree to branch: {}", stderr);
        return Err(crate::error::AppError::Git(format!(
            "Failed to re-attach worktree to branch '{}': {}",
            task.branch, stderr
        )));
    }
    log::info!("[handback] Worktree re-attached to branch successfully");

    // 4. Checkout original branch in root (this frees the task branch for the worktree)
    log::info!("[handback] Step 4: Checking out original branch '{}' in repo root", takeover_state.original_branch);
    GitService::checkout_branch(&task.repository_path, &takeover_state.original_branch)?;
    log::info!("[handback] Original branch restored in repo root");

    // 5. Pop stash if we had one
    if takeover_state.had_stash {
        log::info!("[handback] Step 5: Popping stash");
        let _ = GitService::stash_pop(&task.repository_path);
    } else {
        log::info!("[handback] Step 5: No stash to pop");
    }

    // 6. Clear takeover state
    log::info!("[handback] Step 6: Clearing takeover state from DB");
    state.db.clear_takeover_state(&id)?;

    // 7. Determine the prompt to use
    let resume_prompt = prompt.unwrap_or_else(|| {
        "Continue working on the task. I made some manual changes - please review them and continue from where you left off.".to_string()
    });
    log::info!("[handback] Step 7: Resume prompt: {}...", &resume_prompt[..resume_prompt.len().min(80)]);

    // 8. Start Claude process (continue conversation since we're resuming)
    log::info!("[handback] Step 8: Starting Claude process for handback");
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

    log::info!("[handback] Handback complete for task {}", id);

    Ok(())
}
