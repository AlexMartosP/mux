use serde_json::Value;

#[derive(Debug)]
pub enum ParsedAction {
    CreateAssistantMessage { content: String },
    CreateToolUseStep { tool_use_id: String, tool_name: String, tool_input: String },
    CompleteToolStep { tool_use_id: String, output: String, is_error: bool },
    AgentFinished,
    AgentError { message: String },
    StreamChunk { content: String },
    Ignored,
}

pub fn parse_stream_line(line: &str) -> ParsedAction {
    let json: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return ParsedAction::Ignored,
    };

    let event_type = json.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match event_type {
        "assistant" => parse_assistant_event(&json),
        "content_block_start" => parse_content_block_start(&json),
        "content_block_delta" => parse_content_block_delta(&json),
        "result" => parse_result_event(&json),
        "tool_result" => parse_tool_result(&json),
        "error" | "system" => {
            let msg = json.get("error")
                .or_else(|| json.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error")
                .to_string();

            if event_type == "error" {
                ParsedAction::AgentError { message: msg }
            } else {
                ParsedAction::Ignored
            }
        }
        _ => ParsedAction::Ignored,
    }
}

fn parse_assistant_event(json: &Value) -> ParsedAction {
    // The "assistant" event contains the full message with content blocks
    let content = json
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| {
                    let block_type = b.get("type")?.as_str()?;
                    if block_type == "text" {
                        b.get("text").and_then(|t| t.as_str()).map(String::from)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    if content.is_empty() {
        ParsedAction::Ignored
    } else {
        ParsedAction::CreateAssistantMessage { content }
    }
}

fn parse_content_block_start(json: &Value) -> ParsedAction {
    let content_block = match json.get("content_block") {
        Some(b) => b,
        None => return ParsedAction::Ignored,
    };

    let block_type = content_block.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match block_type {
        "tool_use" => {
            let tool_use_id = content_block.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let tool_name = content_block.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let tool_input = content_block.get("input").map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());

            ParsedAction::CreateToolUseStep {
                tool_use_id,
                tool_name,
                tool_input,
            }
        }
        "text" => {
            let text = content_block.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if text.is_empty() {
                ParsedAction::Ignored
            } else {
                ParsedAction::StreamChunk { content: text.to_string() }
            }
        }
        _ => ParsedAction::Ignored,
    }
}

fn parse_content_block_delta(json: &Value) -> ParsedAction {
    let delta = match json.get("delta") {
        Some(d) => d,
        None => return ParsedAction::Ignored,
    };

    let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match delta_type {
        "text_delta" => {
            let text = delta.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if text.is_empty() {
                ParsedAction::Ignored
            } else {
                ParsedAction::StreamChunk { content: text.to_string() }
            }
        }
        _ => ParsedAction::Ignored,
    }
}

fn parse_result_event(json: &Value) -> ParsedAction {
    // "result" marks end of a turn — agent is now idle
    let content = json
        .get("result")
        .and_then(|r| r.as_str())
        .or_else(|| json.get("message").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();

    if !content.is_empty() {
        ParsedAction::CreateAssistantMessage { content }
    } else {
        ParsedAction::AgentFinished
    }
}

fn parse_tool_result(json: &Value) -> ParsedAction {
    let tool_use_id = json.get("tool_use_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let output = json.get("output").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let is_error = json.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);

    if tool_use_id.is_empty() {
        return ParsedAction::Ignored;
    }

    ParsedAction::CompleteToolStep {
        tool_use_id,
        output,
        is_error,
    }
}
