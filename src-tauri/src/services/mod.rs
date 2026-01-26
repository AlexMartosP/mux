mod claude_process;
pub mod git;
pub mod github;
mod ipc_server;
pub mod output;
pub mod shell;
pub mod task_generator;
mod worktree;

pub use claude_process::ClaudeProcessService;
pub use git::{CommitInfo, FileChange, FileDiff, FileStatus, GitService};
pub use github::{GitHubService, PRCreateInput, PRPreview, PullRequest};
pub use ipc_server::{get_ipc_port, respond_to_permission, IPCServer, PermissionDecision};
pub use output::{OutputMux, ParsedOutput};
pub use task_generator::{generate_task_info, GeneratedTaskInfo};
pub use worktree::WorktreeService;
