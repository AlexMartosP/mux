use crate::db::{Database, OutputLine};
use crate::error::Result;
use crate::events::emit_agent_updated;
use crate::models::{Agent, AgentStatus, Message, SpawnAgentInput};
use crate::services::{generate_agent_info, ClaudeProcessService, GeneratedAgentInfo, WorktreeService};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Arc<Database>,
    pub claude: Arc<ClaudeProcessService>,
}

/// Event emitted during agent setup progress
#[derive(Clone, serde::Serialize)]
pub struct AgentSetupProgressEvent {
    pub agent_id: String,
    pub stage: String,
    pub message: String,
}

#[tauri::command]
pub fn get_agents(state: State<Arc<AppState>>) -> Result<Vec<Agent>> {
    state.db.get_all_agents()
}

#[tauri::command]
pub fn get_agent(state: State<Arc<AppState>>, id: String) -> Result<Option<Agent>> {
    state.db.get_agent(&id)
}

#[tauri::command]
pub fn get_agents_by_workspace(
    state: State<Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<Agent>> {
    state.db.get_agents_by_workspace(Some(&workspace_id))
}

#[tauri::command]
pub async fn spawn_agent(
    app_handle: AppHandle,
    state: State<'_, Arc<AppState>>,
    input: SpawnAgentInput,
) -> Result<Agent> {
    log::info!("[spawn_agent] repo={}, existing_branch={:?}, base_branch={:?}, branch_name={:?}, workspace_id={}, prompt={}...",
        input.repository_path,
        input.existing_branch,
        input.base_branch,
        input.branch_name,
        input.workspace_id,
        &input.prompt[..input.prompt.len().min(80)]);

    // Validate workspace exists
    let _workspace = state.db.get_workspace(&input.workspace_id)?
        .ok_or_else(|| crate::error::AppError::Other(format!("Workspace '{}' not found", input.workspace_id)))?;

    // 1. Create agent immediately with temp name for instant UI feedback
    let mut agent = if let Some(ref existing_branch) = input.existing_branch {
        // Use existing branch - create agent with that branch name
        Agent::new_with_metadata(
            input.repository_path.clone(),
            input.prompt.clone(),
            format!("Working on {}", existing_branch),
            String::new(),
            existing_branch.clone(),
            true, // metadata_loading
            input.base_branch.clone(),
        )
    } else if let Some(ref custom_branch_name) = input.branch_name {
        // Use custom branch name - still needs metadata generation for name/description
        Agent::new_with_custom_branch(
            input.repository_path.clone(),
            input.prompt.clone(),
            custom_branch_name.clone(),
            input.base_branch.clone(),
        )
    } else {
        Agent::new_with_temp_name(input.repository_path.clone(), input.prompt.clone(), input.base_branch.clone())
    };

    // Set workspace_id (now required)
    agent.workspace_id = Some(input.workspace_id.clone());

    // Look up setup script from workspace repository
    let setup_script = state.db.get_workspace_repository(&input.workspace_id, &input.repository_path)
        .ok()
        .flatten()
        .and_then(|repo| repo.setup_script);

    // 2. Save to database immediately (with metadata_loading: true, status: SettingUp)
    state.db.insert_agent(&agent)?;
    state.db.update_agent_status(&agent.id, AgentStatus::SettingUp)?;

    // Emit initial setup progress
    let _ = app_handle.emit(
        "agent-setup-progress",
        AgentSetupProgressEvent {
            agent_id: agent.id.clone(),
            stage: "initializing".to_string(),
            message: "Initializing agent...".to_string(),
        },
    );
    emit_agent_updated(&app_handle, &state.db, &agent.id);

    // Clone what we need for background tasks
    let agent_id = agent.id.clone();
    let repo_path = agent.repository_path.clone();
    let branch = agent.branch.clone();
    let worktree_path = agent.worktree_path.clone();
    let prompt = agent.prompt.clone();
    let existing_branch = input.existing_branch.clone();
    let base_branch = input.base_branch.clone();
    let setup_script_clone = setup_script.clone();
    let images = input.images.clone();
    let db = Arc::clone(&state.db);
    let claude = Arc::clone(&state.claude);
    let app_handle_clone = app_handle.clone();

    // Check max concurrent agents setting
    let max_concurrent: u32 = state.db
        .get_setting("max_concurrent_agents")
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let running_count = state.db.get_running_agent_count().unwrap_or(0) as u32;
    let should_queue = max_concurrent > 0 && running_count >= max_concurrent;

    // 3. Spawn background task for worktree creation + Claude work
    tokio::spawn(async move {
        // Emit worktree creation progress
        let _ = app_handle_clone.emit(
            "agent-setup-progress",
            AgentSetupProgressEvent {
                agent_id: agent_id.clone(),
                stage: "creating_worktree".to_string(),
                message: "Creating worktree...".to_string(),
            },
        );

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
                // Run setup script if configured
                if let Some(ref script) = setup_script_clone {
                    let _ = app_handle_clone.emit(
                        "agent-setup-progress",
                        AgentSetupProgressEvent {
                            agent_id: agent_id.clone(),
                            stage: "running_setup".to_string(),
                            message: "Running setup script...".to_string(),
                        },
                    );

                    let script = script.clone();
                    let wt_path = worktree_path.clone();
                    let script_result = tokio::task::spawn_blocking(move || {
                        execute_script(&script, &wt_path)
                    }).await;

                    match script_result {
                        Ok(Ok(())) => {
                            log::info!("[spawn_agent] Setup script completed successfully for agent {}", agent_id);
                        }
                        Ok(Err(e)) => {
                            log::error!("[spawn_agent] Setup script failed for agent {}: {}", agent_id, e);
                            // Continue anyway - setup script failure shouldn't block agent
                        }
                        Err(e) => {
                            log::error!("[spawn_agent] Setup script task panicked for agent {}: {}", agent_id, e);
                        }
                    }
                }

                if should_queue {
                    // Queue the agent - it will be started when a slot opens
                    let _ = db.update_agent_status(&agent_id, AgentStatus::Queued);
                    emit_agent_updated(&app_handle_clone, &db, &agent_id);
                } else {
                    // Emit starting agent progress
                    let _ = app_handle_clone.emit(
                        "agent-setup-progress",
                        AgentSetupProgressEvent {
                            agent_id: agent_id.clone(),
                            stage: "starting_agent".to_string(),
                            message: "Starting agent...".to_string(),
                        },
                    );

                    // Worktree created, start Claude to work on the agent
                    match claude.start(
                        app_handle_clone.clone(),
                        Arc::clone(&db),
                        &agent_id,
                        &worktree_path,
                        &prompt,
                        false,
                        images.as_deref(),
                    ) {
                        Ok(_) => {
                            let _ = db.update_agent_status(&agent_id, AgentStatus::Running);
                            emit_agent_updated(&app_handle_clone, &db, &agent_id);
                        }
                        Err(e) => {
                            log::error!("[spawn_agent] Failed to start Claude for agent {}: {}", agent_id, e);
                            let _ = db.update_agent_status(&agent_id, AgentStatus::Error);
                            emit_agent_updated(&app_handle_clone, &db, &agent_id);
                        }
                    }
                }
            }
            Ok(Err(e)) => {
                log::error!("[spawn_agent] Failed to create worktree for agent {}: {}", agent_id, e);
                let _ = db.update_agent_status(&agent_id, AgentStatus::Error);
                emit_agent_updated(&app_handle_clone, &db, &agent_id);
            }
            Err(e) => {
                log::error!("[spawn_agent] Worktree task panicked for agent {}: {}", agent_id, e);
                let _ = db.update_agent_status(&agent_id, AgentStatus::Error);
                emit_agent_updated(&app_handle_clone, &db, &agent_id);
            }
        }
    });

    // 4. Spawn background task for metadata generation
    let agent_id_for_meta = agent.id.clone();
    let prompt_for_meta = agent.prompt.clone();
    let repo_path_for_meta = agent.repository_path.clone();
    let db_for_meta = Arc::clone(&state.db);
    let app_handle_for_meta = app_handle.clone();

    tokio::spawn(async move {
        // Emit metadata generation progress
        let _ = app_handle_for_meta.emit(
            "agent-setup-progress",
            AgentSetupProgressEvent {
                agent_id: agent_id_for_meta.clone(),
                stage: "generating_metadata".to_string(),
                message: "Generating agent info...".to_string(),
            },
        );

        // Clone variables for use inside spawn_blocking
        let db_for_blocking = Arc::clone(&db_for_meta);
        let prompt_for_blocking = prompt_for_meta.clone();

        // Generate metadata (blocking - calls Claude)
        let meta_result = tokio::task::spawn_blocking(move || {
            generate_agent_info(&db_for_blocking, &prompt_for_blocking, &repo_path_for_meta)
        })
        .await;

        if let Ok(Ok(metadata)) = meta_result {
            // Update agent in database
            if let Ok(Some(current_agent)) = db_for_meta.get_agent(&agent_id_for_meta) {
                // Rename the git branch if the generated name is different
                let new_branch = if metadata.branch_name != current_agent.branch {
                    // Wait for worktree to exist before renaming (it's created in parallel)
                    let worktree_exists = {
                        let mut attempts = 0;
                        const MAX_ATTEMPTS: u32 = 30; // 30 seconds max wait
                        loop {
                            if std::path::Path::new(&current_agent.worktree_path).exists() {
                                break true;
                            }
                            attempts += 1;
                            if attempts >= MAX_ATTEMPTS {
                                log::warn!(
                                    "[{}] Worktree not created after {}s, skipping branch rename",
                                    agent_id_for_meta,
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
                            agent_id_for_meta,
                            current_agent.branch,
                            metadata.branch_name
                        );
                        match WorktreeService::rename_branch(
                            &current_agent.worktree_path,
                            &current_agent.branch,
                            &metadata.branch_name,
                        ) {
                            Ok(()) => {
                                log::info!(
                                    "[{}] Branch renamed successfully to '{}'",
                                    agent_id_for_meta,
                                    metadata.branch_name
                                );
                                metadata.branch_name.clone()
                            }
                            Err(e) => {
                                log::error!(
                                    "[{}] Failed to rename branch from '{}' to '{}': {}",
                                    agent_id_for_meta,
                                    current_agent.branch,
                                    metadata.branch_name,
                                    e
                                );
                                current_agent.branch.clone() // Keep original on error
                            }
                        }
                    } else {
                        current_agent.branch.clone() // Keep original if worktree doesn't exist
                    }
                } else {
                    current_agent.branch.clone()
                };

                // Keep the original worktree_path since we already created the worktree
                let _ = db_for_meta.update_agent_metadata(
                    &agent_id_for_meta,
                    &metadata.title,
                    &metadata.description,
                    &new_branch,
                    &current_agent.worktree_path,
                );

                // Emit event to notify frontend
                emit_agent_updated(&app_handle_for_meta, &db_for_meta, &agent_id_for_meta);
            }
        } else {
            // Metadata generation failed, use fallback
            if let Ok(Some(current_agent)) = db_for_meta.get_agent(&agent_id_for_meta) {
                let fallback_title: String = prompt_for_meta.chars().take(50).collect();
                let fallback_desc: String = prompt_for_meta.chars().take(100).collect();

                let _ = db_for_meta.update_agent_metadata(
                    &agent_id_for_meta,
                    &fallback_title,
                    &fallback_desc,
                    &current_agent.branch,
                    &current_agent.worktree_path,
                );

                emit_agent_updated(&app_handle_for_meta, &db_for_meta, &agent_id_for_meta);
            }
        }
    });

    // 5. Return agent immediately (frontend shows loading skeleton)
    Ok(agent)
}

#[tauri::command]
pub async fn delete_agent(state: State<'_, Arc<AppState>>, id: String) -> Result<()> {
    // Get agent first
    let agent = state.db.get_agent(&id)?
        .ok_or_else(|| crate::error::AppError::AgentNotFound(id.clone()))?;

    // Stop process if running
    state.claude.stop(&id)?;

    // Look up teardown script if agent has a workspace
    let teardown_script = if let Some(ref ws_id) = agent.workspace_id {
        state.db.get_workspace_repository(ws_id, &agent.repository_path)
            .ok()
            .flatten()
            .and_then(|repo| repo.teardown_script)
    } else {
        None
    };

    // Run teardown script if configured
    if let Some(ref script) = teardown_script {
        let script = script.clone();
        let wt_path = agent.worktree_path.clone();
        let script_result = tokio::task::spawn_blocking(move || {
            execute_script(&script, &wt_path)
        }).await;

        match script_result {
            Ok(Ok(())) => {
                log::info!("[delete_agent] Teardown script completed successfully for agent {}", id);
            }
            Ok(Err(e)) => {
                log::error!("[delete_agent] Teardown script failed for agent {}: {}", id, e);
                // Continue anyway - teardown failure shouldn't block deletion
            }
            Err(e) => {
                log::error!("[delete_agent] Teardown script task panicked for agent {}: {}", id, e);
            }
        }
    }

    // Remove worktree in background (can be slow)
    let repo_path = agent.repository_path.clone();
    let worktree_path = agent.worktree_path.clone();
    tokio::task::spawn_blocking(move || {
        let _ = WorktreeService::remove_worktree(&repo_path, &worktree_path);
    })
    .await
    .ok();

    // Delete from database
    state.db.delete_agent(&id)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_agents(state: State<'_, Arc<AppState>>, ids: Vec<String>) -> Result<u32> {
    let mut deleted_count = 0u32;

    for id in ids {
        // Get agent first
        if let Ok(Some(agent)) = state.db.get_agent(&id) {
            // Stop process if running
            let _ = state.claude.stop(&id);

            // Look up teardown script if agent has a workspace
            let teardown_script = if let Some(ref ws_id) = agent.workspace_id {
                state.db.get_workspace_repository(ws_id, &agent.repository_path)
                    .ok()
                    .flatten()
                    .and_then(|repo| repo.teardown_script)
            } else {
                None
            };

            // Run teardown script if configured
            if let Some(script) = teardown_script {
                let wt_path = agent.worktree_path.clone();
                let script_result = tokio::task::spawn_blocking(move || {
                    execute_script(&script, &wt_path)
                }).await;

                if let Err(e) = script_result {
                    log::error!("[delete_agents] Teardown script task failed for agent {}: {}", id, e);
                }
            }

            // Remove worktree in background
            let repo_path = agent.repository_path.clone();
            let worktree_path = agent.worktree_path.clone();
            tokio::task::spawn_blocking(move || {
                let _ = WorktreeService::remove_worktree(&repo_path, &worktree_path);
            })
            .await
            .ok();

            // Delete from database
            if state.db.delete_agent(&id).is_ok() {
                deleted_count += 1;
            }
        }
    }

    Ok(deleted_count)
}

/// Represents an encoded image ready to be sent to the Claude API
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EncodedImage {
    pub name: String,
    pub media_type: String,  // "image/png" or "image/jpeg"
    pub data: String,        // base64 encoded
    pub size_bytes: u64,
}

/// Opens a file dialog to select images, validates them, and returns base64 encoded data
#[tauri::command]
pub async fn select_and_encode_images(
    app_handle: AppHandle,
    max_size_mb: u32,
) -> Result<Vec<EncodedImage>> {
    use base64::{Engine as _, engine::general_purpose};
    use tauri_plugin_dialog::DialogExt;

    log::info!("[select_and_encode_images] Opening file dialog with max_size={}MB", max_size_mb);

    let max_size_bytes = (max_size_mb as u64) * 1024 * 1024;

    // Open file dialog for selecting images
    let file_response = app_handle
        .dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg"])
        .set_title("Select Images")
        .blocking_pick_files();

    let Some(files) = file_response else {
        log::info!("[select_and_encode_images] User cancelled file selection");
        return Ok(Vec::new());
    };

    let mut encoded_images = Vec::new();

    for file_path in files {
        // FilePath from tauri-plugin-dialog is a PathBuf wrapper
        let path = file_path.as_path().unwrap();
        log::info!("[select_and_encode_images] Processing file: {:?}", path);

        // Get file name
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Determine media type from extension
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let media_type = match extension.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            _ => {
                log::warn!("[select_and_encode_images] Unsupported file type: {}", extension);
                continue;
            }
        };

        // Read file
        let file_bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) => {
                log::error!("[select_and_encode_images] Failed to read file {:?}: {}", path, e);
                continue;
            }
        };

        let size_bytes = file_bytes.len() as u64;

        // Validate file size
        if size_bytes > max_size_bytes {
            log::warn!("[select_and_encode_images] File {} is too large: {} bytes (max {} bytes)",
                file_name, size_bytes, max_size_bytes);
            return Err(crate::error::AppError::Other(
                format!("File '{}' is too large ({:.2}MB). Maximum size is {}MB.",
                    file_name,
                    size_bytes as f64 / (1024.0 * 1024.0),
                    max_size_mb)
            ));
        }

        // Base64 encode
        let encoded_data = general_purpose::STANDARD.encode(&file_bytes);

        log::info!("[select_and_encode_images] Successfully encoded {} ({} bytes)", file_name, size_bytes);

        encoded_images.push(EncodedImage {
            name: file_name,
            media_type: media_type.to_string(),
            data: encoded_data,
            size_bytes,
        });
    }

    log::info!("[select_and_encode_images] Encoded {} images", encoded_images.len());
    Ok(encoded_images)
}

#[tauri::command]
pub fn stop_agent(app_handle: AppHandle, state: State<Arc<AppState>>, id: String) -> Result<()> {
    log::info!("[stop_agent] Stopping agent {}", id);
    state.claude.stop(&id)?;
    state.db.update_agent_status(&id, AgentStatus::Idle)?;
    emit_agent_updated(&app_handle, &state.db, &id);
    log::info!("[stop_agent] Agent {} stopped", id);
    Ok(())
}

#[tauri::command]
pub fn restart_agent(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
    prompt: Option<String>,
    images: Option<Vec<EncodedImage>>,
) -> Result<()> {
    log::info!("[restart_agent] Restarting agent {}, is_follow_up={}, images={}",
        id, prompt.is_some(), images.as_ref().map(|i| i.len()).unwrap_or(0));

    let agent = state.db.get_agent(&id)?
        .ok_or_else(|| crate::error::AppError::AgentNotFound(id.clone()))?;

    // Stop if already running
    state.claude.stop(&id)?;

    // Determine if this is a follow-up (continue conversation) or fresh restart
    let is_follow_up = prompt.is_some();

    // User message is now stored in claude_process.rs when starting
    let prompt_to_use = prompt.unwrap_or(agent.prompt);

    log::info!("[restart_agent] Starting Claude in worktree={}, continue={}", agent.worktree_path, is_follow_up);

    // Start Claude process (continue conversation if follow-up)
    match state.claude.start(
        app_handle.clone(),
        Arc::clone(&state.db),
        &id,
        &agent.worktree_path,
        &prompt_to_use,
        is_follow_up,
        images.as_deref(),
    ) {
        Ok(_) => {
            state.db.update_agent_status(&id, AgentStatus::Running)?;
            emit_agent_updated(&app_handle, &state.db, &id);
            log::info!("[restart_agent] Agent {} restarted successfully", id);
            Ok(())
        }
        Err(e) => {
            log::error!("[restart_agent] Failed to start Claude for agent {}: {}", id, e);
            state.db.update_agent_status(&id, AgentStatus::Error)?;
            emit_agent_updated(&app_handle, &state.db, &id);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn get_agent_output(
    state: State<Arc<AppState>>,
    agent_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<OutputLine>> {
    state.db.get_agent_output(&agent_id, limit, offset)
}

#[tauri::command]
pub fn get_agent_output_count(
    state: State<Arc<AppState>>,
    agent_id: String,
) -> Result<i64> {
    state.db.get_agent_output_count(&agent_id)
}

/// Get messages for an agent (new architecture)
#[tauri::command]
pub fn get_agent_messages(
    state: State<Arc<AppState>>,
    agent_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Message>> {
    state.db.get_messages(&agent_id, limit, offset)
}

/// Get message count for an agent (new architecture)
#[tauri::command]
pub fn get_agent_messages_count(
    state: State<Arc<AppState>>,
    agent_id: String,
) -> Result<i64> {
    state.db.get_messages_count(&agent_id)
}

/// Generate agent info (title, description, branch name) from a prompt
#[tauri::command]
pub fn generate_agent_metadata(
    state: State<Arc<AppState>>,
    prompt: String,
    repository_path: String,
) -> Result<GeneratedAgentInfo> {
    generate_agent_info(&state.db, &prompt, &repository_path)
}

/// Update agent name
#[tauri::command]
pub fn update_agent_name(
    state: State<Arc<AppState>>,
    id: String,
    name: String,
) -> Result<()> {
    state.db.update_agent_name(&id, &name)
}

/// Update agent description
#[tauri::command]
pub fn update_agent_description(
    state: State<Arc<AppState>>,
    id: String,
    description: String,
) -> Result<()> {
    state.db.update_agent_description(&id, &description)
}

#[tauri::command]
pub fn get_cost_summary(
    state: State<Arc<AppState>>,
) -> Result<crate::db::CostSummary> {
    state.db.get_cost_summary()
}

#[tauri::command]
pub fn set_agent_pinned(
    state: State<Arc<AppState>>,
    id: String,
    pinned: bool,
) -> Result<()> {
    state.db.set_agent_pinned(&id, pinned)
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
pub fn set_agent_auto_accept_edits(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
    enabled: bool,
) -> Result<()> {
    state.db.set_agent_auto_accept_edits(&id, enabled)?;
    emit_agent_updated(&app_handle, &state.db, &id);
    Ok(())
}

/// Take over manual control of an agent (stops Claude, checkouts branch in root)
#[tauri::command]
pub fn takeover_agent(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
) -> Result<TakeoverResult> {
    use crate::services::GitService;

    log::info!("[takeover] Starting takeover for agent {}", id);

    let agent = state.db.get_agent(&id)?
        .ok_or_else(|| crate::error::AppError::AgentNotFound(id.clone()))?;

    log::info!("[takeover] Agent status={}, branch={}, worktree={}, repo={}",
        agent.status.as_str(), agent.branch, agent.worktree_path, agent.repository_path);

    // Stop the Claude process if running
    if agent.status == AgentStatus::Running {
        log::info!("[takeover] Stopping running Claude process for agent {}", id);
        state.claude.stop(&id)?;
        log::info!("[takeover] Claude process stopped");
    }

    // 1. Commit any uncommitted changes in the worktree
    log::info!("[takeover] Step 1: Checking for uncommitted changes in worktree");
    let wip_commit = if GitService::has_uncommitted_changes(&agent.worktree_path)? {
        log::info!("[takeover] Worktree has uncommitted changes, creating WIP commit");
        let commit = GitService::commit_all(&agent.worktree_path, "WIP: takeover checkpoint")?;
        log::info!("[takeover] WIP commit created: {}", commit);
        commit
    } else {
        log::info!("[takeover] No uncommitted changes in worktree, getting HEAD");
        let output = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&agent.worktree_path)
            .output()
            .map_err(|e| crate::error::AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        let head = String::from_utf8_lossy(&output.stdout).trim().to_string();
        log::info!("[takeover] Worktree HEAD: {}", head);
        head
    };

    // 2. Get the current branch in the repo root
    log::info!("[takeover] Step 2: Getting current branch in repo root");
    let original_branch = GitService::get_current_branch(&agent.repository_path)?;
    log::info!("[takeover] Original branch: {}", original_branch);

    // 3. Stash any uncommitted changes in the repo root
    log::info!("[takeover] Step 3: Stashing uncommitted changes in repo root");
    let had_stash = GitService::stash_push(&agent.repository_path, &format!("mux-takeover-{}", id))?;
    log::info!("[takeover] Had stash: {}", had_stash);

    // 4. Detach HEAD in the worktree so the branch is freed for checkout in root
    log::info!("[takeover] Step 4: Detaching HEAD in worktree to free branch '{}'", agent.branch);

    // First verify the worktree path exists
    if !std::path::Path::new(&agent.worktree_path).exists() {
        log::error!("[takeover] Worktree path does not exist: {}", agent.worktree_path);
        return Err(crate::error::AppError::Git(format!(
            "Worktree path does not exist: {}. The worktree may have been deleted externally.",
            agent.worktree_path
        )));
    }

    let detach_output = std::process::Command::new("git")
        .args(["checkout", "--detach"])
        .current_dir(&agent.worktree_path)
        .output()
        .map_err(|e| crate::error::AppError::Git(format!("Failed to detach worktree HEAD: {}", e)))?;
    if !detach_output.status.success() {
        let stderr = String::from_utf8_lossy(&detach_output.stderr);
        log::error!("[takeover] Failed to detach worktree HEAD: {}", stderr);
        return Err(crate::error::AppError::Git(format!("Failed to detach worktree HEAD: {}", stderr)));
    }
    log::info!("[takeover] Worktree HEAD detached successfully");

    // 5. Checkout the worktree's branch in the repo root
    log::info!("[takeover] Step 5: Checking out branch '{}' in repo root", agent.branch);
    GitService::checkout_branch(&agent.repository_path, &agent.branch)?;
    log::info!("[takeover] Branch checked out in repo root");

    // 6. Store takeover state
    log::info!("[takeover] Step 6: Storing takeover state in DB");
    state.db.set_takeover_state(&id, &original_branch, &wip_commit, had_stash)?;

    // 7. Update status to manual_control
    log::info!("[takeover] Step 7: Updating agent status to manual_control");
    state.db.update_agent_status(&id, AgentStatus::ManualControl)?;

    // Emit agent update event
    emit_agent_updated(&app_handle, &state.db, &id);

    log::info!("[takeover] Takeover complete for agent {}", id);

    Ok(TakeoverResult {
        original_branch,
        wip_commit,
        had_stash,
        repo_path: agent.repository_path,
        branch: agent.branch,
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

/// Hand back control to Claude (commits, restores root, resumes agent)
#[tauri::command]
pub fn handback_agent(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    id: String,
    commit_message: Option<String>,
    prompt: Option<String>,
) -> Result<()> {
    use crate::services::GitService;

    log::info!("[handback] Starting handback for agent {}", id);

    let agent = state.db.get_agent(&id)?
        .ok_or_else(|| crate::error::AppError::AgentNotFound(id.clone()))?;

    log::info!("[handback] Agent status={}, branch={}, worktree={}, repo={}",
        agent.status.as_str(), agent.branch, agent.worktree_path, agent.repository_path);

    // Check if agent is in manual control mode
    if agent.status != AgentStatus::ManualControl {
        log::error!("[handback] Agent not in manual_control mode: {}", agent.status.as_str());
        return Err(crate::error::AppError::Other(format!(
            "Agent is not in manual control mode (current status: {})",
            agent.status.as_str()
        )));
    }

    // Get takeover state
    let takeover_state = state.db.get_takeover_state(&id)?
        .ok_or_else(|| {
            log::error!("[handback] No takeover state found for agent {}", id);
            crate::error::AppError::Other("No takeover state found".to_string())
        })?;

    log::info!("[handback] Takeover state: original_branch={}, wip_commit={}, had_stash={}",
        takeover_state.original_branch, takeover_state.wip_commit, takeover_state.had_stash);

    // 1. If user made changes in root (which is now on the agent branch), commit them
    log::info!("[handback] Step 1: Checking for uncommitted changes in repo root");
    if GitService::has_uncommitted_changes(&agent.repository_path)? {
        let msg = commit_message.clone().unwrap_or_else(|| "Manual changes during takeover".to_string());
        log::info!("[handback] Committing changes in repo root: {}", msg);
        GitService::commit_all(&agent.repository_path, &msg)?;
    } else {
        log::info!("[handback] No uncommitted changes in repo root");
    }

    // 2. If we have a WIP commit and user provided a commit message, squash them
    log::info!("[handback] Step 2: Checking if squash is needed");
    if commit_message.is_some() {
        let current_head = {
            let output = std::process::Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(&agent.repository_path)
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
                .current_dir(&agent.repository_path)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);

            if !is_ancestor {
                log::warn!("[handback] WIP commit {} is not an ancestor of HEAD {}, skipping squash to prevent data loss",
                    takeover_state.wip_commit, current_head);
            } else if let Ok(parent) = GitService::get_parent_commit(&agent.repository_path, &takeover_state.wip_commit) {
                log::info!("[handback] Squashing: soft reset to parent {} and re-commit", parent);
                GitService::soft_reset(&agent.repository_path, &parent)?;
                let msg = commit_message.unwrap_or_else(|| "Manual changes during takeover".to_string());
                GitService::commit_all(&agent.repository_path, &msg)?;
            } else {
                log::warn!("[handback] Could not get parent of WIP commit, skipping squash");
            }
        } else {
            log::info!("[handback] HEAD == WIP commit, no squash needed");
        }
    }

    // 3. Re-attach worktree to the branch (it was detached during takeover)
    log::info!("[handback] Step 3: Re-attaching worktree to branch '{}'", agent.branch);

    // First verify the worktree path exists
    if !std::path::Path::new(&agent.worktree_path).exists() {
        log::error!("[handback] Worktree path does not exist: {}", agent.worktree_path);
        return Err(crate::error::AppError::Git(format!(
            "Worktree path does not exist: {}. The worktree may have been deleted externally.",
            agent.worktree_path
        )));
    }

    let checkout_output = std::process::Command::new("git")
        .args(["checkout", &agent.branch])
        .current_dir(&agent.worktree_path)
        .output()
        .map_err(|e| crate::error::AppError::Git(format!(
            "Failed to execute checkout in worktree: {}", e
        )))?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr);
        log::error!("[handback] Failed to re-attach worktree to branch: {}", stderr);
        return Err(crate::error::AppError::Git(format!(
            "Failed to re-attach worktree to branch '{}': {}",
            agent.branch, stderr
        )));
    }
    log::info!("[handback] Worktree re-attached to branch successfully");

    // 4. Checkout original branch in root (this frees the agent branch for the worktree)
    log::info!("[handback] Step 4: Checking out original branch '{}' in repo root", takeover_state.original_branch);
    GitService::checkout_branch(&agent.repository_path, &takeover_state.original_branch)?;
    log::info!("[handback] Original branch restored in repo root");

    // 5. Pop stash if we had one
    if takeover_state.had_stash {
        log::info!("[handback] Step 5: Popping stash");
        let _ = GitService::stash_pop(&agent.repository_path);
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
        &agent.worktree_path,
        &resume_prompt,
        true, // Continue conversation for handback
        None, // No images for handback
    )?;

    // Update status to running
    state.db.update_agent_status(&id, AgentStatus::Running)?;

    log::info!("[handback] Handback complete for agent {}", id);

    Ok(())
}

/// Execute a shell script in the given working directory
fn execute_script(script: &str, working_dir: &str) -> Result<()> {
    use std::process::Command;

    log::info!("[execute_script] Running script in {}: {}", working_dir, script);

    // Determine shell based on platform
    let (shell, flag) = if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };

    let output = Command::new(shell)
        .arg(flag)
        .arg(script)
        .current_dir(working_dir)
        .output()
        .map_err(|e| crate::error::AppError::Other(format!("Failed to execute script: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stdout.is_empty() {
        log::info!("[execute_script] stdout: {}", stdout);
    }
    if !stderr.is_empty() {
        log::warn!("[execute_script] stderr: {}", stderr);
    }

    if output.status.success() {
        log::info!("[execute_script] Script completed successfully");
        Ok(())
    } else {
        let exit_code = output.status.code().unwrap_or(-1);
        log::error!("[execute_script] Script failed with exit code {}", exit_code);
        Err(crate::error::AppError::Other(format!(
            "Script failed with exit code {}: {}",
            exit_code, stderr
        )))
    }
}

/// Response for disk usage calculation
#[derive(serde::Serialize)]
pub struct DiskUsageInfo {
    pub total_bytes: u64,
    pub total_mb: f64,
    pub worktree_count: usize,
}

/// Calculate total disk space used by all worktrees
#[tauri::command]
pub async fn calculate_worktree_disk_usage(state: State<'_, Arc<AppState>>) -> Result<DiskUsageInfo> {
    let agents = state.db.get_all_agents()?;

    let mut total_bytes = 0u64;
    let mut count = 0;

    for agent in agents {
        let path = std::path::Path::new(&agent.worktree_path);
        if path.exists() {
            if let Ok(size) = calculate_directory_size(path) {
                total_bytes += size;
                count += 1;
            }
        }
    }

    Ok(DiskUsageInfo {
        total_bytes,
        total_mb: total_bytes as f64 / 1024.0 / 1024.0,
        worktree_count: count,
    })
}

/// Recursively calculate directory size
fn calculate_directory_size(path: &std::path::Path) -> Result<u64> {
    let mut total = 0u64;

    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let entry_path = entry.path();

            if entry_path.is_dir() {
                // Skip .git directories to avoid double counting
                if entry_path.file_name() != Some(std::ffi::OsStr::new(".git")) {
                    total += calculate_directory_size(&entry_path)?;
                }
            } else {
                total += entry.metadata()?.len();
            }
        }
    }

    Ok(total)
}

/// Delete all agents, clear database, and reset to onboarding
/// This is the nuclear option for a complete reset
#[tauri::command]
pub async fn delete_all_data(
    state: State<'_, Arc<AppState>>,
    app_handle: AppHandle,
) -> Result<()> {
    log::info!("[delete_all_data] Starting complete data wipe...");

    // 1. Get all agents
    let agents = state.db.get_all_agents()?;
    log::info!("[delete_all_data] Found {} agents to delete", agents.len());

    // 2. Stop all running processes
    log::info!("[delete_all_data] Stopping all processes...");
    state.claude.shutdown_all();

    // 3. Delete all agents (this also removes worktrees)
    for agent in agents {
        log::info!("[delete_all_data] Deleting agent: {}", agent.id);

        // Run teardown script if exists
        if let Some(ref ws_id) = agent.workspace_id {
            if let Ok(Some(repo)) = state.db.get_workspace_repository(ws_id, &agent.repository_path) {
                if let Some(ref script) = repo.teardown_script {
                    let script = script.clone();
                    let wt_path = agent.worktree_path.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        execute_script(&script, &wt_path)
                    }).await;
                }
            }
        }

        // Remove worktree
        let repo_path = agent.repository_path.clone();
        let worktree_path = agent.worktree_path.clone();
        let _ = tokio::task::spawn_blocking(move || {
            WorktreeService::remove_worktree(&repo_path, &worktree_path)
        }).await;

        // Delete from database
        state.db.delete_agent(&agent.id)?;
    }

    // 4. Clear all notifications
    log::info!("[delete_all_data] Clearing notifications...");
    state.db.clear_notifications()?;

    // 5. Delete all workspaces
    log::info!("[delete_all_data] Deleting workspaces...");
    let workspaces = state.db.get_workspaces()?;
    for workspace in workspaces {
        // Try to delete, but ignore errors (workspace might have constraints)
        let _ = state.db.delete_workspace(&workspace.id);
    }

    // 6. Reset onboarding status
    log::info!("[delete_all_data] Resetting onboarding...");
    state.db.set_setting("onboarding_completed", "false")?;

    // 7. Emit event to refresh UI
    let _ = app_handle.emit("data-reset", ());

    log::info!("[delete_all_data] Complete data wipe finished successfully");
    Ok(())
}
