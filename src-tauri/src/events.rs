use crate::db::Database;
use tauri::{AppHandle, Emitter};

/// Emit a unified agent-updated event with the full agent object.
/// This replaces granular events (agent-status, agent-metadata, agent-cost, agent-description).
pub fn emit_agent_updated(app: &AppHandle, db: &Database, agent_id: &str) {
    if let Ok(Some(agent)) = db.get_agent(agent_id) {
        log::debug!("[Event] Emitting agent-updated for agent {} (name: {}, branch: {})", agent_id, agent.name, agent.branch);
        let _ = app.emit("agent-updated", &agent);
    } else {
        log::warn!("[Event] Failed to get agent {} from database for agent-updated event", agent_id);
    }
}
