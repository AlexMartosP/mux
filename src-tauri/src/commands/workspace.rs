use crate::commands::AppState;
use crate::db::{Workspace, WorkspaceRepository};
use crate::error::Result;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_workspaces(state: State<Arc<AppState>>) -> Result<Vec<Workspace>> {
    state.db.get_workspaces()
}

#[tauri::command]
pub fn get_workspace(state: State<Arc<AppState>>, id: String) -> Result<Option<Workspace>> {
    state.db.get_workspace(&id)
}

#[tauri::command]
pub fn get_default_workspace(state: State<Arc<AppState>>) -> Result<Option<Workspace>> {
    state.db.get_default_workspace()
}

#[tauri::command]
pub fn create_workspace(
    state: State<Arc<AppState>>,
    name: String,
    repos_folder_path: String,
) -> Result<Workspace> {
    state.db.create_workspace(&name, &repos_folder_path)
}

#[tauri::command]
pub fn update_workspace(
    state: State<Arc<AppState>>,
    id: String,
    name: String,
    repos_folder_path: String,
) -> Result<()> {
    state.db.update_workspace(&id, &name, &repos_folder_path)
}

#[tauri::command]
pub fn delete_workspace(state: State<Arc<AppState>>, id: String) -> Result<()> {
    state.db.delete_workspace(&id)
}

#[tauri::command]
pub fn set_default_workspace(state: State<Arc<AppState>>, id: String) -> Result<()> {
    state.db.set_default_workspace(&id)
}

// Workspace settings commands

#[tauri::command]
pub fn get_workspace_setting(
    state: State<Arc<AppState>>,
    workspace_id: String,
    key: String,
) -> Result<Option<String>> {
    state.db.get_workspace_setting(&workspace_id, &key)
}

#[tauri::command]
pub fn set_workspace_setting(
    state: State<Arc<AppState>>,
    workspace_id: String,
    key: String,
    value: String,
) -> Result<()> {
    state.db.set_workspace_setting(&workspace_id, &key, &value)
}

#[tauri::command]
pub fn delete_workspace_setting(
    state: State<Arc<AppState>>,
    workspace_id: String,
    key: String,
) -> Result<()> {
    state.db.delete_workspace_setting(&workspace_id, &key)
}

#[tauri::command]
pub fn get_all_workspace_settings(
    state: State<Arc<AppState>>,
    workspace_id: String,
) -> Result<std::collections::HashMap<String, String>> {
    state.db.get_all_workspace_settings(&workspace_id)
}

/// List repositories in a workspace's repos folder
#[tauri::command]
pub fn list_workspace_repositories(repos_folder_path: String) -> Result<Vec<RepositoryInfo>> {
    let path = std::path::Path::new(&repos_folder_path);

    if !path.exists() || !path.is_dir() {
        return Ok(vec![]);
    }

    let mut repos = Vec::new();

    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                // Check if it's a git repository
                let git_dir = entry_path.join(".git");
                if git_dir.exists() {
                    let name = entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let path = entry_path.to_string_lossy().to_string();

                    repos.push(RepositoryInfo { name, path });
                }
            }
        }
    }

    // Sort by name
    repos.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(repos)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RepositoryInfo {
    pub name: String,
    pub path: String,
}

// Workspace repository commands

/// Get all repositories explicitly added to a workspace
#[tauri::command]
pub fn get_workspace_repositories(
    state: State<Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<WorkspaceRepository>> {
    state.db.get_workspace_repositories(&workspace_id)
}

/// Add a repository to a workspace
#[tauri::command]
pub fn add_repository_to_workspace(
    state: State<Arc<AppState>>,
    workspace_id: String,
    repository_path: String,
    name: String,
) -> Result<WorkspaceRepository> {
    state.db.add_repository_to_workspace(&workspace_id, &repository_path, &name)
}

/// Remove a repository from a workspace
#[tauri::command]
pub fn remove_repository_from_workspace(
    state: State<Arc<AppState>>,
    workspace_id: String,
    repository_path: String,
) -> Result<()> {
    state.db.remove_repository_from_workspace(&workspace_id, &repository_path)
}

/// Update repository scripts (setup and teardown)
#[tauri::command]
pub fn update_repository_scripts(
    state: State<Arc<AppState>>,
    workspace_id: String,
    repository_path: String,
    setup_script: Option<String>,
    teardown_script: Option<String>,
) -> Result<()> {
    state.db.update_repository_scripts(
        &workspace_id,
        &repository_path,
        setup_script.as_deref(),
        teardown_script.as_deref(),
    )
}

/// Get a specific repository from a workspace
#[tauri::command]
pub fn get_workspace_repository(
    state: State<Arc<AppState>>,
    workspace_id: String,
    repository_path: String,
) -> Result<Option<WorkspaceRepository>> {
    state.db.get_workspace_repository(&workspace_id, &repository_path)
}

/// Scan a folder for git repositories (for picker dialog)
#[tauri::command]
pub fn scan_folder_for_repositories(folder_path: String) -> Result<Vec<RepositoryInfo>> {
    list_workspace_repositories(folder_path)
}
