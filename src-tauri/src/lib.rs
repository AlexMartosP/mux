mod commands;
mod db;
mod error;
mod models;
mod services;

use commands::{
    check_claude_hook_status, check_cli_status, check_github_auth, complete_onboarding,
    create_pull_request, create_task, delete_task, delete_tasks, export_tasks,
    generate_task_metadata, get_file_diff, get_file_diff_with_context, get_full_diff, get_pr_preview,
    get_settings, get_slash_commands, get_task, get_task_changes, get_task_commits, get_task_output,
    get_task_output_count, get_tasks, handback_task, install_claude_hook, install_cli,
    is_onboarding_completed, list_repositories, open_in_editor, open_pr_in_browser, reset_onboarding,
    respond_permission, restart_task, set_setting, set_task_auto_accept_edits, stop_task,
    takeover_task, uninstall_claude_hook, update_settings, update_task_description,
    update_task_name, AppState,
};
use db::Database;
use models::TaskStatus;
use services::{init_db_writer, ClaudeProcessService, IPCServer};
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
        .setup(move |app| {
            // Recover interrupted tasks on startup
            // Tasks that were "running" but whose processes are dead should be marked "interrupted"
            if let Ok(running_tasks) = db_for_recovery.get_running_tasks_with_pids() {
                for (task_id, pid) in running_tasks {
                    let is_alive = pid.map(|p| ClaudeProcessService::is_pid_alive(p)).unwrap_or(false);

                    if !is_alive {
                        // Process is dead, mark task as interrupted
                        let _ = db_for_recovery.update_task_status_and_pid(
                            &task_id,
                            TaskStatus::Interrupted,
                            None
                        );
                        eprintln!("Recovered interrupted task: {} (PID {:?} no longer running)", task_id, pid);
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
            get_tasks,
            get_task,
            create_task,
            delete_task,
            delete_tasks,
            stop_task,
            restart_task,
            takeover_task,
            handback_task,
            get_task_output,
            get_task_output_count,
            get_task_changes,
            get_file_diff,
            get_file_diff_with_context,
            get_full_diff,
            get_task_commits,
            check_github_auth,
            get_pr_preview,
            create_pull_request,
            open_pr_in_browser,
            get_slash_commands,
            get_settings,
            update_settings,
            set_setting,
            list_repositories,
            generate_task_metadata,
            update_task_name,
            update_task_description,
            set_task_auto_accept_edits,
            respond_permission,
            open_in_editor,
            // Export commands
            export_tasks,
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Graceful shutdown: stop all running Claude processes
                eprintln!("App exiting, shutting down Claude processes...");

                // Get all running tasks and mark them as interrupted
                let running_pids = claude_for_exit.get_all_running_pids();
                for (task_id, _pid) in &running_pids {
                    let _ = db_for_exit.update_task_status_and_pid(
                        task_id,
                        TaskStatus::Interrupted,
                        None
                    );
                }

                // Stop all processes
                claude_for_exit.shutdown_all();

                eprintln!("Shutdown complete");
            }
        });
}
