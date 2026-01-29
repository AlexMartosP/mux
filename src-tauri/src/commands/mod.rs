mod editor;
mod export;
mod git;
mod github;
mod permissions;
mod settings;
mod slash_commands;
mod task;

pub use editor::open_in_editor;
pub use export::export_tasks;
pub use git::{get_branch_base, get_file_diff, get_file_diff_with_context, get_full_diff, get_task_changes, get_task_commits, list_branches, revert_file_changes, update_task_base_branch};
pub use github::{check_github_auth, create_pull_request, get_pr_preview, open_pr_in_browser};
pub use permissions::respond_permission;
pub use settings::{
    add_permission_rule, check_claude_hook_status, check_cli_status, complete_onboarding, get_settings,
    install_claude_hook, install_cli, is_onboarding_completed, list_repositories, reset_onboarding,
    set_setting, uninstall_claude_hook, update_settings,
};
pub use slash_commands::get_slash_commands;
pub use task::{
    clear_notifications, create_task, delete_task, delete_tasks, generate_task_metadata, get_cost_summary,
    get_notifications, get_task, get_task_output, get_task_output_count, get_tasks,
    get_unread_notification_count, handback_task, mark_all_notifications_read,
    mark_notification_read, restart_task, set_task_auto_accept_edits, set_task_pinned, stop_task,
    takeover_task, update_task_description, update_task_name, AppState,
};
