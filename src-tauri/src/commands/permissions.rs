use crate::error::Result;
use crate::services::{respond_to_permission, PermissionDecision};

/// Respond to a permission request from Claude Code (PreToolUse hook)
#[tauri::command]
pub fn respond_permission(
    request_id: String,
    behavior: String,
    reason: Option<String>,
) -> Result<bool> {
    let decision = PermissionDecision { behavior, reason };
    Ok(respond_to_permission(&request_id, decision))
}
