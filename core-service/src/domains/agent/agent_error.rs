use thiserror::Error;

#[derive(Error, Debug)]
pub enum AgentError {
  #[error("Agent not found")]
  NotFound,

  #[error("Agent already exists")]
  AlreadyExists,

  #[error("Agent creation failed")]
  CreationFailed,

  #[error("Invalid branch name")]
  InvalidBranchName,

  #[error("Worktree creation failed")]
  WorktreeCreationFailed,

  #[error("Agent is not in valid state for this operation")]
  InvalidState,

  #[error("Failed to communicate with agent process")]
  ProcessCommunicationFailed,

  #[error("Agent process is not running")]
  ProcessNotRunning,
}
