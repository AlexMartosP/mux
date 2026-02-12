use crate::db::Database;
use crate::models::AgentStatus;
use crate::services::git::{FileChange, GitService};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time;

#[derive(Debug, Clone, Serialize)]
pub struct FileChangesEvent {
    pub agent_id: String,
    pub changes: Vec<FileChange>,
    pub timestamp: String,
}

/// Service that watches for git file changes and emits events
pub struct GitWatcherService {
    db: Arc<Database>,
    app_handle: AppHandle,
    /// Cache of last known changes per agent to detect differences
    last_changes: Arc<Mutex<HashMap<String, Vec<FileChange>>>>,
}

impl GitWatcherService {
    pub fn new(db: Arc<Database>, app_handle: AppHandle) -> Self {
        Self {
            db,
            app_handle,
            last_changes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start the git watcher background task
    pub fn start(self) {
        tauri::async_runtime::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(2)); // Check every 2 seconds

            loop {
                interval.tick().await;

                if let Err(e) = self.check_all_agents().await {
                    log::error!("[GitWatcher] Error checking agents: {}", e);
                }
            }
        });

        log::info!("[GitWatcher] Started monitoring file changes");
    }

    /// Check all active agents for file changes
    async fn check_all_agents(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Get all agents that should be monitored (running, idle, waiting_input)
        let agents = self.db.get_all_agents().ok().unwrap_or_default();

        for agent in agents {
            // Only monitor agents that have a worktree (not queued/setting_up)
            if matches!(agent.status,
                AgentStatus::Running
                | AgentStatus::Idle
                | AgentStatus::WaitingInput
                | AgentStatus::ManualControl
            ) {
                if let Err(e) = self.check_agent_changes(&agent.id, &agent.worktree_path, &agent.repository_path).await {
                    log::debug!("[GitWatcher] Error checking agent {}: {}", agent.id, e);
                }
            }
        }

        Ok(())
    }

    /// Check a specific agent for file changes
    async fn check_agent_changes(
        &self,
        agent_id: &str,
        worktree_path: &str,
        repository_path: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Get current changes
        let base_branch = GitService::get_default_branch(repository_path)?;
        let current_changes = GitService::get_changed_files(worktree_path, &base_branch)?;

        // Check if changes differ from last known state
        let mut last_changes = self.last_changes.lock().await;
        let has_changed = match last_changes.get(agent_id) {
            Some(previous) => !changes_equal(previous, &current_changes),
            None => !current_changes.is_empty(),
        };

        if has_changed {
            log::debug!(
                "[GitWatcher] Changes detected for agent {}: {} files",
                agent_id,
                current_changes.len()
            );

            // Update cache
            last_changes.insert(agent_id.to_string(), current_changes.clone());

            // Emit event
            let event = FileChangesEvent {
                agent_id: agent_id.to_string(),
                changes: current_changes,
                timestamp: chrono::Utc::now().to_rfc3339(),
            };

            if let Err(e) = self.app_handle.emit("agent-file-changes", &event) {
                log::error!("[GitWatcher] Failed to emit file changes event: {}", e);
            }
        }

        Ok(())
    }

    /// Clear cached changes for an agent (call when agent is deleted)
    pub async fn clear_agent_cache(&self, agent_id: &str) {
        let mut last_changes = self.last_changes.lock().await;
        last_changes.remove(agent_id);
    }
}

/// Compare two lists of file changes to see if they're equal
fn changes_equal(a: &[FileChange], b: &[FileChange]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    // Sort and compare
    let mut a_sorted: Vec<_> = a.to_vec();
    let mut b_sorted: Vec<_> = b.to_vec();

    a_sorted.sort_by(|x, y| x.path.cmp(&y.path));
    b_sorted.sort_by(|x, y| x.path.cmp(&y.path));

    a_sorted.iter().zip(b_sorted.iter()).all(|(x, y)| {
        x.path == y.path
            && x.status == y.status
            && x.additions == y.additions
            && x.deletions == y.deletions
            && x.new_path == y.new_path
    })
}
