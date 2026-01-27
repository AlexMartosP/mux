use directories::BaseDirs;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Idle,
    Running,
    WaitingInput,
    Completed,
    Error,
    ManualControl,
    /// Task was running but process died unexpectedly (app restart, crash, etc.)
    Interrupted,
    /// Task is queued and waiting for a slot to run
    Queued,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Idle => "idle",
            TaskStatus::Running => "running",
            TaskStatus::WaitingInput => "waiting_input",
            TaskStatus::Completed => "completed",
            TaskStatus::Error => "error",
            TaskStatus::ManualControl => "manual_control",
            TaskStatus::Interrupted => "interrupted",
            TaskStatus::Queued => "queued",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "running" => TaskStatus::Running,
            "waiting_input" => TaskStatus::WaitingInput,
            "completed" => TaskStatus::Completed,
            "error" => TaskStatus::Error,
            "manual_control" => TaskStatus::ManualControl,
            "interrupted" => TaskStatus::Interrupted,
            "queued" => TaskStatus::Queued,
            _ => TaskStatus::Idle,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repository_path: String,
    pub branch: String,
    pub worktree_path: String,
    pub status: TaskStatus,
    pub prompt: String,
    pub created_at: String,
    pub pr_url: Option<String>,
    /// Whether the task is still loading metadata (title, description, branch name)
    #[serde(default)]
    pub metadata_loading: bool,
    /// Whether to auto-accept edit/write tool calls without prompting
    #[serde(default)]
    pub auto_accept_edits: bool,
    /// Whether this task is pinned to the top of the sidebar
    #[serde(default)]
    pub pinned: bool,
    #[serde(skip)]
    pub pid: Option<u32>,
}

impl Task {
    /// Create a new task with AI-generated or provided metadata
    pub fn new_with_metadata(
        repository_path: String,
        prompt: String,
        name: String,
        description: String,
        branch: String,
        metadata_loading: bool,
    ) -> Self {
        let id = Uuid::new_v4().to_string();

        let repo_path = std::path::Path::new(&repository_path);
        let repo_name = repo_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("repo");

        // Compute absolute worktree path in ~/.mux/worktrees/<repo-name>/<branch-name>/
        let worktree_path = BaseDirs::new()
            .map(|dirs| {
                dirs.home_dir()
                    .join(".mux")
                    .join("worktrees")
                    .join(repo_name)
                    .join(branch.replace('/', "-").replace('&', "-"))
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|| {
                // Fallback to old behavior if home dir not found
                repo_path
                    .parent()
                    .unwrap_or(repo_path)
                    .join("worktrees")
                    .join(repo_name)
                    .join(branch.replace('/', "-").replace('&', "-"))
                    .to_string_lossy()
                    .to_string()
            });

        Self {
            id,
            name,
            description,
            repository_path,
            branch,
            worktree_path,
            status: TaskStatus::Idle,
            prompt,
            created_at: chrono::Utc::now().to_rfc3339(),
            pr_url: None,
            metadata_loading,
            auto_accept_edits: false,
            pinned: false,
            pid: None,
        }
    }

    /// Create a new task with a quick temporary name (for instant UI feedback)
    /// Metadata will be loaded in the background
    pub fn new_with_temp_name(repository_path: String, prompt: String) -> Self {
        // Generate a human-readable temporary branch name
        let temp_id = human_ids::generate(None);
        let branch = format!("task/{}", temp_id);

        Self::new_with_metadata(
            repository_path,
            prompt,
            "Loading...".to_string(),
            String::new(),
            branch,
            true, // metadata is loading
        )
    }

    /// Create a new task with auto-generated metadata (fallback)
    pub fn new(repository_path: String, prompt: String) -> Self {
        // Auto-generate task name and description from prompt
        let name = Self::generate_name_from_prompt(&prompt);
        let description = Self::generate_description_from_prompt(&prompt);
        let branch = format!("agent/{}", slug::slugify(&name));

        Self::new_with_metadata(repository_path, prompt, name, description, branch, false)
    }

    /// Generate a concise task name from the prompt
    fn generate_name_from_prompt(prompt: &str) -> String {
        // Common action words to look for
        let action_words = ["add", "create", "implement", "fix", "update", "remove", "refactor", "build", "setup", "configure", "write", "make", "change", "improve", "optimize"];

        let words: Vec<&str> = prompt.split_whitespace().collect();

        // Try to find an action word and take words after it
        for (i, word) in words.iter().enumerate() {
            let word_lower = word.to_lowercase();
            let clean_word: String = word_lower.chars().filter(|c| c.is_alphanumeric()).collect();

            if action_words.contains(&clean_word.as_ref()) {
                // Take the action word and next 3-5 words
                let end = (i + 5).min(words.len());
                let name_words: Vec<&str> = words[i..end].to_vec();
                let name = name_words.join(" ");

                // Clean up and truncate
                let name = name
                    .chars()
                    .filter(|c| c.is_alphanumeric() || c.is_whitespace())
                    .collect::<String>();

                if name.len() > 50 {
                    return format!("{}...", &name[..47]);
                }
                return name;
            }
        }

        // Fallback: use first 5 words
        let name_words: Vec<&str> = words.iter().take(5).copied().collect();
        let name = name_words.join(" ");

        let name = name
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>();

        if name.len() > 50 {
            format!("{}...", &name[..47])
        } else if name.is_empty() {
            "New task".to_string()
        } else {
            name
        }
    }

    /// Generate an initial description from the prompt
    fn generate_description_from_prompt(prompt: &str) -> String {
        // Clean up the prompt - remove extra whitespace
        let cleaned: String = prompt
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join(" ");

        // Truncate if too long, keeping first ~200 chars
        if cleaned.len() > 200 {
            let truncated = &cleaned[..197];
            // Try to break at a word boundary
            if let Some(last_space) = truncated.rfind(' ') {
                format!("{}...", &truncated[..last_space])
            } else {
                format!("{}...", truncated)
            }
        } else {
            cleaned
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskInput {
    pub repository_path: String,
    pub prompt: String,
    /// Optional: use an existing branch instead of creating a new one
    pub existing_branch: Option<String>,
}
