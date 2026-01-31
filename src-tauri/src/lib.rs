mod commands;
mod db;
mod error;
mod models;
mod services;

use commands::{
    add_permission_rule, add_repository_to_workspace, check_claude_hook_status, check_cli_status,
    check_github_auth, clear_notifications, close_terminal, complete_onboarding,
    create_pull_request, create_workspace, delete_agent, delete_agents, delete_workspace,
    delete_workspace_setting, export_agents, generate_agent_metadata, get_all_workspace_settings,
    get_branch_base, get_ci_status, get_cost_summary, get_default_workspace, get_file_diff,
    get_file_diff_with_context, get_full_diff, get_notifications, get_pr_preview, get_settings,
    get_slash_commands, get_agent, get_agent_changes, get_agent_commits, get_agent_output,
    get_agent_output_count, get_agents, get_unread_notification_count, get_workspace,
    get_workspace_repositories, get_workspace_setting, get_workspaces, handback_agent,
    install_claude_hook, install_cli, is_onboarding_completed, list_branches, list_repositories,
    list_workspace_repositories, mark_all_notifications_read, mark_notification_read, open_in_editor,
    open_pr_in_browser, open_terminal, get_terminal_buffer, refresh_agent_git_stats, remove_repository_from_workspace,
    reset_onboarding, respond_permission, restart_agent, revert_file_changes,
    scan_folder_for_repositories, set_default_workspace, set_setting, set_workspace_setting,
    set_agent_auto_accept_edits, set_agent_pinned, spawn_agent, stop_agent, takeover_agent,
    terminal_input, terminal_resize, uninstall_claude_hook, update_settings, update_agent_base_branch,
    update_agent_description, update_agent_name, update_workspace, AppState, TerminalState,
};
use db::Database;
use models::AgentStatus;
use services::{init_db_writer, ClaudeProcessService, IPCServer, TerminalService};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging - set RUST_LOG=debug to see logs
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    log::info!("Starting Mux...");

    // Initialize database
    let db = Arc::new(Database::new().expect("Failed to initialize database"));

    // Initialize batched database writer for high-performance output handling
    init_db_writer(Arc::clone(&db));

    let claude = Arc::new(ClaudeProcessService::new());

    let state = Arc::new(AppState {
        db: Arc::clone(&db),
        claude: Arc::clone(&claude),
    });

    // Initialize terminal service
    let terminal_state = TerminalState {
        terminal: Arc::new(TerminalService::new()),
    };

    // Clone for IPC server
    let db_for_ipc = Arc::clone(&db);
    let claude_for_ipc = Arc::clone(&claude);

    // Clone for startup recovery
    let db_for_recovery = Arc::clone(&db);

    // Clone for exit handling
    let claude_for_exit = Arc::clone(&claude);
    let db_for_exit = Arc::clone(&db);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .manage(terminal_state)
        .setup(move |app| {
            // Recover interrupted agents on startup
            // Agents that were "running" but whose processes are dead should be marked "interrupted"
            if let Ok(running_agents) = db_for_recovery.get_running_agents_with_pids() {
                for (agent_id, pid) in running_agents {
                    let is_alive = pid.map(|p| ClaudeProcessService::is_pid_alive(p)).unwrap_or(false);

                    if !is_alive {
                        // Process is dead, mark agent as interrupted
                        let _ = db_for_recovery.update_agent_status_and_pid(
                            &agent_id,
                            AgentStatus::Interrupted,
                            None
                        );
                        eprintln!("Recovered interrupted agent: {} (PID {:?} no longer running)", agent_id, pid);
                    }
                }
            }

            // Start IPC server for CLI communication
            let ipc_server = IPCServer::new(db_for_ipc, claude_for_ipc, app.handle().clone());
            if let Err(e) = ipc_server.start() {
                eprintln!("Warning: Failed to start IPC server: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_agents,
            get_agent,
            spawn_agent,
            delete_agent,
            delete_agents,
            stop_agent,
            restart_agent,
            takeover_agent,
            handback_agent,
            get_agent_output,
            get_agent_output_count,
            get_agent_changes,
            get_file_diff,
            get_file_diff_with_context,
            get_full_diff,
            get_agent_commits,
            check_github_auth,
            get_pr_preview,
            create_pull_request,
            open_pr_in_browser,
            get_ci_status,
            get_slash_commands,
            get_settings,
            update_settings,
            set_setting,
            list_repositories,
            generate_agent_metadata,
            update_agent_name,
            update_agent_description,
            set_agent_auto_accept_edits,
            respond_permission,
            open_in_editor,
            // Export commands
            export_agents,
            // Onboarding commands
            is_onboarding_completed,
            complete_onboarding,
            reset_onboarding,
            check_claude_hook_status,
            install_claude_hook,
            uninstall_claude_hook,
            // CLI commands
            check_cli_status,
            install_cli,
            // Agent management
            set_agent_pinned,
            get_cost_summary,
            // Notifications
            get_notifications,
            get_unread_notification_count,
            mark_notification_read,
            mark_all_notifications_read,
            clear_notifications,
            // Git
            list_branches,
            revert_file_changes,
            get_branch_base,
            update_agent_base_branch,
            refresh_agent_git_stats,
            // Permissions
            add_permission_rule,
            // Workspaces
            get_workspaces,
            get_workspace,
            get_default_workspace,
            create_workspace,
            update_workspace,
            delete_workspace,
            set_default_workspace,
            list_workspace_repositories,
            // Workspace settings
            get_workspace_setting,
            set_workspace_setting,
            delete_workspace_setting,
            get_all_workspace_settings,
            // Workspace repositories
            get_workspace_repositories,
            add_repository_to_workspace,
            remove_repository_from_workspace,
            scan_folder_for_repositories,
            // Terminal
            open_terminal,
            get_terminal_buffer,
            terminal_input,
            terminal_resize,
            close_terminal,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Graceful shutdown: stop all running Claude processes
                eprintln!("App exiting, shutting down Claude processes...");

                // Get all running agents and mark them as interrupted
                let running_pids = claude_for_exit.get_all_running_pids();
                for (agent_id, _pid) in &running_pids {
                    let _ = db_for_exit.update_agent_status_and_pid(
                        agent_id,
                        AgentStatus::Interrupted,
                        None
                    );
                }

                // Stop all processes
                claude_for_exit.shutdown_all();

                eprintln!("Shutdown complete");
            }
        });
}
