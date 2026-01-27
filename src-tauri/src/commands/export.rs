use crate::commands::task::AppState;
use crate::db::OutputLine;
use crate::error::Result;
use crate::models::Task;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    /// Export format: "json", "csv", or "markdown"
    pub format: String,
    /// Task IDs to export (empty = all tasks)
    pub task_ids: Vec<String>,
    /// Include full output for each task
    pub include_output: bool,
}

#[derive(Debug, Serialize)]
pub struct TaskExport {
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

impl From<Task> for TaskExport {
    fn from(task: Task) -> Self {
        Self {
            id: task.id,
            name: task.name,
            description: task.description,
            repository_path: task.repository_path,
            branch: task.branch,
            status: task.status.as_str().to_string(),
            prompt: task.prompt,
            created_at: task.created_at,
            pr_url: task.pr_url,
            output: None,
        }
    }
}

/// Export tasks to the specified format
#[tauri::command]
pub fn export_tasks(
    state: State<Arc<AppState>>,
    options: ExportOptions,
) -> Result<String> {
    // Get tasks to export
    let all_tasks = state.db.get_all_tasks()?;
    let tasks: Vec<Task> = if options.task_ids.is_empty() {
        all_tasks
    } else {
        all_tasks
            .into_iter()
            .filter(|t| options.task_ids.contains(&t.id))
            .collect()
    };

    // Convert to export format with optional output
    let mut exports: Vec<TaskExport> = tasks.into_iter().map(TaskExport::from).collect();

    // Include output if requested
    if options.include_output {
        for export in &mut exports {
            if let Ok(output) = state.db.get_task_output(&export.id, None, None) {
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

fn export_json(exports: &[TaskExport]) -> Result<String> {
    let json = serde_json::to_string_pretty(exports)?;
    Ok(json)
}

fn export_csv(exports: &[TaskExport]) -> Result<String> {
    let mut csv = String::new();

    // Header
    csv.push_str("id,name,description,repository,branch,status,created_at,pr_url\n");

    // Rows
    for task in exports {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            escape_csv(&task.id),
            escape_csv(&task.name),
            escape_csv(&task.description),
            escape_csv(&task.repository_path),
            escape_csv(&task.branch),
            escape_csv(&task.status),
            escape_csv(&task.created_at),
            escape_csv(&task.pr_url.as_deref().unwrap_or("")),
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

fn export_markdown(exports: &[TaskExport]) -> Result<String> {
    let mut md = String::new();

    md.push_str("# Task Export Report\n\n");
    md.push_str(&format!("*Generated: {}*\n\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    md.push_str(&format!("**Total Tasks:** {}\n\n", exports.len()));
    md.push_str("---\n\n");

    for task in exports {
        md.push_str(&format!("## {}\n\n", task.name));
        md.push_str(&format!("- **ID:** `{}`\n", task.id));
        md.push_str(&format!("- **Status:** {}\n", task.status));
        md.push_str(&format!("- **Repository:** `{}`\n", task.repository_path));
        md.push_str(&format!("- **Branch:** `{}`\n", task.branch));
        md.push_str(&format!("- **Created:** {}\n", task.created_at));

        if let Some(pr_url) = &task.pr_url {
            md.push_str(&format!("- **PR:** [{}]({})\n", pr_url, pr_url));
        }

        if !task.description.is_empty() {
            md.push_str(&format!("\n### Description\n\n{}\n", task.description));
        }

        md.push_str(&format!("\n### Prompt\n\n```\n{}\n```\n", task.prompt));

        if let Some(output) = &task.output {
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
