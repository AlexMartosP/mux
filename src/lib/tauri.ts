import { invoke } from "@tauri-apps/api/core";
import type { Task, CreateTaskInput, OutputLine, FileChange, FileDiff, CommitInfo, PRPreview, PullRequest } from "../types/task";

export async function getTasks(): Promise<Task[]> {
  return invoke("get_tasks");
}

export async function getTask(id: string): Promise<Task | null> {
  return invoke("get_task", { id });
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return invoke("create_task", { input });
}

export async function deleteTask(id: string): Promise<void> {
  return invoke("delete_task", { id });
}

export async function deleteTasks(ids: string[]): Promise<number> {
  return invoke("delete_tasks", { ids });
}

export async function stopTask(id: string): Promise<void> {
  return invoke("stop_task", { id });
}

export async function restartTask(id: string, prompt?: string): Promise<void> {
  return invoke("restart_task", { id, prompt });
}

export interface TakeoverResult {
  original_branch: string;
  wip_commit: string;
  had_stash: boolean;
  repo_path: string;
  branch: string;
}

export async function takeoverTask(id: string): Promise<TakeoverResult> {
  return invoke("takeover_task", { id });
}

export async function handbackTask(
  id: string,
  commitMessage?: string,
  prompt?: string
): Promise<void> {
  return invoke("handback_task", { id, commitMessage, prompt });
}

export async function getTaskOutput(
  taskId: string,
  limit?: number,
  offset?: number
): Promise<OutputLine[]> {
  return invoke("get_task_output", { taskId, limit, offset });
}

export async function getTaskOutputCount(taskId: string): Promise<number> {
  return invoke("get_task_output_count", { taskId });
}

// Git functions
export async function getTaskChanges(taskId: string): Promise<FileChange[]> {
  return invoke("get_task_changes", { taskId });
}

export async function getFileDiff(taskId: string, filePath: string): Promise<FileDiff> {
  return invoke("get_file_diff", { taskId, filePath });
}

export async function getFileDiffWithContext(
  taskId: string,
  filePath: string,
  contextLines: number
): Promise<FileDiff> {
  return invoke("get_file_diff_with_context", { taskId, filePath, contextLines });
}

export async function getFullDiff(taskId: string): Promise<string> {
  return invoke("get_full_diff", { taskId });
}

export async function getTaskCommits(taskId: string, limit?: number): Promise<CommitInfo[]> {
  return invoke("get_task_commits", { taskId, limit });
}

// GitHub/PR functions
export async function checkGitHubAuth(): Promise<boolean> {
  return invoke("check_github_auth");
}

export async function getPRPreview(taskId: string): Promise<PRPreview> {
  return invoke("get_pr_preview", { taskId });
}

export async function createPullRequest(
  taskId: string,
  title: string,
  body: string,
  draft: boolean
): Promise<PullRequest> {
  return invoke("create_pull_request", { taskId, title, body, draft });
}

export async function openPRInBrowser(url: string): Promise<void> {
  return invoke("open_pr_in_browser", { url });
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

// Task metadata generation
export interface GeneratedTaskInfo {
  title: string;
  description: string;
  branch_name: string;
  ticket_id: string | null;
}

export async function generateTaskMetadata(
  prompt: string,
  repositoryPath: string
): Promise<GeneratedTaskInfo> {
  return invoke("generate_task_metadata", { prompt, repositoryPath });
}

export async function updateTaskName(id: string, name: string): Promise<void> {
  return invoke("update_task_name", { id, name });
}

export async function updateTaskDescription(id: string, description: string): Promise<void> {
  return invoke("update_task_description", { id, description });
}

export async function setTaskAutoAcceptEdits(id: string, enabled: boolean): Promise<void> {
  return invoke("set_task_auto_accept_edits", { id, enabled });
}

// Permission handling
export interface PermissionRequest {
  request_id: string;
  task_id: string;
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
  task_ids: string[];
  include_output: boolean;
}

export async function exportTasks(options: ExportOptions): Promise<string> {
  return invoke("export_tasks", { options });
}
