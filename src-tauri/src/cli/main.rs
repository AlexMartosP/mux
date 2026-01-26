use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::process;

const IPC_PORT: u16 = 19532;

#[derive(Parser)]
#[command(name = "mux")]
#[command(about = "CLI for managing Mux tasks", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all tasks
    List,
    /// Get status of a task
    Status {
        /// Task ID or name (partial match)
        task: String,
    },
    /// Take manual control of a task
    Takeover {
        /// Task ID or name (partial match)
        task: String,
    },
    /// Hand control back to Claude
    Handback {
        /// Task ID or name (partial match)
        task: String,
        /// Optional prompt for Claude when resuming
        #[arg(short, long)]
        prompt: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
enum IPCCommand {
    #[serde(rename = "list")]
    List,
    #[serde(rename = "status")]
    Status { task_id: String },
    #[serde(rename = "takeover")]
    Takeover { task_id: String },
    #[serde(rename = "handback")]
    Handback {
        task_id: String,
        prompt: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
struct IPCResponse {
    success: bool,
    message: Option<String>,
    data: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct TaskInfo {
    id: String,
    name: String,
    status: String,
    worktree_path: String,
    branch: String,
    repository: String,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::List => handle_list(),
        Commands::Status { task } => handle_status(&task),
        Commands::Takeover { task } => handle_takeover(&task),
        Commands::Handback { task, prompt } => handle_handback(&task, prompt),
    }
}

fn send_command(command: IPCCommand) -> Result<IPCResponse, String> {
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", IPC_PORT))
        .map_err(|e| format!("Failed to connect to Agent Coordinator. Is the app running?\nError: {}", e))?;

    let json = serde_json::to_string(&command)
        .map_err(|e| format!("Failed to serialize command: {}", e))?;

    stream.write_all(json.as_bytes())
        .map_err(|e| format!("Failed to send command: {}", e))?;
    stream.write_all(b"\n")
        .map_err(|e| format!("Failed to send newline: {}", e))?;
    stream.flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    let mut reader = BufReader::new(stream);
    let mut response_line = String::new();
    reader.read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response: {}", e))?;

    serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {}", e))
}

fn find_task_id(task_query: &str) -> Result<String, String> {
    // First, try to get the task by ID directly
    let response = send_command(IPCCommand::Status { task_id: task_query.to_string() });

    if let Ok(resp) = response {
        if resp.success {
            return Ok(task_query.to_string());
        }
    }

    // Otherwise, search in the list
    let response = send_command(IPCCommand::List)?;

    if !response.success {
        return Err(response.message.unwrap_or_else(|| "Failed to list tasks".to_string()));
    }

    let tasks: Vec<TaskInfo> = response.data
        .ok_or("No data in response")?
        .as_array()
        .ok_or("Response data is not an array")?
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();

    // Find matching task by ID prefix or name containing the query
    let query_lower = task_query.to_lowercase();
    let matches: Vec<&TaskInfo> = tasks.iter()
        .filter(|t| {
            t.id.to_lowercase().starts_with(&query_lower) ||
            t.name.to_lowercase().contains(&query_lower)
        })
        .collect();

    match matches.len() {
        0 => Err(format!("No task found matching '{}'", task_query)),
        1 => Ok(matches[0].id.clone()),
        _ => {
            let mut msg = format!("Multiple tasks match '{}'. Please be more specific:\n", task_query);
            for t in matches {
                msg.push_str(&format!("  - {} ({}): {}\n", t.name, t.id, t.status));
            }
            Err(msg)
        }
    }
}

fn handle_list() {
    match send_command(IPCCommand::List) {
        Ok(response) => {
            if response.success {
                if let Some(data) = response.data {
                    if let Some(tasks) = data.as_array() {
                        if tasks.is_empty() {
                            println!("No tasks found.");
                            return;
                        }

                        println!("{:<36}  {:<20}  {:<15}  {}", "ID", "NAME", "STATUS", "BRANCH");
                        println!("{}", "-".repeat(100));

                        for task in tasks {
                            if let Ok(t) = serde_json::from_value::<TaskInfo>(task.clone()) {
                                let name = if t.name.len() > 20 {
                                    format!("{}...", &t.name[..17])
                                } else {
                                    t.name
                                };
                                println!("{:<36}  {:<20}  {:<15}  {}", t.id, name, t.status, t.branch);
                            }
                        }
                    }
                }
            } else {
                eprintln!("Error: {}", response.message.unwrap_or_else(|| "Unknown error".to_string()));
                process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    }
}

fn handle_status(task: &str) {
    let task_id = match find_task_id(task) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    };

    match send_command(IPCCommand::Status { task_id }) {
        Ok(response) => {
            if response.success {
                if let Some(data) = response.data {
                    if let Ok(t) = serde_json::from_value::<TaskInfo>(data) {
                        println!("Task: {}", t.name);
                        println!("ID: {}", t.id);
                        println!("Status: {}", t.status);
                        println!("Branch: {}", t.branch);
                        println!("Repository: {}", t.repository);
                        println!("Worktree: {}", t.worktree_path);
                    }
                }
            } else {
                eprintln!("Error: {}", response.message.unwrap_or_else(|| "Unknown error".to_string()));
                process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    }
}

fn handle_takeover(task: &str) {
    let task_id = match find_task_id(task) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    };

    match send_command(IPCCommand::Takeover { task_id }) {
        Ok(response) => {
            if response.success {
                if let Some(data) = response.data {
                    if let Some(msg) = data.get("message").and_then(|v| v.as_str()) {
                        println!("{}", msg);
                    }
                    if let Some(path) = data.get("worktree_path").and_then(|v| v.as_str()) {
                        println!("\nWorktree path: {}", path);
                    }
                    if let Some(hint) = data.get("hint").and_then(|v| v.as_str()) {
                        println!("\nTo start working:");
                        println!("  {}", hint);
                    }
                }
                if let Some(msg) = response.message {
                    println!("{}", msg);
                }
            } else {
                eprintln!("Error: {}", response.message.unwrap_or_else(|| "Unknown error".to_string()));
                process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    }
}

fn handle_handback(task: &str, prompt: Option<String>) {
    let task_id = match find_task_id(task) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    };

    match send_command(IPCCommand::Handback { task_id, prompt }) {
        Ok(response) => {
            if response.success {
                println!("{}", response.message.unwrap_or_else(|| "Task handed back to Claude".to_string()));
            } else {
                eprintln!("Error: {}", response.message.unwrap_or_else(|| "Unknown error".to_string()));
                process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    }
}
