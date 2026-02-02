use crate::error::{AppError, Result};
use std::path::Path;
use std::process::Command;

pub struct WorktreeService;

impl WorktreeService {
    /// Create a new git worktree for the given branch
    /// If base_branch is None, uses the default branch (main/master)
    pub fn create_worktree(
        repo_path: &str,
        branch: &str,
        worktree_path: &str,
        base_branch: Option<&str>,
    ) -> Result<()> {
        let repo_path_obj = Path::new(repo_path);

        // Check if repository exists
        if !repo_path_obj.join(".git").exists() && !repo_path_obj.join("../.git").exists() {
            return Err(AppError::RepositoryNotFound(repo_path_obj.display().to_string()));
        }

        // Create worktree parent directory if needed
        let worktree_path_obj = Path::new(worktree_path);
        if let Some(parent) = worktree_path_obj.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Get the base branch (use provided or fall back to default)
        let default_branch = base_branch
            .map(|b| b.to_string())
            .unwrap_or_else(|| Self::get_default_branch(repo_path_obj).unwrap_or_else(|_| "main".to_string()));

        // Check if origin remote exists
        let has_origin = Command::new("git")
            .args(["remote", "get-url", "origin"])
            .current_dir(repo_path_obj)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        // Run git worktree through a shell script that:
        // 1. Sources nvm if available
        // 2. Runs `nvm use` if .nvmrc exists (to get correct node version for hooks)
        // 3. Runs the git worktree command
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let home = std::env::var("HOME").unwrap_or_default();

        // Use origin/branch if remote exists, otherwise use local branch
        let base_ref = if has_origin {
            format!("origin/{}", default_branch)
        } else {
            default_branch.clone()
        };

        let script = format!(
            r#"
            # Source nvm if available
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

            # If .nvmrc exists in the repo, use that node version
            if [ -f "{repo_path}/.nvmrc" ]; then
                nvm use 2>/dev/null || nvm install 2>/dev/null
            fi

            # Run the git worktree command
            git worktree add -B "{branch}" "{worktree_path}" "{base_ref}"
            "#,
            repo_path = repo_path,
            branch = branch,
            worktree_path = worktree_path,
            base_ref = base_ref,
        );

        // Retry with exponential backoff for transient git failures (lock contention, etc.)
        let max_retries = 3;
        let mut last_error = String::new();

        for attempt in 0..=max_retries {
            if attempt > 0 {
                let delay = std::time::Duration::from_millis(500 * (1 << (attempt - 1)));
                eprintln!("Retrying worktree creation (attempt {}/{}), waiting {:?}...", attempt + 1, max_retries + 1, delay);
                std::thread::sleep(delay);
            }

            let output = Command::new(&shell)
                .args(["-l", "-c", &script])
                .current_dir(repo_path_obj)
                .env("HOME", &home)
                .output()?;

            if output.status.success() {
                return Ok(());
            }

            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            last_error = if stderr.is_empty() { stdout.to_string() } else { stderr.to_string() };

            // Only retry on transient errors (lock, network)
            let is_transient = last_error.contains("lock")
                || last_error.contains("Unable to create")
                || last_error.contains("could not lock")
                || last_error.contains("Connection");

            if !is_transient {
                break;
            }
        }

        Err(AppError::Git(format!("Failed to create worktree: {}", last_error)))
    }

    /// Create a worktree from an existing local branch
    pub fn create_worktree_from_branch(
        repo_path: &str,
        branch: &str,
        worktree_path: &str,
    ) -> Result<()> {
        let repo_path_obj = Path::new(repo_path);

        if !repo_path_obj.join(".git").exists() && !repo_path_obj.join("../.git").exists() {
            return Err(AppError::RepositoryNotFound(repo_path_obj.display().to_string()));
        }

        let worktree_path_obj = Path::new(worktree_path);
        if let Some(parent) = worktree_path_obj.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Run git worktree through a shell script that:
        // 1. Sources nvm if available
        // 2. Runs `nvm use` if .nvmrc exists (to get correct node version for hooks)
        // 3. Runs the git worktree command
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let home = std::env::var("HOME").unwrap_or_default();

        let script = format!(
            r#"
            # Source nvm if available
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

            # If .nvmrc exists in the repo, use that node version
            if [ -f "{repo_path}/.nvmrc" ]; then
                nvm use 2>/dev/null || nvm install 2>/dev/null
            fi

            # Run the git worktree command
            git worktree add "{worktree_path}" "{branch}"
            "#,
            repo_path = repo_path,
            worktree_path = worktree_path,
            branch = branch,
        );

        let output = Command::new(&shell)
            .args(["-l", "-c", &script])
            .current_dir(repo_path_obj)
            .env("HOME", &home)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let error = if stderr.is_empty() { stdout.to_string() } else { stderr.to_string() };
            return Err(AppError::Git(format!(
                "Failed to create worktree from branch '{}': {}",
                branch, error
            )));
        }

        Ok(())
    }

    /// Remove a git worktree
    pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<()> {
        let repo_path = Path::new(repo_path);

        // First try to remove the worktree via git
        let output = Command::new("git")
            .args(["worktree", "remove", "--force", worktree_path])
            .current_dir(repo_path)
            .output()?;

        if !output.status.success() {
            // If git command fails, try to clean up manually
            let worktree_path = Path::new(worktree_path);
            if worktree_path.exists() {
                std::fs::remove_dir_all(worktree_path)?;
            }

            // Prune worktree references
            Command::new("git")
                .args(["worktree", "prune"])
                .current_dir(repo_path)
                .output()?;
        }

        Ok(())
    }

    /// Rename a branch in a worktree
    /// This renames the local branch from old_name to new_name
    pub fn rename_branch(worktree_path: &str, old_name: &str, new_name: &str) -> Result<()> {
        let worktree_path_obj = Path::new(worktree_path);

        // Skip if names are the same
        if old_name == new_name {
            return Ok(());
        }

        // Run git branch -m to rename
        let output = Command::new("git")
            .args(["branch", "-m", old_name, new_name])
            .current_dir(worktree_path_obj)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Git(format!(
                "Failed to rename branch from '{}' to '{}': {}",
                old_name, new_name, stderr
            )));
        }

        Ok(())
    }

    /// Get the default branch name (main or master)
    fn get_default_branch(repo_path: &Path) -> Result<String> {
        // Try to get from remote HEAD
        let output = Command::new("git")
            .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
            .current_dir(repo_path)
            .output()?;

        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout)
                .trim()
                .replace("refs/remotes/origin/", "");
            if !branch.is_empty() {
                return Ok(branch);
            }
        }

        // Try remote show origin
        let output = Command::new("git")
            .args(["remote", "show", "origin"])
            .current_dir(repo_path)
            .output()?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("HEAD branch:") {
                    if let Some(branch) = line.split(':').nth(1) {
                        return Ok(branch.trim().to_string());
                    }
                }
            }
        }

        // Default to main
        Ok("main".to_string())
    }
}
