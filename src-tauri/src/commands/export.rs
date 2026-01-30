use crate::commands::agent::AppState;
use crate::db::OutputLine;
use crate::error::Result;
use crate::models::Agent;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    /// Export format: "json", "csv", or "markdown"
    pub format: String,
    /// Agent IDs to export (empty = all agents)
    pub agent_ids: Vec<String>,
    /// Include full output for each agent
    pub include_output: bool,
}

#[derive(Debug, Serialize)]
pub struct AgentExport {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repository_path: String,
    pub branch: String,
    pub status: String,
    pub prompt: String,
    pub created_at: String,
    pub pr_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Vec<OutputLine>>,
}

impl From<Agent> for AgentExport {
    fn from(agent: Agent) -> Self {
        Self {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            repository_path: agent.repository_path,
            branch: agent.branch,
            status: agent.status.as_str().to_string(),
            prompt: agent.prompt,
            created_at: agent.created_at,
            pr_url: agent.pr_url,
            output: None,
        }
    }
}

/// Export agents to the specified format
#[tauri::command]
pub fn export_agents(
    state: State<Arc<AppState>>,
    options: ExportOptions,
) -> Result<String> {
    // Get agents to export
    let all_agents = state.db.get_all_agents()?;
    let agents: Vec<Agent> = if options.agent_ids.is_empty() {
        all_agents
    } else {
        all_agents
            .into_iter()
            .filter(|a| options.agent_ids.contains(&a.id))
            .collect()
    };

    // Convert to export format with optional output
    let mut exports: Vec<AgentExport> = agents.into_iter().map(AgentExport::from).collect();

    // Include output if requested
    if options.include_output {
        for export in &mut exports {
            if let Ok(output) = state.db.get_agent_output(&export.id, None, None) {
                export.output = Some(output);
            }
        }
    }

    // Format output
    match options.format.as_str() {
        "json" => export_json(&exports),
        "csv" => export_csv(&exports),
        "markdown" => export_markdown(&exports),
        _ => export_json(&exports), // Default to JSON
    }
}

fn export_json(exports: &[AgentExport]) -> Result<String> {
    let json = serde_json::to_string_pretty(exports)?;
    Ok(json)
}

fn export_csv(exports: &[AgentExport]) -> Result<String> {
    let mut csv = String::new();

    // Header
    csv.push_str("id,name,description,repository,branch,status,created_at,pr_url\n");

    // Rows
    for agent in exports {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            escape_csv(&agent.id),
            escape_csv(&agent.name),
            escape_csv(&agent.description),
            escape_csv(&agent.repository_path),
            escape_csv(&agent.branch),
            escape_csv(&agent.status),
            escape_csv(&agent.created_at),
            escape_csv(&agent.pr_url.as_deref().unwrap_or("")),
        ));
    }

    Ok(csv)
}

fn escape_csv(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn export_markdown(exports: &[AgentExport]) -> Result<String> {
    let mut md = String::new();

    md.push_str("# Agent Export Report\n\n");
    md.push_str(&format!("*Generated: {}*\n\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    md.push_str(&format!("**Total Agents:** {}\n\n", exports.len()));
    md.push_str("---\n\n");

    for agent in exports {
        md.push_str(&format!("## {}\n\n", agent.name));
        md.push_str(&format!("- **ID:** `{}`\n", agent.id));
        md.push_str(&format!("- **Status:** {}\n", agent.status));
        md.push_str(&format!("- **Repository:** `{}`\n", agent.repository_path));
        md.push_str(&format!("- **Branch:** `{}`\n", agent.branch));
        md.push_str(&format!("- **Created:** {}\n", agent.created_at));

        if let Some(pr_url) = &agent.pr_url {
            md.push_str(&format!("- **PR:** [{}]({})\n", pr_url, pr_url));
        }

        if !agent.description.is_empty() {
            md.push_str(&format!("\n### Description\n\n{}\n", agent.description));
        }

        md.push_str(&format!("\n### Prompt\n\n```\n{}\n```\n", agent.prompt));

        if let Some(output) = &agent.output {
            md.push_str("\n### Output\n\n");
            for line in output {
                match line.output_type.as_str() {
                    "text" => md.push_str(&format!("{}\n", line.content)),
                    "tool" => md.push_str(&format!("**[Tool]** {}\n", line.content)),
                    "result" => md.push_str(&format!("> {}\n", line.content)),
                    "thinking" => md.push_str(&format!("*Thinking: {}*\n",
                        if line.content.len() > 100 {
                            format!("{}...", &line.content[..100])
                        } else {
                            line.content.clone()
                        }
                    )),
                    _ => md.push_str(&format!("{}\n", line.content)),
                }
            }
        }

        md.push_str("\n---\n\n");
    }

    Ok(md)
}
