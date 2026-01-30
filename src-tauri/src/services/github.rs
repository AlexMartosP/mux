use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub url: String,
    pub number: i32,
    pub title: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PRCreateInput {
    pub title: String,
    pub body: String,
    pub base: Option<String>,
    pub draft: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PRPreview {
    pub title: String,
    pub body: String,
    pub base_branch: String,
    pub head_branch: String,
    pub commits: Vec<CommitSummary>,
    pub has_existing_pr: bool,
    pub existing_pr_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitSummary {
    pub short_hash: String,
    pub message: String,
}

pub struct GitHubService;

impl GitHubService {
    /// Check if gh CLI is authenticated
    pub fn check_auth() -> Result<bool> {
        let output = Command::new("gh")
            .args(["auth", "status"])
            .output()
            .map_err(|e| AppError::GitHub(format!("Failed to run gh: {}", e)))?;

        Ok(output.status.success())
    }

    /// Get PR preview data (title, body suggestion, existing PR check)
    pub fn get_pr_preview(worktree_path: &str, task_prompt: &str) -> Result<PRPreview> {
        // Get current branch
        let head_branch = Self::get_current_branch(worktree_path)?;

        // Get base branch
        let base_branch = Self::get_default_branch(worktree_path)?;

        // Get commits for this branch
        let commits = Self::get_branch_commits(worktree_path, &base_branch)?;

        // Generate title from branch name
        let title = Self::generate_title_from_branch(&head_branch);

        // Generate body from prompt and commits
        let body = Self::generate_pr_body(task_prompt, &commits);

        // Check for existing PR
        let (has_existing_pr, existing_pr_url) = Self::check_existing_pr(worktree_path, &head_branch)?;

        Ok(PRPreview {
            title,
            body,
            base_branch,
            head_branch,
            commits,
            has_existing_pr,
            existing_pr_url,
        })
    }

    /// Create a pull request
    /// If new_branch_name is provided, renames the branch before pushing
    /// Returns (PullRequest, Option<new_branch_name>) - new_branch_name is set if branch was renamed
    pub fn create_pr(
        worktree_path: &str,
        input: PRCreateInput,
        new_branch_name: Option<&str>,
    ) -> Result<(PullRequest, Option<String>)> {
        // First, push the branch (may rename if new_branch_name is provided)
        let renamed_branch = Self::push_branch(worktree_path, new_branch_name).map_err(|e| {
            AppError::GitHub(format!("Failed to push branch: {}", e))
        })?;

        if let Some(ref new_name) = renamed_branch {
            eprintln!("Branch was renamed to '{}' before push", new_name);
        }

        // Build gh pr create command
        let mut args = vec![
            "pr".to_string(),
            "create".to_string(),
            "--title".to_string(),
            input.title.clone(),
            "--body".to_string(),
            input.body.clone(),
        ];

        if let Some(base) = &input.base {
            args.push("--base".to_string());
            args.push(base.clone());
        }

        if input.draft {
            args.push("--draft".to_string());
        }

        eprintln!("Creating PR in worktree: {}", worktree_path);
        eprintln!("PR args: {:?}", args);

        let output = Command::new("gh")
            .args(&args)
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::GitHub(format!("Failed to run gh pr create: {}", e)))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        eprintln!("gh pr create stdout: {}", stdout);
        eprintln!("gh pr create stderr: {}", stderr);

        if !output.status.success() {
            return Err(AppError::GitHub(format!(
                "Failed to create PR: {}. Stdout: {}",
                stderr.trim(),
                stdout.trim()
            )));
        }

        // Parse the PR URL from stdout
        let url = stdout.trim().to_string();

        if url.is_empty() {
            return Err(AppError::GitHub(
                "PR created but no URL returned. Check stderr for details.".to_string(),
            ));
        }

        // Get PR details
        let pr = Self::get_pr_by_url(worktree_path, &url)?;
        Ok((pr, renamed_branch))
    }

    /// Open PR in browser
    pub fn open_pr_in_browser(url: &str) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg(url)
                .spawn()
                .map_err(|e| AppError::GitHub(format!("Failed to open browser: {}", e)))?;
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open")
                .arg(url)
                .spawn()
                .map_err(|e| AppError::GitHub(format!("Failed to open browser: {}", e)))?;
        }

        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .args(["/c", "start", url])
                .spawn()
                .map_err(|e| AppError::GitHub(format!("Failed to open browser: {}", e)))?;
        }

        Ok(())
    }

    /// Get current branch name
    fn get_current_branch(worktree_path: &str) -> Result<String> {
        let output = Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to get current branch: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git("Failed to get current branch".to_string()));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Get default branch (main or master)
    fn get_default_branch(worktree_path: &str) -> Result<String> {
        // Try to get from remote HEAD
        let output = Command::new("git")
            .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
            .current_dir(worktree_path)
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                let branch = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .replace("refs/remotes/origin/", "");
                if !branch.is_empty() {
                    return Ok(branch);
                }
            }
        }

        // Fallback to checking if main or master exists
        let output = Command::new("git")
            .args(["branch", "-r"])
            .current_dir(worktree_path)
            .output();

        if let Ok(output) = output {
            let branches = String::from_utf8_lossy(&output.stdout);
            if branches.contains("origin/main") {
                return Ok("main".to_string());
            } else if branches.contains("origin/master") {
                return Ok("master".to_string());
            }
        }

        Ok("main".to_string())
    }

    /// Get commits on this branch since diverging from base
    fn get_branch_commits(worktree_path: &str, base_branch: &str) -> Result<Vec<CommitSummary>> {
        let output = Command::new("git")
            .args([
                "log",
                &format!("origin/{}..HEAD", base_branch),
                "--pretty=format:%h|%s",
                "-20",
            ])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to get commits: {}", e)))?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let commits: Vec<CommitSummary> = stdout
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.splitn(2, '|').collect();
                if parts.len() == 2 {
                    Some(CommitSummary {
                        short_hash: parts[0].to_string(),
                        message: parts[1].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(commits)
    }

    /// Check if a PR already exists for this branch
    fn check_existing_pr(worktree_path: &str, head_branch: &str) -> Result<(bool, Option<String>)> {
        let output = Command::new("gh")
            .args(["pr", "view", head_branch, "--json", "url", "-q", ".url"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::GitHub(format!("Failed to check existing PR: {}", e)))?;

        if output.status.success() {
            let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !url.is_empty() {
                return Ok((true, Some(url)));
            }
        }

        Ok((false, None))
    }

    /// Check if a branch name contains a human ID (temporary task branch)
    pub fn is_human_id_branch(branch: &str) -> bool {
        // Human ID branches start with "task/" and contain random words
        branch.starts_with("task/")
    }

    /// Push branch to remote
    /// If new_branch_name is provided and different from current, renames before pushing
    /// Returns the new branch name if it was renamed
    fn push_branch(worktree_path: &str, new_branch_name: Option<&str>) -> Result<Option<String>> {
        eprintln!("Pushing branch from worktree: {}", worktree_path);

        // Get current branch name
        let current_branch = Self::get_current_branch(worktree_path)?;
        eprintln!("Current branch: {}", current_branch);

        let mut renamed_to: Option<String> = None;

        // If a new branch name is provided and different, rename the branch
        if let Some(new_name) = new_branch_name {
            if new_name != current_branch {
                eprintln!("Renaming branch from '{}' to '{}'", current_branch, new_name);

                let rename_output = Command::new("git")
                    .args(["branch", "-m", &current_branch, new_name])
                    .current_dir(worktree_path)
                    .output()
                    .map_err(|e| AppError::Git(format!("Failed to rename branch: {}", e)))?;

                if !rename_output.status.success() {
                    let stderr = String::from_utf8_lossy(&rename_output.stderr);
                    return Err(AppError::Git(format!(
                        "Failed to rename branch from '{}' to '{}': {}",
                        current_branch, new_name, stderr.trim()
                    )));
                }

                eprintln!("Branch renamed successfully to '{}'", new_name);
                renamed_to = Some(new_name.to_string());
            }
        }

        // First check if origin remote exists
        let remote_check = Command::new("git")
            .args(["remote", "get-url", "origin"])
            .current_dir(worktree_path)
            .output();

        match remote_check {
            Ok(output) if output.status.success() => {
                let remote_url = String::from_utf8_lossy(&output.stdout);
                eprintln!("Remote origin URL: {}", remote_url.trim());
            }
            _ => {
                return Err(AppError::Git(
                    "No 'origin' remote configured. Please add a remote with: git remote add origin <url>".to_string()
                ));
            }
        }

        let output = Command::new("git")
            .args(["push", "-u", "origin", "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git push: {}", e)))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        eprintln!("git push stdout: {}", stdout);
        eprintln!("git push stderr: {}", stderr);

        if !output.status.success() {
            // Ignore "already up to date" type messages
            if !stderr.contains("Everything up-to-date")
                && !stderr.contains("already exists")
                && !stdout.contains("Everything up-to-date")
            {
                // Provide more helpful error messages
                let error_msg = if stderr.contains("Could not read from remote") {
                    format!(
                        "Cannot connect to remote repository. Check your network connection and SSH keys/credentials. Error: {}",
                        stderr.trim()
                    )
                } else if stderr.contains("Permission denied") {
                    "Permission denied. Make sure you have push access to this repository.".to_string()
                } else if stderr.contains("does not exist") {
                    "Remote repository does not exist. Check the remote URL.".to_string()
                } else {
                    format!("Failed to push: {}", stderr.trim())
                };
                return Err(AppError::Git(error_msg));
            }
        }

        Ok(renamed_to)
    }

    /// Get PR details by URL
    fn get_pr_by_url(worktree_path: &str, url: &str) -> Result<PullRequest> {
        // Extract PR number from URL
        let number = url
            .split('/')
            .last()
            .and_then(|s| s.parse::<i32>().ok())
            .unwrap_or(0);

        let output = Command::new("gh")
            .args(["pr", "view", url, "--json", "title,state,url,number"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::GitHub(format!("Failed to get PR details: {}", e)))?;

        if output.status.success() {
            if let Ok(pr) = serde_json::from_slice::<PullRequest>(&output.stdout) {
                return Ok(pr);
            }
        }

        // Fallback with basic info
        Ok(PullRequest {
            url: url.to_string(),
            number,
            title: "Pull Request".to_string(),
            state: "open".to_string(),
        })
    }

    /// Generate PR title from branch name
    fn generate_title_from_branch(branch: &str) -> String {
        // Remove common prefixes
        let cleaned = branch
            .trim_start_matches("agent/")
            .trim_start_matches("feature/")
            .trim_start_matches("fix/")
            .trim_start_matches("feat/");

        // Convert kebab-case to Title Case
        cleaned
            .split('-')
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Generate PR body from task prompt and commits
    fn generate_pr_body(task_prompt: &str, commits: &[CommitSummary]) -> String {
        let mut body = String::new();

        body.push_str("## Summary\n\n");
        body.push_str(task_prompt);
        body.push_str("\n\n");

        if !commits.is_empty() {
            body.push_str("## Changes\n\n");
            for commit in commits {
                body.push_str(&format!("- {} ({})\n", commit.message, commit.short_hash));
            }
            body.push('\n');
        }

        body.push_str("## Test Plan\n\n");
        body.push_str("- [ ] Manual testing\n");
        body.push_str("- [ ] Automated tests pass\n");

        body
    }
}
