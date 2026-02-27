use std::collections::VecDeque;
use std::sync::LazyLock;

use tracing::warn;

use crate::models::ChatMessage;

use super::types::epoch_millis;

const MAX_DEBUG_PAYLOADS: usize = 50;

static DEBUG_PAYLOADS: LazyLock<std::sync::Mutex<VecDeque<(String, serde_json::Value)>>> =
    LazyLock::new(|| {
        let mut buf = VecDeque::new();
        let path = payloads_path();
        if let Ok(contents) = std::fs::read_to_string(&path) {
            for line in contents.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
                        buf.push_back((id.to_string(), v));
                    }
                }
            }
            while buf.len() > MAX_DEBUG_PAYLOADS {
                buf.pop_front();
            }
        }
        std::sync::Mutex::new(buf)
    });

fn payloads_path() -> std::path::PathBuf {
    crate::pinchy_home().join("debug_payloads.jsonl")
}

pub fn get_debug_payload(id: &str) -> Option<serde_json::Value> {
    let store = DEBUG_PAYLOADS.lock().ok()?;
    store.iter().find(|(k, _)| k == id).map(|(_, v)| v.clone())
}

pub fn list_debug_payloads() -> Vec<serde_json::Value> {
    let store = DEBUG_PAYLOADS.lock().unwrap_or_else(|e| e.into_inner());
    store
        .iter()
        .rev()
        .map(|(id, v)| {
            serde_json::json!({
                "type": "model_request",
                "request_id": id,
                "id": id,
                "agent": v.get("agent"),
                "session": v.get("session"),
                "timestamp": v.get("timestamp"),
                "message_count": v.get("message_count"),
                "function_count": v.get("function_count"),
                "estimated_tokens": v.get("estimated_tokens"),
                "function_names": v.get("function_names"),
                "provider": v.get("provider"),
                "model": v.get("model"),
            })
        })
        .collect()
}

pub fn emit_model_request_debug(
    agent_id: &str,
    session: Option<&str>,
    messages: &[ChatMessage],
    function_defs: &[serde_json::Value],
    provider: &str,
    model: &str,
) {
    warn!(
        agent = agent_id,
        provider = provider,
        model = model,
        msgs = messages.len(),
        fns = function_defs.len(),
        "emit_model_request_debug: broadcasting model_request event"
    );
    let request_id = format!("dbg_{}", super::types::epoch_nanos());

    let api_messages = crate::models::serialize_messages(messages);
    let fn_names: Vec<&str> = function_defs
        .iter()
        .filter_map(|f| f.get("name").and_then(|n| n.as_str()))
        .collect();
    let total_tokens = crate::context::estimate_total(messages);
    let ts = epoch_millis();

    let full_payload = serde_json::json!({
        "id": request_id,
        "type": "model_request",
        "agent": agent_id,
        "session": session,
        "timestamp": ts,
        "message_count": messages.len(),
        "function_count": function_defs.len(),
        "estimated_tokens": total_tokens,
        "function_names": fn_names,
        "functions": function_defs,
        "messages": api_messages,
        "provider": provider,
        "model": model,
    });

    if let Ok(mut store) = DEBUG_PAYLOADS.lock() {
        if store.len() >= MAX_DEBUG_PAYLOADS {
            store.pop_front();
        }
        store.push_back((request_id.clone(), full_payload.clone()));
    }

    // Persist to disk asynchronously to avoid blocking the executor.
    let line = match serde_json::to_string(&full_payload) {
        Ok(mut l) => {
            l.push('\n');
            l
        }
        Err(_) => return,
    };
    tokio::spawn(async move {
        let path = payloads_path();
        if let Some(parent) = path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        if let Ok(mut f) = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
        {
            use tokio::io::AsyncWriteExt;
            let _ = f.write_all(line.as_bytes()).await;
        }
    });

    crate::gateway::publish_event_json(&serde_json::json!({
        "type": "model_request",
        "agent": agent_id,
        "session": session,
        "timestamp": ts,
        "request_id": request_id,
        "message_count": messages.len(),
        "function_count": function_defs.len(),
        "estimated_tokens": total_tokens,
        "function_names": fn_names,
        "provider": provider,
        "model": model,
    }));
}
