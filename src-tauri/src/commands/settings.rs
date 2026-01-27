use crate::commands::task::AppState;
use crate::error::{AppError, Result};
use directories::BaseDirs;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub base_repo_directory: Option<String>,
    pub branch_prefix: Option<String>,
    pub notify_on_completion: bool,
    pub notify_on_error: bool,
    /// If true, prompt user for permissions. If false, auto-approve all permissions.
    pub prompt_for_permissions: bool,
    /// Theme ID (e.g., "terminal", "clean", "clean-light")
    pub theme: Option<String>,
    /// Maximum number of concurrently running tasks (0 = unlimited)
    pub max_concurrent_tasks: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            base_repo_directory: None,
            branch_prefix: None,
            notify_on_completion: true,
            notify_on_error: true,
            prompt_for_permissions: false, // Default to auto-approve for backward compatibility
            theme: Some("terminal".to_string()),
            max_concurrent_tasks: 0, // 0 = unlimited
        }
    }
}

/// Get all settings
#[tauri::command]
pub fn get_settings(state: State<Arc<AppState>>) -> Result<AppSettings> {
    let settings_map = state.db.get_all_settings()?;

    Ok(AppSettings {
        base_repo_directory: settings_map.get("base_repo_directory").cloned(),
        branch_prefix: settings_map.get("branch_prefix").cloned(),
        notify_on_completion: settings_map
            .get("notify_on_completion")
            .map(|v| v != "false")
            .unwrap_or(true),
        notify_on_error: settings_map
            .get("notify_on_error")
            .map(|v| v != "false")
            .unwrap_or(true),
        prompt_for_permissions: settings_map
            .get("prompt_for_permissions")
            .map(|v| v == "true")
            .unwrap_or(false),
        theme: settings_map.get("theme").cloned(),
        max_concurrent_tasks: settings_map
            .get("max_concurrent_tasks")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
    })
}

/// Update settings
#[tauri::command]
pub fn update_settings(state: State<Arc<AppState>>, settings: AppSettings) -> Result<()> {
    if let Some(dir) = &settings.base_repo_directory {
        state.db.set_setting("base_repo_directory", dir)?;
    }
    if let Some(prefix) = &settings.branch_prefix {
        state.db.set_setting("branch_prefix", prefix)?;
    }
    state
        .db
        .set_setting("notify_on_completion", &settings.notify_on_completion.to_string())?;
    state
        .db
        .set_setting("notify_on_error", &settings.notify_on_error.to_string())?;
    state
        .db
        .set_setting("prompt_for_permissions", &settings.prompt_for_permissions.to_string())?;
    state
        .db
        .set_setting("max_concurrent_tasks", &settings.max_concurrent_tasks.to_string())?;
    Ok(())
}

/// Set a single setting
#[tauri::command]
pub fn set_setting(state: State<Arc<AppState>>, key: String, value: String) -> Result<()> {
    state.db.set_setting(&key, &value)?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct RepoInfo {
    pub name: String,
    pub path: String,
    pub is_git_repo: bool,
}

/// List repositories in the base directory
#[tauri::command]
pub fn list_repositories(state: State<Arc<AppState>>) -> Result<Vec<RepoInfo>> {
    let base_dir = match state.db.get_setting("base_repo_directory")? {
        Some(dir) => dir,
        None => return Ok(vec![]),
    };

    let base_path = PathBuf::from(&base_dir);
    if !base_path.exists() || !base_path.is_dir() {
        return Ok(vec![]);
    }

    let mut repos = Vec::new();

    if let Ok(entries) = fs::read_dir(&base_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                // Check if it's a git repo
                let is_git_repo = path.join(".git").exists();

                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    // Skip hidden directories
                    if !name.starts_with('.') {
                        repos.push(RepoInfo {
                            name: name.to_string(),
                            path: path.to_string_lossy().to_string(),
                            is_git_repo,
                        });
                    }
                }
            }
        }
    }

    // Sort by name
    repos.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(repos)
}

/// Get the path to the permission hook script
fn get_hook_script_path() -> Result<String> {
    // Get the path to our bundled script or the development path
    let exe_path = std::env::current_exe()?;
    let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("/"));

    // In development, look relative to the project
    // In production, the script is bundled in Resources
    let possible_paths = vec![
        exe_dir.join("../Resources/scripts/permission-hook.cjs"),
        exe_dir.join("../../scripts/permission-hook.cjs"),
        // Development paths
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/permission-hook.cjs"),
    ];

    for path in &possible_paths {
        if path.exists() {
            return Ok(path.canonicalize()?.to_string_lossy().to_string());
        }
    }

    // Fallback: return a path that the user can manually configure
    Err(AppError::Other(
        "Could not find permission-hook.cjs script".to_string()
    ))
}

/// Get the Claude global settings path
fn get_claude_settings_path() -> PathBuf {
    let home = BaseDirs::new()
        .map(|d| d.home_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("/"));
    home.join(".claude").join("settings.json")
}

#[derive(Debug, Serialize)]
pub struct ClaudeHookStatus {
    pub installed: bool,
    pub hook_path: Option<String>,
    pub settings_path: String,
    pub current_config: Option<String>,
}

/// Check if the Mux permission hook is installed in Claude settings
#[tauri::command]
pub fn check_claude_hook_status() -> Result<ClaudeHookStatus> {
    let settings_path = get_claude_settings_path();
    let hook_path = get_hook_script_path().ok();

    if !settings_path.exists() {
        return Ok(ClaudeHookStatus {
            installed: false,
            hook_path,
            settings_path: settings_path.to_string_lossy().to_string(),
            current_config: None,
        });
    }

    let content = fs::read_to_string(&settings_path)?;
    let settings: Value = serde_json::from_str(&content).unwrap_or(json!({}));

    // Check if our hook is installed
    let installed = settings
        .get("hooks")
        .and_then(|h| h.get("PreToolUse"))
        .map(|pre_tool| {
            if let Some(arr) = pre_tool.as_array() {
                arr.iter().any(|item| {
                    item.get("hooks")
                        .and_then(|h| h.as_array())
                        .map(|hooks| {
                            hooks.iter().any(|hook| {
                                hook.get("command")
                                    .and_then(|c| c.as_str())
                                    .map(|cmd| cmd.contains("permission-hook.cjs"))
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false)
                })
            } else {
                false
            }
        })
        .unwrap_or(false);

    Ok(ClaudeHookStatus {
        installed,
        hook_path,
        settings_path: settings_path.to_string_lossy().to_string(),
        current_config: Some(content),
    })
}

/// Install the Mux permission hook in Claude's global settings
#[tauri::command]
pub fn install_claude_hook() -> Result<String> {
    let settings_path = get_claude_settings_path();
    let hook_path = get_hook_script_path()?;

    // Ensure .claude directory exists
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Read existing settings or create empty object
    let mut settings: Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)?;
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    // Create the hook configuration
    let hook_config = json!({
        "matcher": "*",
        "hooks": [{
            "type": "command",
            "command": format!("node {}", hook_path)
        }]
    });

    // Ensure hooks object exists
    if settings.get("hooks").is_none() {
        settings["hooks"] = json!({});
    }

    // Get or create PreToolUse array
    let hooks = settings.get_mut("hooks").unwrap();
    if hooks.get("PreToolUse").is_none() {
        hooks["PreToolUse"] = json!([]);
    }

    let pre_tool_use = hooks.get_mut("PreToolUse").unwrap();

    // Check if our hook is already installed
    let already_installed = pre_tool_use
        .as_array()
        .map(|arr| {
            arr.iter().any(|item| {
                item.get("hooks")
                    .and_then(|h| h.as_array())
                    .map(|hooks| {
                        hooks.iter().any(|hook| {
                            hook.get("command")
                                .and_then(|c| c.as_str())
                                .map(|cmd| cmd.contains("permission-hook.cjs"))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);

    if !already_installed {
        if let Some(arr) = pre_tool_use.as_array_mut() {
            arr.push(hook_config);
        }
    }

    // Write back to file with pretty formatting
    let content = serde_json::to_string_pretty(&settings)?;
    fs::write(&settings_path, &content)?;

    Ok(content)
}

/// Remove the Mux permission hook from Claude's global settings
#[tauri::command]
pub fn uninstall_claude_hook() -> Result<()> {
    let settings_path = get_claude_settings_path();

    if !settings_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&settings_path)?;
    let mut settings: Value = serde_json::from_str(&content)?;

    // Remove our hook from PreToolUse
    if let Some(hooks) = settings.get_mut("hooks") {
        if let Some(pre_tool_use) = hooks.get_mut("PreToolUse") {
            if let Some(arr) = pre_tool_use.as_array_mut() {
                arr.retain(|item| {
                    !item.get("hooks")
                        .and_then(|h| h.as_array())
                        .map(|hooks| {
                            hooks.iter().any(|hook| {
                                hook.get("command")
                                    .and_then(|c| c.as_str())
                                    .map(|cmd| cmd.contains("permission-hook.cjs"))
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false)
                });
            }
        }
    }

    // Write back to file
    let content = serde_json::to_string_pretty(&settings)?;
    fs::write(&settings_path, &content)?;

    Ok(())
}

/// Check if onboarding has been completed
#[tauri::command]
pub fn is_onboarding_completed(state: State<Arc<AppState>>) -> Result<bool> {
    Ok(state
        .db
        .get_setting("onboarding_completed")?
        .map(|v| v == "true")
        .unwrap_or(false))
}

/// Mark onboarding as completed
#[tauri::command]
pub fn complete_onboarding(state: State<Arc<AppState>>) -> Result<()> {
    state.db.set_setting("onboarding_completed", "true")?;
    Ok(())
}

/// Reset onboarding (for testing or re-running)
#[tauri::command]
pub fn reset_onboarding(state: State<Arc<AppState>>) -> Result<()> {
    state.db.set_setting("onboarding_completed", "false")?;
    Ok(())
}

/// Get the path to the CLI binary (for development)
fn get_cli_binary_path() -> Option<PathBuf> {
    // Development paths
    let dev_paths = vec![
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/release/mux"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/debug/mux"),
    ];

    for path in dev_paths {
        if path.exists() {
            return Some(path);
        }
    }

    None
}

#[derive(Debug, Serialize)]
pub struct CLIStatus {
    pub installed: bool,
    pub install_path: String,
    pub source_path: Option<String>,
    pub install_command: String,
}

/// Check if the mux CLI is installed
#[tauri::command]
pub fn check_cli_status() -> Result<CLIStatus> {
    let install_path = "/usr/local/bin/mux";
    let installed = PathBuf::from(install_path).exists();
    let source_path = get_cli_binary_path();

    let install_command = if let Some(ref src) = source_path {
        format!("sudo cp \"{}\" /usr/local/bin/mux && sudo chmod +x /usr/local/bin/mux", src.display())
    } else {
        "cd src-tauri && cargo build --release --bin mux && sudo cp target/release/mux /usr/local/bin/".to_string()
    };

    Ok(CLIStatus {
        installed,
        install_path: install_path.to_string(),
        source_path: source_path.map(|p| p.to_string_lossy().to_string()),
        install_command,
    })
}

/// Install the mux CLI to /usr/local/bin
#[tauri::command]
pub fn install_cli() -> Result<String> {
    let source = get_cli_binary_path().ok_or_else(|| {
        AppError::Other("CLI binary not found. Build it first with: cd src-tauri && cargo build --release --bin mux".to_string())
    })?;

    let dest = PathBuf::from("/usr/local/bin/mux");

    // Copy the binary
    fs::copy(&source, &dest).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            AppError::Other(format!(
                "Permission denied. Run: sudo cp \"{}\" /usr/local/bin/mux && sudo chmod +x /usr/local/bin/mux",
                source.display()
            ))
        } else {
            AppError::Io(e)
        }
    })?;

    // Make it executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&dest)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&dest, perms)?;
    }

    Ok(dest.to_string_lossy().to_string())
}
