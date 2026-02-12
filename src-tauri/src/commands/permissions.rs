use crate::commands::agent::AppState;
use crate::error::Result;
use crate::events::emit_agent_updated;
use crate::models::AgentStatus;
use crate::services::{respond_to_permission, PermissionDecision};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// Respond to a permission request from Claude Code (PreToolUse hook)
/// If the request had timed out and user approved, this will restart Claude
#[tauri::command]
pub fn respond_permission(
    app_handle: AppHandle,
    state: State<Arc<AppState>>,
    request_id: String,
    behavior: String,
    reason: Option<String>,
) -> Result<bool> {
    let decision = PermissionDecision {
        behavior: behavior.clone(),
        reason,
    };
    let result = respond_to_permission(&request_id, decision);

    // Emit event to notify frontend that permission was responded to
    // This ensures the request is removed from the pending list even if callback fails
    if result.sent {
        let _ = app_handle.emit("permission-responded", serde_json::json!({
            "request_id": request_id
        }));
    }

    // If this was a timed-out request that was approved, restart Claude
    if let Some(timed_out_req) = result.restart_task {
        if behavior == "allow" {
            log::info!(
                "[{}] Restarting Claude after timed-out permission was approved",
                timed_out_req.agent_id
            );

            // Get agent info for restart
            if let Ok(Some(agent)) = state.db.get_agent(&timed_out_req.agent_id) {
                // Restart Claude with --continue to pick up where it left off
                match state.claude.start(
                    app_handle.clone(),
                    Arc::clone(&state.db),
                    &timed_out_req.agent_id,
                    &agent.worktree_path,
                    "Continue from where you left off. The user has approved the pending permission.",
                    true, // continue conversation
                    None, // No images
                ) {
                    Ok(_) => {
                        let _ = state.db.update_agent_status(&timed_out_req.agent_id, AgentStatus::Running);
                        emit_agent_updated(&app_handle, &state.db, &timed_out_req.agent_id);
                    }
                    Err(e) => {
                        log::error!(
                            "[{}] Failed to restart Claude after permission approval: {}",
                            timed_out_req.agent_id, e
                        );
                        let _ = state.db.update_agent_status(&timed_out_req.agent_id, AgentStatus::Error);
                        emit_agent_updated(&app_handle, &state.db, &timed_out_req.agent_id);
                    }
                }
            }
        }
    }

    Ok(result.sent)
}
