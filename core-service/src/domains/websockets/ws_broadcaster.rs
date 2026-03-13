use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tokio::sync::broadcast;

use super::ws_event::AgentEvent;

const CHANNEL_CAPACITY: usize = 256;

type ChannelMap = HashMap<String, broadcast::Sender<AgentEvent>>;

static CHANNELS: OnceLock<Mutex<ChannelMap>> = OnceLock::new();

fn channels() -> &'static Mutex<ChannelMap> {
    CHANNELS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn subscribe(agent_id: &str) -> broadcast::Receiver<AgentEvent> {
    let mut map = channels().lock().unwrap();
    let sender = map
        .entry(agent_id.to_string())
        .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0);
    sender.subscribe()
}

pub fn publish(agent_id: &str, event: AgentEvent) {
    let map = channels().lock().unwrap();
    if let Some(sender) = map.get(agent_id) {
        let _ = sender.send(event);
    }
}

pub fn remove_channel(agent_id: &str) {
    let mut map = channels().lock().unwrap();
    map.remove(agent_id);
}
