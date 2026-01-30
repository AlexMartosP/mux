use serde::ser::SerializeStruct;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    #[error("Repository not found: {0}")]
    RepositoryNotFound(String),

    #[error("Git error: {0}")]
    Git(String),

    #[error("GitHub error: {0}")]
    GitHub(String),

    #[error("Process error: {0}")]
    Process(String),

    #[error("Worktree error: {0}")]
    Worktree(String),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    /// Get the error category for UI display
    pub fn category(&self) -> &'static str {
        match self {
            AppError::Database(_) => "database",
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
            AppError::AgentNotFound(_) => "not_found",
            AppError::RepositoryNotFound(_) => "not_found",
            AppError::Git(_) => "git",
            AppError::GitHub(_) => "github",
            AppError::Process(_) => "process",
            AppError::Worktree(_) => "worktree",
            AppError::Other(_) => "other",
        }
    }

    /// Whether this error is potentially recoverable by retrying
    pub fn is_recoverable(&self) -> bool {
        matches!(
            self,
            AppError::Io(_) | AppError::GitHub(_) | AppError::Process(_)
        )
    }

    /// Get suggestions for recovering from this error
    pub fn suggestions(&self) -> Vec<&'static str> {
        match self {
            AppError::Git(msg) if msg.contains("worktree") => vec![
                "Check if the worktree already exists",
                "Try deleting the worktree directory manually",
            ],
            AppError::Git(msg) if msg.contains("branch") => vec![
                "The branch may already exist",
                "Try using a different branch name",
            ],
            AppError::GitHub(_) => vec![
                "Check your GitHub authentication with 'gh auth status'",
                "Ensure you have push access to the repository",
            ],
            AppError::Process(_) => vec![
                "Check if Claude CLI is installed correctly",
                "Try running 'claude --version' in terminal",
            ],
            AppError::RepositoryNotFound(_) => vec![
                "Verify the repository path exists",
                "Check if it's a valid git repository",
            ],
            AppError::Worktree(msg) if msg.contains("exists") => vec![
                "A worktree with this name already exists",
                "Delete the existing worktree or use a different branch name",
            ],
            _ => vec![],
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 4)?;
        state.serialize_field("message", &self.to_string())?;
        state.serialize_field("category", &self.category())?;
        state.serialize_field("recoverable", &self.is_recoverable())?;
        state.serialize_field("suggestions", &self.suggestions())?;
        state.end()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
