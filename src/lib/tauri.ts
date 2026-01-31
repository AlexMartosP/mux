import { invoke } from "@tauri-apps/api/core";
import type { Agent, SpawnAgentInput, OutputLine, FileChange, FileDiff, CommitInfo, PRPreview, PullRequest, NotificationEntry, BranchInfo, CostSummary, Workspace, RepositoryInfo, WorkspaceRepository, CIStatusResponse } from "../types/agent";

export async function getAgents(): Promise<Agent[]> {
  return invoke("get_agents");
}

export async function getAgent(id: string): Promise<Agent | null> {
  return invoke("get_agent", { id });
}

export async function spawnAgent(input: SpawnAgentInput): Promise<Agent> {
  return invoke("spawn_agent", { input });
}

export async function deleteAgent(id: string): Promise<void> {
  return invoke("delete_agent", { id });
}

export async function deleteAgents(ids: string[]): Promise<number> {
  return invoke("delete_agents", { ids });
}

export async function stopAgent(id: string): Promise<void> {
  return invoke("stop_agent", { id });
}

export async function restartAgent(id: string, prompt?: string): Promise<void> {
  return invoke("restart_agent", { id, prompt });
}

export interface TakeoverResult {
  original_branch: string;
  wip_commit: string;
  had_stash: boolean;
  repo_path: string;
  branch: string;
}

export async function takeoverAgent(id: string): Promise<TakeoverResult> {
  return invoke("takeover_agent", { id });
}

export async function handbackAgent(
  id: string,
  commitMessage?: string,
  prompt?: string
): Promise<void> {
  return invoke("handback_agent", { id, commitMessage, prompt });
}

export async function getAgentOutput(
  agentId: string,
  limit?: number,
  offset?: number
): Promise<OutputLine[]> {
  return invoke("get_agent_output", { agentId, limit, offset });
}

export async function getAgentOutputCount(agentId: string): Promise<number> {
  return invoke("get_agent_output_count", { agentId });
}

// Git functions
export async function getAgentChanges(agentId: string): Promise<FileChange[]> {
  return invoke("get_agent_changes", { agentId });
}

export async function getFileDiff(agentId: string, filePath: string): Promise<FileDiff> {
  return invoke("get_file_diff", { agentId, filePath });
}

export async function getFileDiffWithContext(
  agentId: string,
  filePath: string,
  contextLines: number
): Promise<FileDiff> {
  return invoke("get_file_diff_with_context", { agentId, filePath, contextLines });
}

export async function getFullDiff(agentId: string): Promise<string> {
  return invoke("get_full_diff", { agentId });
}

export async function getAgentCommits(agentId: string, limit?: number): Promise<CommitInfo[]> {
  return invoke("get_agent_commits", { agentId, limit });
}

// GitHub/PR functions
export async function checkGitHubAuth(): Promise<boolean> {
  return invoke("check_github_auth");
}

export async function getPRPreview(agentId: string): Promise<PRPreview> {
  return invoke("get_pr_preview", { agentId });
}

export async function createPullRequest(
  agentId: string,
  title: string,
  body: string,
  draft: boolean
): Promise<PullRequest> {
  return invoke("create_pull_request", { agentId, title, body, draft });
}

export async function openPRInBrowser(url: string): Promise<void> {
  return invoke("open_pr_in_browser", { url });
}

export async function getCIStatus(prUrl: string): Promise<CIStatusResponse> {
  return invoke("get_ci_status", { prUrl });
}

export async function refreshAgentGitStats(agentId: string): Promise<[number, number]> {
  return invoke("refresh_agent_git_stats", { agentId });
}

// Slash commands
export interface SlashCommand {
  command: string;
  description: string;
  source: "builtin" | "global" | "project";
  has_args: boolean;
}

export async function getSlashCommands(repositoryPath?: string): Promise<SlashCommand[]> {
  return invoke("get_slash_commands", { repositoryPath });
}

// Settings
export interface AppSettings {
  base_repo_directory: string | null;
  branch_prefix: string | null;
  notify_on_completion: boolean;
  notify_on_error: boolean;
  prompt_for_permissions: boolean;
  theme: string | null;
  max_concurrent_agents: number;
  send_with_enter: boolean;
  font_size: number;
}

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  return invoke("update_settings", { settings });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

export interface RepoInfo {
  name: string;
  path: string;
  is_git_repo: boolean;
}

export async function listRepositories(): Promise<RepoInfo[]> {
  return invoke("list_repositories");
}

// Agent metadata generation
export interface GeneratedAgentInfo {
  title: string;
  description: string;
  branch_name: string;
  ticket_id: string | null;
}

export async function generateAgentMetadata(
  prompt: string,
  repositoryPath: string
): Promise<GeneratedAgentInfo> {
  return invoke("generate_agent_metadata", { prompt, repositoryPath });
}

export async function updateAgentName(id: string, name: string): Promise<void> {
  return invoke("update_agent_name", { id, name });
}

export async function updateAgentDescription(id: string, description: string): Promise<void> {
  return invoke("update_agent_description", { id, description });
}

export async function setAgentAutoAcceptEdits(id: string, enabled: boolean): Promise<void> {
  return invoke("set_agent_auto_accept_edits", { id, enabled });
}

export async function setAgentPinned(id: string, pinned: boolean): Promise<void> {
  return invoke("set_agent_pinned", { id, pinned });
}

// Notifications
export async function getNotifications(limit?: number, includeRead?: boolean): Promise<NotificationEntry[]> {
  return invoke("get_notifications", { limit, includeRead });
}

export async function getUnreadNotificationCount(): Promise<number> {
  return invoke("get_unread_notification_count");
}

export async function markNotificationRead(id: number): Promise<void> {
  return invoke("mark_notification_read", { id });
}

export async function markAllNotificationsRead(): Promise<void> {
  return invoke("mark_all_notifications_read");
}

export async function clearNotifications(): Promise<void> {
  return invoke("clear_notifications");
}

// File change management
export async function revertFileChanges(agentId: string, filePath: string): Promise<void> {
  return invoke("revert_file_changes", { agentId, filePath });
}

// Branch listing
export async function listBranches(repositoryPath: string): Promise<BranchInfo[]> {
  return invoke("list_branches", { repositoryPath });
}

// Get the base branch for an agent (queries git for merge-base)
export async function getBranchBase(agentId: string): Promise<string | null> {
  return invoke("get_branch_base", { agentId });
}

// Update the base branch for an agent (called after rebase)
export async function updateAgentBaseBranch(agentId: string, baseBranch: string): Promise<void> {
  return invoke("update_agent_base_branch", { agentId, baseBranch });
}

// Permission handling
export interface PermissionRequest {
  request_id: string;
  agent_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export async function respondPermission(
  requestId: string,
  behavior: "allow" | "deny",
  reason?: string
): Promise<boolean> {
  return invoke("respond_permission", { requestId, behavior, reason });
}

// Add permission rule to Claude settings (for "always allow")
export async function addPermissionRule(
  agentId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  scope: "global" | "project"
): Promise<string> {
  return invoke("add_permission_rule", { agentId, toolName, toolInput, scope });
}

export async function openInEditor(path: string, editor: string): Promise<void> {
  return invoke("open_in_editor", { path, editor });
}

// Onboarding
export async function isOnboardingCompleted(): Promise<boolean> {
  return invoke("is_onboarding_completed");
}

export async function completeOnboarding(): Promise<void> {
  return invoke("complete_onboarding");
}

export async function resetOnboarding(): Promise<void> {
  return invoke("reset_onboarding");
}

// Claude hook management
export interface ClaudeHookStatus {
  installed: boolean;
  hook_path: string | null;
  settings_path: string;
  current_config: string | null;
}

export async function checkClaudeHookStatus(): Promise<ClaudeHookStatus> {
  return invoke("check_claude_hook_status");
}

export async function installClaudeHook(): Promise<string> {
  return invoke("install_claude_hook");
}

export async function uninstallClaudeHook(): Promise<void> {
  return invoke("uninstall_claude_hook");
}

// CLI installation
export interface CLIStatus {
  installed: boolean;
  install_path: string;
  source_path: string | null;
  install_command: string;
}

export async function checkCLIStatus(): Promise<CLIStatus> {
  return invoke("check_cli_status");
}

export async function installCLI(): Promise<string> {
  return invoke("install_cli");
}

// Export
export interface ExportOptions {
  format: "json" | "csv" | "markdown";
  agent_ids: string[];
  include_output: boolean;
}

export async function exportAgents(options: ExportOptions): Promise<string> {
  return invoke("export_agents", { options });
}

// Cost tracking
export async function getCostSummary(): Promise<CostSummary> {
  return invoke("get_cost_summary");
}

// Workspaces
export async function getWorkspaces(): Promise<Workspace[]> {
  return invoke("get_workspaces");
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return invoke("get_workspace", { id });
}

export async function getDefaultWorkspace(): Promise<Workspace | null> {
  return invoke("get_default_workspace");
}

export async function createWorkspace(name: string, reposFolderPath: string): Promise<Workspace> {
  return invoke("create_workspace", { name, reposFolderPath });
}

export async function updateWorkspace(id: string, name: string, reposFolderPath: string): Promise<void> {
  return invoke("update_workspace", { id, name, reposFolderPath });
}

export async function deleteWorkspace(id: string): Promise<void> {
  return invoke("delete_workspace", { id });
}

export async function setDefaultWorkspace(id: string): Promise<void> {
  return invoke("set_default_workspace", { id });
}

export async function listWorkspaceRepositories(reposFolderPath: string): Promise<RepositoryInfo[]> {
  return invoke("list_workspace_repositories", { reposFolderPath });
}

// Workspace settings
export async function getWorkspaceSetting(workspaceId: string, key: string): Promise<string | null> {
  return invoke("get_workspace_setting", { workspaceId, key });
}

export async function setWorkspaceSetting(workspaceId: string, key: string, value: string): Promise<void> {
  return invoke("set_workspace_setting", { workspaceId, key, value });
}

export async function deleteWorkspaceSetting(workspaceId: string, key: string): Promise<void> {
  return invoke("delete_workspace_setting", { workspaceId, key });
}

export async function getAllWorkspaceSettings(workspaceId: string): Promise<Record<string, string>> {
  return invoke("get_all_workspace_settings", { workspaceId });
}

// Workspace repositories
export async function getWorkspaceRepositories(workspaceId: string): Promise<WorkspaceRepository[]> {
  return invoke("get_workspace_repositories", { workspaceId });
}

export async function addRepositoryToWorkspace(
  workspaceId: string,
  repositoryPath: string,
  name: string
): Promise<WorkspaceRepository> {
  return invoke("add_repository_to_workspace", { workspaceId, repositoryPath, name });
}

export async function removeRepositoryFromWorkspace(workspaceId: string, repositoryPath: string): Promise<void> {
  return invoke("remove_repository_from_workspace", { workspaceId, repositoryPath });
}

export async function scanFolderForRepositories(folderPath: string): Promise<RepositoryInfo[]> {
  return invoke("scan_folder_for_repositories", { folderPath });
}

// Terminal
export interface OpenTerminalResponse {
  session_existed: boolean;
}

export async function openTerminal(agentId: string): Promise<OpenTerminalResponse> {
  return invoke("open_terminal", { agentId });
}

export async function getTerminalBuffer(agentId: string): Promise<string | null> {
  return invoke("get_terminal_buffer", { agentId });
}

export async function terminalInput(agentId: string, data: string): Promise<void> {
  return invoke("terminal_input", { agentId, data });
}

export async function terminalResize(agentId: string, cols: number, rows: number): Promise<void> {
  return invoke("terminal_resize", { agentId, cols, rows });
}

export async function closeTerminal(agentId: string): Promise<void> {
  return invoke("close_terminal", { agentId });
}
