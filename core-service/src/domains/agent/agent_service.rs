use std::collections::HashMap;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::utils::env;
use crate::utils::log;

use crate::domains::agent::agent_db;
use crate::domains::agent::agent_model::{Agent, AgentStatus, CreateAgent, UpdateAgent};
use crate::domains::agent::agent_error::AgentError;
use crate::domains::agent::agent_process;
use crate::domains::agent::agent_stream_parser::{self, ParsedAction};
use crate::domains::agent_step::agent_step_db;
use crate::domains::agent_step::agent_step_model::CreateAgentStep;
use crate::domains::message::message_model::{CreateMessage, MessageRole};
use crate::domains::message::message_service;
use crate::domains::repository::repository_model::Repository;
use crate::domains::websockets::ws_broadcaster;
use crate::domains::websockets::ws_event::AgentEvent;

pub async fn create_agent(input: CreateAgent, repository: Repository) -> Result<Agent, AgentError> {
    let agent = agent_db::create(&input).await.map_err(|_| AgentError::CreationFailed)?;

    let _message = message_service::create_message(&CreateMessage {
        agent_id: agent.id.clone(),
        role: MessageRole::User,
        content: input.initial_message.clone(),
    })
    .await
    .map_err(|_| AgentError::CreationFailed)?;

    let agent_id = agent.id.clone();
    let prompt = input.initial_message.clone();
    let repo = repository.clone();

    tokio::spawn(async move {
        if let Err(e) = run_agent_background(&agent_id, &repo, &prompt).await {
            log::error(&format!("Agent {} background task failed: {}", agent_id, e), None);
            let _ = update_agent_status(&agent_id, AgentStatus::Error).await;
            ws_broadcaster::publish(
                &agent_id,
                AgentEvent::AgentError {
                    agent_id: agent_id.clone(),
                    error: e.to_string(),
                },
            );
        }
    });

    // Re-fetch to return the latest state
    agent_db::get(&agent.id)
        .await
        .map_err(|_| AgentError::CreationFailed)?
        .ok_or(AgentError::CreationFailed)
}

pub async fn send_followup_message(agent_id: &str, content: &str) -> Result<(), AgentError> {
    let agent = agent_db::get(agent_id)
        .await
        .map_err(|_| AgentError::NotFound)?
        .ok_or(AgentError::NotFound)?;

    if agent.status != AgentStatus::Idle.to_string() {
        return Err(AgentError::InvalidState);
    }

    message_service::create_message(&CreateMessage {
        agent_id: agent_id.to_string(),
        role: MessageRole::User,
        content: content.to_string(),
    })
    .await
    .map_err(|_| AgentError::CreationFailed)?;

    update_agent_status(agent_id, AgentStatus::Running).await?;

    // Send the message to Claude's stdin via the process registry
    agent_process::send_message(agent_id, content).await?;

    Ok(())
}

async fn run_agent_background(
    agent_id: &str,
    repository: &Repository,
    prompt: &str,
) -> Result<(), AgentError> {
    let worktree = create_worktree(repository).await?;

    let branch_name = worktree.branch_name.clone();
    agent_db::update(
        agent_id,
        UpdateAgent {
            status: Some(AgentStatus::Running.to_string()),
            worktree_path: Some(worktree.worktree_path.clone()),
            branch: Some(branch_name.clone()),
            name: Some(branch_name),
        },
    )
    .await
    .map_err(|_| AgentError::WorktreeCreationFailed)?;

    ws_broadcaster::publish(
        agent_id,
        AgentEvent::StatusChanged {
            agent_id: agent_id.to_string(),
            status: AgentStatus::Running.to_string(),
        },
    );

    // Spawn Claude in interactive mode (no -p flag) so we can send follow-up messages
    let mut child = Command::new("claude")
        .args(["--output-format", "stream-json", "--dangerously-skip-permissions", "--verbose"])
        .current_dir(&worktree.worktree_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|_| AgentError::CreationFailed)?;

    let mut stdin = child.stdin.take().ok_or(AgentError::CreationFailed)?;
    let stdout = child.stdout.take().ok_or(AgentError::CreationFailed)?;
    let stderr = child.stderr.take().ok_or(AgentError::CreationFailed)?;

    // Write the initial prompt to stdin
    let initial_prompt = format!("{}\n", prompt);
    stdin
        .write_all(initial_prompt.as_bytes())
        .await
        .map_err(|_| AgentError::CreationFailed)?;
    stdin
        .flush()
        .await
        .map_err(|_| AgentError::CreationFailed)?;

    // Set up stdin forwarding channel
    let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(32);
    agent_process::register(agent_id, stdin_tx);

    // Stdin forwarding task
    let stdin_agent_id = agent_id.to_string();
    tokio::spawn(async move {
        while let Some(msg) = stdin_rx.recv().await {
            let line = format!("{}\n", msg);
            if stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
        }
        log::info(&format!("Agent {} stdin forwarder stopped", stdin_agent_id), None);
    });

    // Stderr logging task
    let stderr_agent_id = agent_id.to_string();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            log::warn(&format!("Agent {} stderr: {}", stderr_agent_id, line), None);
        }
    });

    // Main stdout processing
    let agent_id_owned = agent_id.to_string();
    let mut reader = BufReader::new(stdout).lines();
    // Track tool_use_id -> step_id mapping
    let mut tool_step_map: HashMap<String, String> = HashMap::new();

    while let Ok(Some(line)) = reader.next_line().await {
        let action = agent_stream_parser::parse_stream_line(&line);

        match action {
            ParsedAction::CreateAssistantMessage { content } => {
                if let Ok(msg) = message_service::create_message(&CreateMessage {
                    agent_id: agent_id_owned.clone(),
                    role: MessageRole::Assistant,
                    content: content.clone(),
                })
                .await
                {
                    ws_broadcaster::publish(
                        &agent_id_owned,
                        AgentEvent::MessageCreated {
                            agent_id: agent_id_owned.clone(),
                            message_id: msg.id,
                            role: "assistant".to_string(),
                            content,
                        },
                    );
                }
            }
            ParsedAction::CreateToolUseStep {
                tool_use_id,
                tool_name,
                tool_input,
            } => {
                if let Ok(step) = agent_step_db::create(CreateAgentStep {
                    agent_id: agent_id_owned.clone(),
                    parent_step_id: None,
                    step_type: "tool_use".to_string(),
                    title: Some(tool_name.clone()),
                    content: Some(tool_input),
                })
                .await
                {
                    tool_step_map.insert(tool_use_id, step.id.clone());
                    ws_broadcaster::publish(
                        &agent_id_owned,
                        AgentEvent::StepCreated {
                            agent_id: agent_id_owned.clone(),
                            step_id: step.id,
                            step_type: "tool_use".to_string(),
                            title: Some(tool_name),
                            content: step.content,
                        },
                    );
                }
            }
            ParsedAction::CompleteToolStep {
                tool_use_id,
                output,
                is_error,
            } => {
                if let Some(step_id) = tool_step_map.get(&tool_use_id) {
                    let status = if is_error { "error" } else { "completed" };
                    let _ = agent_step_db::update(
                        step_id,
                        crate::domains::agent_step::agent_step_model::UpdateAgentStep {
                            title: None,
                            content: Some(output.clone()),
                            status: Some(status.to_string()),
                        },
                    )
                    .await;
                    ws_broadcaster::publish(
                        &agent_id_owned,
                        AgentEvent::StepUpdated {
                            agent_id: agent_id_owned.clone(),
                            step_id: step_id.clone(),
                            status: status.to_string(),
                            content: Some(output),
                        },
                    );
                }
            }
            ParsedAction::StreamChunk { content } => {
                ws_broadcaster::publish(
                    &agent_id_owned,
                    AgentEvent::StreamChunk {
                        agent_id: agent_id_owned.clone(),
                        content,
                    },
                );
            }
            ParsedAction::AgentFinished => {
                let _ = update_agent_status(&agent_id_owned, AgentStatus::Idle).await;
                ws_broadcaster::publish(
                    &agent_id_owned,
                    AgentEvent::StatusChanged {
                        agent_id: agent_id_owned.clone(),
                        status: AgentStatus::Idle.to_string(),
                    },
                );
            }
            ParsedAction::AgentError { message } => {
                log::error(&format!("Agent {} stream error: {}", agent_id_owned, message), None);
                let _ = update_agent_status(&agent_id_owned, AgentStatus::Error).await;
                ws_broadcaster::publish(
                    &agent_id_owned,
                    AgentEvent::AgentError {
                        agent_id: agent_id_owned.clone(),
                        error: message,
                    },
                );
            }
            ParsedAction::Ignored => {}
        }
    }

    // Process exited — clean up
    let _ = child.wait().await;
    agent_process::remove(&agent_id_owned);

    // If agent was idle when process exited, mark completed
    if let Ok(Some(agent)) = agent_db::get(&agent_id_owned).await {
        if agent.status == AgentStatus::Idle.to_string()
            || agent.status == AgentStatus::Running.to_string()
        {
            let _ = update_agent_status(&agent_id_owned, AgentStatus::Completed).await;
            ws_broadcaster::publish(
                &agent_id_owned,
                AgentEvent::AgentCompleted {
                    agent_id: agent_id_owned.clone(),
                },
            );
        }
    }

    ws_broadcaster::remove_channel(&agent_id_owned);

    Ok(())
}

async fn update_agent_status(agent_id: &str, status: AgentStatus) -> Result<(), AgentError> {
    agent_db::update(
        agent_id,
        UpdateAgent {
            status: Some(status.to_string()),
            ..Default::default()
        },
    )
    .await
    .map_err(|_| AgentError::CreationFailed)?;
    Ok(())
}

struct Worktree {
    worktree_path: String,
    branch_name: String,
}

async fn create_worktree(repository: &Repository) -> Result<Worktree, AgentError> {
    let branch_name = generate_unique_branch_name(repository).await;
    let worktree_path = get_worktree_path(&repository.path, &branch_name);

    Command::new("git")
        .current_dir(&repository.source_path)
        .args(["worktree", "add", &worktree_path, "-b", &branch_name])
        .output()
        .await
        .map_err(|_| AgentError::WorktreeCreationFailed)?;

    Ok(Worktree {
        worktree_path,
        branch_name,
    })
}

async fn generate_unique_branch_name(repository: &Repository) -> String {
    let all_species = get_all_species();
    let all_branch_names = agent_db::get_all_branch_names(&repository.id).await;
    let mut branch_suffix = uuid::Uuid::new_v4().to_string();

    if let Ok(mut all_species) = all_species
        && let Ok(all_branch_names) = all_branch_names
    {
        all_species.retain_mut(|species| !all_branch_names.contains(species));
        if !all_species.is_empty() {
            let random_index = rand::random_range(0..all_species.len());
            let species = all_species.get(random_index);

            if let Some(species) = species {
                branch_suffix = species.to_string();
            }
        }
    }

    format!("{}/{}", repository.branch_prefix, branch_suffix)
}

fn get_all_species() -> Result<Vec<String>, AgentError> {
    let available_species =
        std::fs::read_to_string("bee_species.json").map_err(|_| AgentError::InvalidBranchName)?;
    let species = serde_json::from_str::<Vec<String>>(&available_species)
        .map_err(|_| AgentError::InvalidBranchName)?;
    Ok(species)
}

fn get_worktree_path(repository_path: &str, branch_name: &str) -> String {
    format!(
        "{}/{}/{}",
        env::get_env().folder_name,
        repository_path,
        branch_name
    )
}
