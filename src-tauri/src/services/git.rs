use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub status: FileStatus,
    pub additions: i32,
    pub deletions: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Untracked,
}

impl FileStatus {
    fn from_git_status(s: &str) -> Self {
        match s.chars().next() {
            Some('A') => FileStatus::Added,
            Some('M') => FileStatus::Modified,
            Some('D') => FileStatus::Deleted,
            Some('R') => FileStatus::Renamed,
            Some('C') => FileStatus::Copied,
            Some('?') => FileStatus::Untracked,
            _ => FileStatus::Modified,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

pub struct GitService;

impl GitService {
    /// Get list of changed files in the worktree compared to the base branch
    pub fn get_changed_files(worktree_path: &str, base_branch: &str) -> Result<Vec<FileChange>> {
        // Get the merge base
        let merge_base = Self::get_merge_base(worktree_path, base_branch)?;

        // Get diff stat
        let output = Command::new("git")
            .args(["diff", "--numstat", &merge_base, "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git diff: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git(format!(
                "git diff failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut files: Vec<FileChange> = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                let additions = parts[0].parse().unwrap_or(0);
                let deletions = parts[1].parse().unwrap_or(0);
                let path = parts[2].to_string();

                files.push(FileChange {
                    path,
                    status: FileStatus::Modified, // Will be updated below
                    additions,
                    deletions,
                });
            }
        }

        // Get status to determine file status (added, modified, deleted)
        let status_output = Command::new("git")
            .args(["diff", "--name-status", &merge_base, "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git diff --name-status: {}", e)))?;

        if status_output.status.success() {
            let status_stdout = String::from_utf8_lossy(&status_output.stdout);
            for line in status_stdout.lines() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 2 {
                    let status = FileStatus::from_git_status(parts[0]);
                    let path = parts.last().unwrap().to_string();

                    if let Some(file) = files.iter_mut().find(|f| f.path == path) {
                        file.status = status;
                    }
                }
            }
        }

        // Also check for uncommitted changes
        let uncommitted = Self::get_uncommitted_changes(worktree_path)?;
        for change in uncommitted {
            if !files.iter().any(|f| f.path == change.path) {
                files.push(change);
            }
        }

        Ok(files)
    }

    /// Get uncommitted changes (staged and unstaged)
    fn get_uncommitted_changes(worktree_path: &str) -> Result<Vec<FileChange>> {
        let output = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git status: {}", e)))?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut files: Vec<FileChange> = Vec::new();

        for line in stdout.lines() {
            if line.len() < 4 {
                continue;
            }
            let status_str = &line[0..2];
            let path = line[3..].to_string();

            let status = if status_str.contains('?') {
                FileStatus::Untracked
            } else if status_str.contains('A') {
                FileStatus::Added
            } else if status_str.contains('D') {
                FileStatus::Deleted
            } else if status_str.contains('R') {
                FileStatus::Renamed
            } else {
                FileStatus::Modified
            };

            files.push(FileChange {
                path,
                status,
                additions: 0,
                deletions: 0,
            });
        }

        Ok(files)
    }

    /// Get the diff for a specific file
    pub fn get_file_diff(worktree_path: &str, base_branch: &str, file_path: &str) -> Result<FileDiff> {
        Self::get_file_diff_with_context(worktree_path, base_branch, file_path, 3)
    }

    /// Get the diff for a specific file with custom context lines
    pub fn get_file_diff_with_context(
        worktree_path: &str,
        base_branch: &str,
        file_path: &str,
        context_lines: u32,
    ) -> Result<FileDiff> {
        let merge_base = Self::get_merge_base(worktree_path, base_branch)?;
        let context_arg = format!("-U{}", context_lines);

        let output = Command::new("git")
            .args(["diff", &context_arg, &merge_base, "HEAD", "--", file_path])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git diff: {}", e)))?;

        let diff = String::from_utf8_lossy(&output.stdout).to_string();

        // If no committed diff, check for uncommitted changes
        let diff = if diff.is_empty() {
            let uncommitted = Command::new("git")
                .args(["diff", &context_arg, "HEAD", "--", file_path])
                .current_dir(worktree_path)
                .output()
                .map_err(|e| AppError::Git(format!("Failed to run git diff: {}", e)))?;

            let uncommitted_diff = String::from_utf8_lossy(&uncommitted.stdout).to_string();

            if uncommitted_diff.is_empty() {
                // Check for untracked file
                let content = std::fs::read_to_string(
                    std::path::Path::new(worktree_path).join(file_path)
                ).unwrap_or_default();

                if !content.is_empty() {
                    format!("New file: {}\n\n{}", file_path, content)
                } else {
                    String::new()
                }
            } else {
                uncommitted_diff
            }
        } else {
            diff
        };

        Ok(FileDiff {
            path: file_path.to_string(),
            diff,
        })
    }

    /// Get the full diff of all changes
    pub fn get_full_diff(worktree_path: &str, base_branch: &str) -> Result<String> {
        let merge_base = Self::get_merge_base(worktree_path, base_branch)?;

        let output = Command::new("git")
            .args(["diff", &merge_base, "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git diff: {}", e)))?;

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Get commit history for the branch
    pub fn get_commits(worktree_path: &str, base_branch: &str, limit: Option<i32>) -> Result<Vec<CommitInfo>> {
        let merge_base = Self::get_merge_base(worktree_path, base_branch)?;
        let limit = limit.unwrap_or(50);

        let output = Command::new("git")
            .args([
                "log",
                &format!("{}..HEAD", merge_base),
                &format!("-{}", limit),
                "--pretty=format:%H|%h|%s|%an|%ai",
            ])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git log: {}", e)))?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let commits: Vec<CommitInfo> = stdout
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() >= 5 {
                    Some(CommitInfo {
                        hash: parts[0].to_string(),
                        short_hash: parts[1].to_string(),
                        message: parts[2].to_string(),
                        author: parts[3].to_string(),
                        date: parts[4].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(commits)
    }

    /// Get the merge base between current branch and origin/main (or master)
    fn get_merge_base(worktree_path: &str, base_branch: &str) -> Result<String> {
        // Try to find the merge base
        let output = Command::new("git")
            .args(["merge-base", &format!("origin/{}", base_branch), "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git merge-base: {}", e)))?;

        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }

        // Try without origin/
        let output = Command::new("git")
            .args(["merge-base", base_branch, "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git merge-base: {}", e)))?;

        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }

        // Fallback to first commit
        let output = Command::new("git")
            .args(["rev-list", "--max-parents=0", "HEAD"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to get first commit: {}", e)))?;

        if output.status.success() {
            let first_commit = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            if !first_commit.is_empty() {
                return Ok(first_commit);
            }
        }

        Err(AppError::Git("Could not determine merge base".to_string()))
    }

    /// Get the default branch name (main or master)
    pub fn get_default_branch(repo_path: &str) -> Result<String> {
        let output = Command::new("git")
            .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
            .current_dir(repo_path)
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
            .current_dir(repo_path)
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

    /// Get the current branch name
    pub fn get_current_branch(repo_path: &str) -> Result<String> {
        let output = Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to get current branch: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git(format!(
                "git rev-parse failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Check if there are uncommitted changes
    pub fn has_uncommitted_changes(repo_path: &str) -> Result<bool> {
        let output = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to check git status: {}", e)))?;

        Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
    }

    /// Commit all changes (staged and unstaged)
    pub fn commit_all(repo_path: &str, message: &str) -> Result<String> {
        // Stage all changes
        let output = Command::new("git")
            .args(["add", "-A"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to stage changes: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git(format!(
                "git add failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        // Commit
        let output = Command::new("git")
            .args(["commit", "-m", message])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to commit: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // "nothing to commit" is not an error
            if stderr.contains("nothing to commit") {
                return Ok("No changes to commit".to_string());
            }
            return Err(AppError::Git(format!("git commit failed: {}", stderr)));
        }

        // Get the commit hash
        let hash_output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to get commit hash: {}", e)))?;

        Ok(String::from_utf8_lossy(&hash_output.stdout).trim().to_string())
    }

    /// Stash changes with a message
    pub fn stash_push(repo_path: &str, message: &str) -> Result<bool> {
        // Check if there are changes to stash
        if !Self::has_uncommitted_changes(repo_path)? {
            return Ok(false);
        }

        let output = Command::new("git")
            .args(["stash", "push", "-m", message])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to stash: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git(format!(
                "git stash failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(true)
    }

    /// Pop the latest stash
    pub fn stash_pop(repo_path: &str) -> Result<bool> {
        let output = Command::new("git")
            .args(["stash", "pop"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to pop stash: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // "No stash entries found" is not an error
            if stderr.contains("No stash entries found") {
                return Ok(false);
            }
            return Err(AppError::Git(format!("git stash pop failed: {}", stderr)));
        }

        Ok(true)
    }

    /// Checkout a branch
    pub fn checkout_branch(repo_path: &str, branch: &str) -> Result<()> {
        let output = Command::new("git")
            .args(["checkout", branch])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to checkout branch: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git(format!(
                "git checkout failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(())
    }

    /// Soft reset to a commit (keeps changes staged)
    pub fn soft_reset(repo_path: &str, commit: &str) -> Result<()> {
        let output = Command::new("git")
            .args(["reset", "--soft", commit])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to reset: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git(format!(
                "git reset failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(())
    }

    /// Get the parent commit hash
    pub fn get_parent_commit(repo_path: &str, commit: &str) -> Result<String> {
        let output = Command::new("git")
            .args(["rev-parse", &format!("{}^", commit)])
            .current_dir(repo_path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to get parent commit: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::Git(format!(
                "git rev-parse failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}
