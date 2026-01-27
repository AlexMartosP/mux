export type TaskStatus =
  | "idle"
  | "running"
  | "waiting_input"
  | "completed"
  | "error"
  | "manual_control"
  | "interrupted";

export interface Task {
  id: string;
  name: string;
  description: string;
  repository_path: string;
  branch: string;
  worktree_path: string;
  status: TaskStatus;
  prompt: string;
  created_at: string;
  pr_url?: string;
  metadata_loading?: boolean;
  auto_accept_edits?: boolean;
}

export interface TaskMetadataEvent {
  task_id: string;
  name: string;
  description: string;
  branch: string;
  worktree_path: string;
}

export interface DescriptionEvent {
  task_id: string;
  description: string;
}

export interface CreateTaskInput {
  repository_path: string;
  prompt: string;
}

export interface OutputLine {
  output_type: string;
  content: string;
  timestamp: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface OutputEvent {
  task_id: string;
  output_type: string;
  content: string;
  timestamp: string;
}

export interface StatusEvent {
  task_id: string;
  status: string;
}

export interface ActivityEvent {
  task_id: string;
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
