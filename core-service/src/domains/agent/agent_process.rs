use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tokio::sync::mpsc;

use super::agent_error::AgentError;

type ProcessMap = HashMap<String, mpsc::Sender<String>>;

static PROCESSES: OnceLock<Mutex<ProcessMap>> = OnceLock::new();

fn processes() -> &'static Mutex<ProcessMap> {
    PROCESSES.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register(agent_id: &str, sender: mpsc::Sender<String>) {
    let mut map = processes().lock().unwrap();
    map.insert(agent_id.to_string(), sender);
}

pub fn remove(agent_id: &str) {
    let mut map = processes().lock().unwrap();
    map.remove(agent_id);
}

pub async fn send_message(agent_id: &str, message: &str) -> Result<(), AgentError> {
    let sender = {
        let map = processes().lock().unwrap();
        map.get(agent_id).cloned()
    };

    match sender {
        Some(tx) => tx
            .send(message.to_string())
            .await
            .map_err(|_| AgentError::ProcessCommunicationFailed),
        None => Err(AgentError::ProcessNotRunning),
    }
}
