use directories::BaseDirs;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    /// Agent environment is being set up (worktree creation, etc.)
    SettingUp,
    Idle,
    Running,
    WaitingInput,
    Completed,
    Error,
    ManualControl,
    /// Agent was running but process died unexpectedly (app restart, crash, etc.)
    Interrupted,
    /// Agent is queued and waiting for a slot to run
    Queued,
    /// Agent has a PR and is awaiting review
    InReview,
}

impl AgentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentStatus::SettingUp => "setting_up",
            AgentStatus::Idle => "idle",
            AgentStatus::Running => "running",
            AgentStatus::WaitingInput => "waiting_input",
            AgentStatus::Completed => "completed",
            AgentStatus::Error => "error",
            AgentStatus::ManualControl => "manual_control",
            AgentStatus::Interrupted => "interrupted",
            AgentStatus::Queued => "queued",
            AgentStatus::InReview => "in_review",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "setting_up" => AgentStatus::SettingUp,
            "running" => AgentStatus::Running,
            "waiting_input" => AgentStatus::WaitingInput,
            "completed" => AgentStatus::Completed,
            "error" => AgentStatus::Error,
            "manual_control" => AgentStatus::ManualControl,
            "interrupted" => AgentStatus::Interrupted,
            "queued" => AgentStatus::Queued,
            "in_review" => AgentStatus::InReview,
            _ => AgentStatus::Idle,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repository_path: String,
    pub branch: String,
    pub worktree_path: String,
    pub status: AgentStatus,
    pub prompt: String,
    pub created_at: String,
    pub pr_url: Option<String>,
    /// Whether the agent is still loading metadata (title, description, branch name)
    #[serde(default)]
    pub metadata_loading: bool,
    /// Whether to auto-accept edit/write tool calls without prompting
    #[serde(default)]
    pub auto_accept_edits: bool,
    /// Whether this agent is pinned to the top of the sidebar
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub total_cost_usd: f64,
    #[serde(default)]
    pub total_input_tokens: i64,
    #[serde(default)]
    pub total_output_tokens: i64,
    /// The branch this agent was based on (for display, may be updated by rebases)
    pub base_branch: Option<String>,
    /// Total lines added by this agent (computed from git diff)
    #[serde(default)]
    pub total_additions: i32,
    /// Total lines deleted by this agent (computed from git diff)
    #[serde(default)]
    pub total_deletions: i32,
    #[serde(skip)]
    pub pid: Option<u32>,
    /// The workspace this agent belongs to
    pub workspace_id: Option<String>,
}

impl Agent {
    /// Create a new agent with AI-generated or provided metadata
    pub fn new_with_metadata(
        repository_path: String,
        prompt: String,
        name: String,
        description: String,
        branch: String,
        metadata_loading: bool,
        base_branch: Option<String>,
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
            status: AgentStatus::Idle,
            prompt,
            created_at: chrono::Utc::now().to_rfc3339(),
            pr_url: None,
            metadata_loading,
            auto_accept_edits: false,
            pinned: false,
            total_cost_usd: 0.0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            base_branch,
            total_additions: 0,
            total_deletions: 0,
            pid: None,
            workspace_id: None,
        }
    }

    /// Create a new agent with a quick temporary name (for instant UI feedback)
    /// Metadata will be loaded in the background
    pub fn new_with_temp_name(repository_path: String, prompt: String, base_branch: Option<String>) -> Self {
        // Generate a human-readable temporary branch name
        let temp_id = human_ids::generate(None);
        let branch = format!("agent/{}", temp_id);

        Self::new_with_metadata(
            repository_path,
            prompt,
            "Loading...".to_string(),
            String::new(),
            branch,
            true, // metadata is loading
            base_branch,
        )
    }

    /// Create a new agent with a custom branch name
    /// Name/description metadata will be loaded in the background
    pub fn new_with_custom_branch(repository_path: String, prompt: String, branch_name: String, base_branch: Option<String>) -> Self {
        // Ensure branch name has proper format
        let branch = if branch_name.contains('/') {
            branch_name
        } else {
            format!("agent/{}", branch_name)
        };

        Self::new_with_metadata(
            repository_path,
            prompt,
            "Loading...".to_string(),
            String::new(),
            branch,
            true, // metadata is loading
            base_branch,
        )
    }

    /// Create a new agent with auto-generated metadata (fallback)
    pub fn new(repository_path: String, prompt: String, base_branch: Option<String>) -> Self {
        // Auto-generate agent name and description from prompt
        let name = Self::generate_name_from_prompt(&prompt);
        let description = Self::generate_description_from_prompt(&prompt);
        let branch = format!("agent/{}", slug::slugify(&name));

        Self::new_with_metadata(repository_path, prompt, name, description, branch, false, base_branch)
    }

    /// Generate a concise agent name from the prompt
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
            "New agent".to_string()
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
pub struct SpawnAgentInput {
    pub repository_path: String,
    pub prompt: String,
    /// Optional: use an existing branch instead of creating a new one
    pub existing_branch: Option<String>,
    /// Optional: base branch to create the new branch from (defaults to main/master)
    pub base_branch: Option<String>,
    /// Optional: custom branch name for new branches (if not provided, auto-generated)
    pub branch_name: Option<String>,
    /// Required: workspace ID to associate the agent with
    pub workspace_id: String,
}
