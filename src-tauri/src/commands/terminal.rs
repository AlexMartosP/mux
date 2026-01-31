use crate::error::{AppError, Result};
use crate::services::TerminalService;
use std::sync::Arc;
use tauri::{AppHandle, State};

pub struct TerminalState {
    pub terminal: Arc<TerminalService>,
}

/// Response from open_terminal indicating if session already existed
#[derive(serde::Serialize)]
pub struct OpenTerminalResponse {
    /// True if this is reconnecting to an existing session
    pub session_existed: bool,
}

#[tauri::command]
pub fn open_terminal(
    app_handle: AppHandle,
    state: State<Arc<crate::commands::AppState>>,
    terminal_state: State<TerminalState>,
    agent_id: String,
) -> Result<OpenTerminalResponse> {
    // Get the agent to find the worktree path
    let agent = state
        .db
        .get_agent(&agent_id)?
        .ok_or_else(|| AppError::AgentNotFound(agent_id.clone()))?;

    // Check if session already exists
    if terminal_state.terminal.has_session(&agent_id) {
        log::info!("Reconnecting to existing terminal session for agent {}", agent_id);
        return Ok(OpenTerminalResponse { session_existed: true });
    }

    // Open terminal in the worktree directory
    terminal_state
        .terminal
        .open(app_handle, &agent_id, &agent.worktree_path)?;

    log::info!("Opened terminal for agent {} at {}", agent_id, agent.worktree_path);
    Ok(OpenTerminalResponse { session_existed: false })
}

/// Get the buffered terminal output for an existing session
#[tauri::command]
pub fn get_terminal_buffer(
    terminal_state: State<TerminalState>,
    agent_id: String,
) -> Result<Option<String>> {
    Ok(terminal_state.terminal.get_buffer(&agent_id))
}

#[tauri::command]
pub fn terminal_input(
    terminal_state: State<TerminalState>,
    agent_id: String,
    data: String,
) -> Result<()> {
    terminal_state.terminal.input(&agent_id, &data)
}

#[tauri::command]
pub fn terminal_resize(
    terminal_state: State<TerminalState>,
    agent_id: String,
    cols: u16,
    rows: u16,
) -> Result<()> {
    terminal_state.terminal.resize(&agent_id, cols, rows)
}

#[tauri::command]
pub fn close_terminal(terminal_state: State<TerminalState>, agent_id: String) -> Result<()> {
    terminal_state.terminal.close(&agent_id)
}
