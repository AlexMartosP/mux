use crate::db::Database;
use crate::error::{AppError, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeneratedTaskInfo {
    pub title: String,
    pub description: String,
    pub branch_name: String,
    pub ticket_id: Option<String>,
}

/// Extract ticket ID from prompt (e.g., "Work on task ABC-123" -> "ABC-123")
fn extract_ticket_id(prompt: &str) -> Option<String> {
    // Match common ticket patterns: ABC-123, PROJ-456, etc.
    let ticket_regex = Regex::new(r"(?i)(?:task|ticket|issue|jira|story)\s+([A-Z]+-\d+)").ok()?;

    if let Some(caps) = ticket_regex.captures(prompt) {
        return caps.get(1).map(|m| m.as_str().to_uppercase());
    }

    // Also try to match standalone ticket IDs
    let standalone_regex = Regex::new(r"\b([A-Z]{2,10}-\d+)\b").ok()?;
    standalone_regex.captures(prompt).and_then(|caps| {
        caps.get(1).map(|m| m.as_str().to_uppercase())
    })
}

/// Generate a safe branch name segment (alphanumeric and hyphens only)
fn sanitize_branch_segment(s: &str) -> String {
    let sanitized: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect();

    // Remove consecutive hyphens and trim
    let mut result = String::new();
    let mut prev_hyphen = false;
    for c in sanitized.chars() {
        if c == '-' {
            if !prev_hyphen && !result.is_empty() {
                result.push(c);
                prev_hyphen = true;
            }
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }
    result.trim_end_matches('-').to_string()
}

/// Build the full branch name with format: <prefix>/<ticket>/<generated>
/// Uses forward slash as separator (standard git convention)
fn build_branch_name(
    prefix: Option<&str>,
    ticket_id: Option<&str>,
    generated_name: &str,
) -> String {
    let sanitized_name = sanitize_branch_segment(generated_name);
    let mut parts = Vec::new();

    if let Some(p) = prefix {
        if !p.is_empty() {
            parts.push(sanitize_branch_segment(p));
        }
    }

    if let Some(t) = ticket_id {
        parts.push(t.to_lowercase());
    }

    parts.push(sanitized_name);

    // Use forward slash - it's the standard git branch separator
    // The worktree path will convert slashes to hyphens
    parts.join("/")
}

/// Check if a branch exists in the repository
fn branch_exists(repo_path: &str, branch_name: &str) -> bool {
    Command::new("git")
        .args(["rev-parse", "--verify", &format!("refs/heads/{}", branch_name)])
        .current_dir(repo_path)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// Get a unique branch name by appending integers if needed
fn get_unique_branch_name(repo_path: &str, base_name: &str) -> String {
    if !branch_exists(repo_path, base_name) {
        return base_name.to_string();
    }

    for i in 2..100 {
        let candidate = format!("{}-{}", base_name, i);
        if !branch_exists(repo_path, &candidate) {
            return candidate;
        }
    }

    // Fallback with timestamp
    format!("{}-{}", base_name, chrono::Utc::now().timestamp())
}

/// Generate task info using Claude
pub fn generate_task_info(
    db: &Arc<Database>,
    prompt: &str,
    repo_path: &str,
) -> Result<GeneratedTaskInfo> {
    // Get settings
    let branch_prefix = db.get_setting("branch_prefix").ok().flatten();

    // Extract ticket ID from prompt
    let ticket_id = extract_ticket_id(prompt);

    // Build the prompt for Claude to generate title, description, and branch name
    let generation_prompt = format!(
        r#"You are a helpful assistant that generates concise task metadata.

Given this task prompt:
"{}"

Generate a JSON response with exactly this format (no markdown, just JSON):
{{
  "title": "A short title (max 50 chars)",
  "description": "A one-line description of what the task will accomplish (max 100 chars)",
  "branch_name": "a-short-kebab-case-name"
}}

Rules:
- Title should be concise and descriptive
- Description should explain the goal
- Branch name should be 2-4 words in kebab-case, no special characters
- Do not include ticket IDs in the branch name (they are handled separately)
- Output ONLY the JSON, nothing else"#,
        prompt.replace('"', "\\\"")
    );

    // Run Claude to generate the info
    let output = Command::new("claude")
        .args(["-p", &generation_prompt, "--output-format", "text"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| AppError::Process(format!("Failed to run claude for generation: {}", e)))?;

    if !output.status.success() {
        // Fall back to basic generation
        return Ok(generate_fallback_info(prompt, &branch_prefix, ticket_id.as_deref(), repo_path));
    }

    let response = String::from_utf8_lossy(&output.stdout);

    // Try to parse the JSON response
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&response.trim()) {
        let title = parsed["title"]
            .as_str()
            .unwrap_or("New Task")
            .to_string();
        let description = parsed["description"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let generated_branch = parsed["branch_name"]
            .as_str()
            .unwrap_or("task")
            .to_string();

        // Build the full branch name
        let branch_base = build_branch_name(
            branch_prefix.as_deref(),
            ticket_id.as_deref(),
            &generated_branch,
        );
        let branch_name = get_unique_branch_name(repo_path, &branch_base);

        return Ok(GeneratedTaskInfo {
            title,
            description,
            branch_name,
            ticket_id,
        });
    }

    // Fall back if parsing fails
    Ok(generate_fallback_info(prompt, &branch_prefix, ticket_id.as_deref(), repo_path))
}

/// Generate fallback info without Claude
fn generate_fallback_info(
    prompt: &str,
    branch_prefix: &Option<String>,
    ticket_id: Option<&str>,
    repo_path: &str,
) -> GeneratedTaskInfo {
    // Generate title from first 50 chars of prompt
    let title = prompt
        .chars()
        .take(50)
        .collect::<String>()
        .trim()
        .to_string();

    // Generate description from first 100 chars
    let description = prompt
        .chars()
        .take(100)
        .collect::<String>()
        .trim()
        .to_string();

    // Generate branch name from first few words
    let words: Vec<&str> = prompt.split_whitespace().take(4).collect();
    let generated_name = words.join("-");

    let branch_base = build_branch_name(
        branch_prefix.as_deref(),
        ticket_id,
        &generated_name,
    );
    let branch_name = get_unique_branch_name(repo_path, &branch_base);

    GeneratedTaskInfo {
        title,
        description,
        branch_name,
        ticket_id: ticket_id.map(|s| s.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_ticket_id() {
        assert_eq!(extract_ticket_id("Work on task ABC-123"), Some("ABC-123".to_string()));
        assert_eq!(extract_ticket_id("Fix JIRA-456 bug"), Some("JIRA-456".to_string()));
        assert_eq!(extract_ticket_id("No ticket here"), None);
    }

    #[test]
    fn test_sanitize_branch_segment() {
        assert_eq!(sanitize_branch_segment("Hello World!"), "hello-world");
        assert_eq!(sanitize_branch_segment("  foo  bar  "), "foo-bar");
    }

    #[test]
    fn test_build_branch_name() {
        assert_eq!(
            build_branch_name(Some("john"), Some("ABC-123"), "fix-bug"),
            "john/abc-123/fix-bug"
        );
        assert_eq!(
            build_branch_name(None, Some("ABC-123"), "fix-bug"),
            "abc-123/fix-bug"
        );
        assert_eq!(
            build_branch_name(Some("john"), None, "fix-bug"),
            "john/fix-bug"
        );
    }
}
