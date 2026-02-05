mod agent;
mod editor;
mod export;
mod git;
mod github;
mod permissions;
mod settings;
mod slash_commands;
mod terminal;
mod workspace;

pub use editor::open_in_editor;
pub use export::export_agents;
pub use git::{get_agent_changes, get_agent_changes_filtered, get_agent_commits, get_branch_base, get_file_diff, get_file_diff_with_context, get_full_diff, get_structured_file_diff, list_branches, refresh_agent_git_stats, revert_file_changes, update_agent_base_branch};
pub use github::{check_github_auth, create_pull_request, get_ci_status, get_pr_preview, open_pr_in_browser};
pub use permissions::respond_permission;
pub use settings::{
    add_permission_rule, check_claude_hook_status, check_cli_status, complete_onboarding, get_settings,
    install_claude_hook, install_cli, is_onboarding_completed, list_repositories, reset_onboarding,
    set_setting, uninstall_claude_hook, update_settings,
};
pub use slash_commands::get_slash_commands;
pub use agent::{
    calculate_worktree_disk_usage, clear_notifications, delete_all_data, spawn_agent, delete_agent,
    delete_agents, generate_agent_metadata, get_cost_summary, get_notifications, get_agent,
    get_agent_output, get_agent_output_count, get_agent_messages, get_agent_messages_count,
    get_agents, get_agents_by_workspace, get_unread_notification_count, handback_agent,
    mark_all_notifications_read, mark_notification_read, restart_agent, set_agent_auto_accept_edits,
    set_agent_pinned, stop_agent, takeover_agent, update_agent_description, update_agent_name,
    AppState,
};
pub use terminal::{close_terminal, get_terminal_buffer, open_terminal, terminal_input, terminal_resize, TerminalState};
pub use workspace::{
    add_repository_to_workspace, create_workspace, delete_workspace, delete_workspace_setting,
    get_all_workspace_settings, get_default_workspace, get_workspace, get_workspace_repositories,
    get_workspace_repository, get_workspace_setting, get_workspaces, list_workspace_repositories,
    remove_repository_from_workspace, scan_folder_for_repositories, set_default_workspace,
    set_workspace_setting, update_repository_scripts, update_workspace,
};
