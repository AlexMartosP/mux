use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct SlashCommand {
    pub command: String,
    pub description: String,
    pub source: String, // "builtin", "global", or "project"
    pub has_args: bool,
}

/// Structure for parsing settings.json
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ClaudeSettings {
    /// Custom slash commands defined in settings (command name -> prompt/description)
    #[serde(rename = "slashCommands")]
    slash_commands: Option<HashMap<String, String>>,
}

/// Get all available slash commands for a given repository path
#[tauri::command]
pub fn get_slash_commands(repository_path: Option<String>) -> Vec<SlashCommand> {
    let mut commands = Vec::new();

    // Add built-in Claude Code commands
    commands.extend(get_builtin_commands());

    // Add global custom commands from ~/.claude/
    if let Ok(home) = env::var("HOME") {
        let claude_dir = PathBuf::from(&home).join(".claude");

        // Read from ~/.claude/commands/*.md files (legacy)
        let global_commands_dir = claude_dir.join("commands");
        if let Ok(custom) = read_custom_commands(&global_commands_dir, "global") {
            commands.extend(custom);
        }

        // Read from ~/.claude/skills/*/SKILL.md (new skills format)
        let global_skills_dir = claude_dir.join("skills");
        if let Ok(skills) = read_skills(&global_skills_dir, "global") {
            commands.extend(skills);
        }

        // Read from ~/.claude/settings.json slashCommands
        let global_settings = claude_dir.join("settings.json");
        if let Ok(custom) = read_settings_commands(&global_settings, "global") {
            commands.extend(custom);
        }
    }

    // Add project-level custom commands from <repo>/.claude/
    if let Some(repo_path) = repository_path {
        let project_claude_dir = PathBuf::from(&repo_path).join(".claude");

        // Read from <repo>/.claude/commands/*.md files (legacy)
        let project_commands_dir = project_claude_dir.join("commands");
        if let Ok(custom) = read_custom_commands(&project_commands_dir, "project") {
            commands.extend(custom);
        }

        // Read from <repo>/.claude/skills/*/SKILL.md (new skills format)
        let project_skills_dir = project_claude_dir.join("skills");
        if let Ok(skills) = read_skills(&project_skills_dir, "project") {
            commands.extend(skills);
        }

        // Read from <repo>/.claude/settings.json slashCommands
        let project_settings = project_claude_dir.join("settings.json");
        if let Ok(custom) = read_settings_commands(&project_settings, "project") {
            commands.extend(custom);
        }
    }

    commands
}

fn get_builtin_commands() -> Vec<SlashCommand> {
    vec![
        SlashCommand {
            command: "/bug".to_string(),
            description: "Report a bug in Claude Code".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/clear".to_string(),
            description: "Clear conversation history".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/compact".to_string(),
            description: "Compact conversation to save context".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/config".to_string(),
            description: "Open Claude Code configuration".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/cost".to_string(),
            description: "Show token usage and cost".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/doctor".to_string(),
            description: "Run diagnostics on Claude Code".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/help".to_string(),
            description: "Show help information".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/init".to_string(),
            description: "Initialize Claude Code in current directory".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/login".to_string(),
            description: "Log in to Claude".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/logout".to_string(),
            description: "Log out of Claude".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/mcp".to_string(),
            description: "Manage MCP servers".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/memory".to_string(),
            description: "Manage Claude's memory".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/model".to_string(),
            description: "Switch Claude model".to_string(),
            source: "builtin".to_string(),
            has_args: true,
        },
        SlashCommand {
            command: "/permissions".to_string(),
            description: "Manage tool permissions".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/pr-comments".to_string(),
            description: "Address PR review comments".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/review".to_string(),
            description: "Review code changes".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/status".to_string(),
            description: "Show current status".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/terminal-setup".to_string(),
            description: "Set up terminal integration".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
        SlashCommand {
            command: "/vim".to_string(),
            description: "Toggle vim mode".to_string(),
            source: "builtin".to_string(),
            has_args: false,
        },
    ]
}

/// Read skills from ~/.claude/skills/*/SKILL.md format
fn read_skills(skills_dir: &PathBuf, source: &str) -> Result<Vec<SlashCommand>, std::io::Error> {
    let mut commands = Vec::new();

    if !skills_dir.exists() {
        return Ok(commands);
    }

    for entry in fs::read_dir(skills_dir)? {
        let entry = entry?;
        let path = entry.path();

        // Each skill is a directory containing SKILL.md
        if path.is_dir() {
            let skill_file = path.join("SKILL.md");
            if skill_file.exists() {
                if let Ok(content) = fs::read_to_string(&skill_file) {
                    // Parse frontmatter from SKILL.md
                    if let Some(skill) = parse_skill_frontmatter(&content, source) {
                        commands.push(skill);
                    }
                }
            }
        }
    }

    Ok(commands)
}

/// Parse skill frontmatter from SKILL.md content
/// Format:
/// ---
/// name: skill-name
/// description: Skill description
/// argument-hint: [optional args]
/// ---
fn parse_skill_frontmatter(content: &str, source: &str) -> Option<SlashCommand> {
    // Check if content starts with frontmatter
    if !content.starts_with("---") {
        return None;
    }

    // Find end of frontmatter
    let rest = &content[3..];
    let end_idx = rest.find("---")?;
    let frontmatter = &rest[..end_idx];

    let mut name = None;
    let mut description = None;
    let mut has_args = false;

    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("name:") {
            name = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("description:") {
            description = Some(value.trim().to_string());
        } else if line.starts_with("argument-hint:") {
            has_args = true;
        }
    }

    let name = name?;
    let command = if name.starts_with('/') {
        name
    } else {
        format!("/{}", name)
    };

    Some(SlashCommand {
        command,
        description: description.unwrap_or_else(|| "Custom skill".to_string()),
        source: source.to_string(),
        has_args,
    })
}

/// Read slash commands from a settings.json file
fn read_settings_commands(settings_path: &PathBuf, source: &str) -> Result<Vec<SlashCommand>, std::io::Error> {
    if !settings_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(settings_path)?;
    let settings: ClaudeSettings = serde_json::from_str(&content).unwrap_or_default();

    let mut commands = Vec::new();

    if let Some(slash_commands) = settings.slash_commands {
        for (name, prompt) in slash_commands {
            // Get first line or first 80 chars as description
            let description = prompt
                .lines()
                .next()
                .unwrap_or("")
                .chars()
                .take(80)
                .collect::<String>();

            // Check if command has argument placeholders
            let has_args = prompt.contains("$1") || prompt.contains("$ARGUMENTS");

            // Ensure command starts with /
            let command = if name.starts_with('/') {
                name
            } else {
                format!("/{}", name)
            };

            commands.push(SlashCommand {
                command,
                description: if description.is_empty() {
                    format!("Custom command from settings")
                } else {
                    description
                },
                source: source.to_string(),
                has_args,
            });
        }
    }

    Ok(commands)
}

fn read_custom_commands(dir: &PathBuf, source: &str) -> Result<Vec<SlashCommand>, std::io::Error> {
    let mut commands = Vec::new();

    if !dir.exists() {
        return Ok(commands);
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "md") {
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                let content = fs::read_to_string(&path).unwrap_or_default();

                // Get first line or first 80 chars as description
                let description = content
                    .lines()
                    .next()
                    .unwrap_or("")
                    .chars()
                    .take(80)
                    .collect::<String>();

                // Check if command has argument placeholders ($1, $2, etc.)
                let has_args = content.contains("$1");

                commands.push(SlashCommand {
                    command: format!("/{}", name),
                    description: if description.is_empty() {
                        format!("Custom command: {}", name)
                    } else {
                        description
                    },
                    source: source.to_string(),
                    has_args,
                });
            }
        }
    }

    Ok(commands)
}
