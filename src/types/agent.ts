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

export interface AgentMetadataEvent {
  agent_id: string;
  name: string;
  description: string;
  branch: string;
  worktree_path: string;
}

export interface DescriptionEvent {
  agent_id: string;
  description: string;
}

export interface SpawnAgentInput {
  repository_path: string;
  prompt: string;
  existing_branch?: string;
  base_branch?: string;
  branch_name?: string; // Custom branch name for new branches (if not provided, auto-generated)
  workspace_id?: string; // Workspace ID to associate with (for setup/teardown scripts)
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

export interface StatusEvent {
  agent_id: string;
  status: string;
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
export type TaskMetadataEvent = AgentMetadataEvent;
export type CreateTaskInput = SpawnAgentInput;
