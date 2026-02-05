export type AgentStatus =
  | "setting_up"
  | "idle"
  | "running"
  | "waiting_input"
  | "completed"
  | "error"
  | "manual_control"
  | "interrupted"
  | "queued"
  | "in_review";

export interface Agent {
  id: string;
  name: string;
  description: string;
  repository_path: string;
  branch: string;
  worktree_path: string;
  status: AgentStatus;
  prompt: string;
  created_at: string;
  pr_url?: string;
  metadata_loading?: boolean;
  auto_accept_edits?: boolean;
  pinned?: boolean;
  total_cost_usd?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  base_branch?: string;
  total_additions?: number;
  total_deletions?: number;
  workspace_id?: string;
}

export interface Workspace {
  id: string;
  name: string;
  repos_folder_path: string;
  created_at: string;
  is_default: boolean;
}

export interface RepositoryInfo {
  name: string;
  path: string;
}

export interface WorkspaceRepository {
  workspace_id: string;
  repository_path: string;
  name: string;
  added_at: string;
  setup_script?: string;
  teardown_script?: string;
}

export interface NotificationEntry {
  id: number;
  agent_id?: string;
  title: string;
  body: string;
  notification_type: string;
  read: boolean;
  created_at: string;
}

export interface CostSummary {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  agent_count: number;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  short_hash: string;
  last_commit_date: string;
}

export interface SpawnAgentInput {
  repository_path: string;
  prompt: string;
  existing_branch?: string;
  base_branch?: string;
  branch_name?: string; // Custom branch name for new branches (if not provided, auto-generated)
  workspace_id: string; // Required: Workspace ID to associate with
}

export interface OutputLine {
  output_type: string;
  content: string;
  timestamp: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface OutputEvent {
  agent_id: string;
  output_type: string;
  content: string;
  timestamp: string;
}

// Message types for new architecture
export interface TextPart {
  type: "text";
  content: string;
}

export interface ThinkingPart {
  type: "thinking";
  content: string;
}

export interface ToolUsagePart {
  type: "tool_usage";
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export type MessagePart = TextPart | ThinkingPart | ToolUsagePart;

export interface Message {
  id: string;
  agent_id: string;
  role: "assistant" | "user" | "system";
  parts: MessagePart[];
  timestamp: string;
}

export interface AgentMessageEvent {
  agent_id: string;
  message_id: string;
  event_type: "message_created" | "message_part" | "message_complete" | "message_deleted";
  role?: "assistant" | "user" | "system";
  timestamp?: string;
  part?: MessagePart;
  parts?: MessagePart[];
}

export type SetupStage = "initializing" | "creating_worktree" | "running_setup" | "generating_metadata" | "starting_agent";

export interface SetupProgressEvent {
  agent_id: string;
  stage: SetupStage;
  message: string;
}

export interface ActivityEvent {
  agent_id: string;
  activity_type: "tool_use" | "tool_result" | "thinking" | "text";
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  content?: string;
  timestamp: string;
}

// Git types
export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked";

export interface FileChange {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export interface FileDiff {
  path: string;
  diff: string;
}

// Structured diff types
export type DiffLineType = "add" | "delete" | "context";

export interface DiffLine {
  line_type: DiffLineType;
  content: string;
  old_line_num?: number;
  new_line_num?: number;
}

export interface DiffHunk {
  header: string;
  old_start: number;
  old_count: number;
  new_start: number;
  new_count: number;
  lines: DiffLine[];
  can_expand_up: boolean;
  can_expand_down: boolean;
  raw_content: string; // Raw hunk string for git-diff-view library
}

export interface StructuredFileDiff {
  path: string;
  hunks: DiffHunk[];
  is_binary: boolean;
  is_new_file: boolean;
  is_deleted: boolean;
  old_file_header: string;
  new_file_header: string;
}

export interface DiffOptions {
  context_lines: number;
  exclude_untracked: boolean;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
}

// PR types
export interface PullRequest {
  url: string;
  number: number;
  title: string;
  state: string;
}

export interface CommitSummary {
  short_hash: string;
  message: string;
}

export interface PRPreview {
  title: string;
  body: string;
  base_branch: string;
  head_branch: string;
  commits: CommitSummary[];
  has_existing_pr: boolean;
  existing_pr_url?: string;
}

// CI Status types
export type CIStatus = "passing" | "failing" | "running" | "no_ci";

export interface CICheck {
  name: string;
  state: string;
  conclusion: string | null;
  link: string | null;
}

export interface CIStatusResponse {
  status: CIStatus;
  checks: CICheck[];
}

// Re-export old names as aliases for backwards compatibility during transition
export type TaskStatus = AgentStatus;
export type Task = Agent;
export type CreateTaskInput = SpawnAgentInput;
