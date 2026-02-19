use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use tracing::warn;

use super::AppState;
use super::handlers::agents::collect_agent_ids;

/// `GET /ws` — upgrade to WebSocket.
pub(crate) async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

/// `GET /ws/logs` — upgrade to WebSocket for live log streaming.
pub(crate) async fn ws_logs_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_ws_logs)
}

/// Per-connection WebSocket logic for log streaming.
async fn handle_ws_logs(mut socket: WebSocket) {
    let mut rx = match crate::logs::subscribe() {
        Some(rx) => rx,
        None => {
            let _ = socket
                .send(Message::Text(
                    r#"{"type":"error","message":"log broadcast not initialised"}"#.into(),
                ))
                .await;
            return;
        }
    };

    loop {
        tokio::select! {
            Ok(line) = rx.recv() => {
                if socket.send(Message::Text(line)).await.is_err() {
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {} // ignore client messages
                }
            }
        }
    }
}

/// Load all lines from the most recently modified `.jsonl` file in `dir`.
async fn load_most_recent_session_lines(dir: &std::path::Path) -> Option<Vec<String>> {
    let mut rd = tokio::fs::read_dir(dir).await.ok()?;
    let mut best: Option<(std::time::SystemTime, std::path::PathBuf)> = None;

    while let Ok(Some(entry)) = rd.next_entry().await {
        let path = entry.path();
        let is_jsonl = path.extension().map(|e| e == "jsonl").unwrap_or(false);
        if !is_jsonl {
            continue;
        }
        if let Ok(meta) = tokio::fs::metadata(&path).await {
            if let Ok(modified) = meta.modified() {
                if best.as_ref().is_none_or(|(t, _)| modified > *t) {
                    best = Some((modified, path));
                }
            }
        }
    }

    let (_, path) = best?;
    let contents = tokio::fs::read_to_string(&path).await.ok()?;
    let lines: Vec<String> = contents
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.to_string())
        .collect();
    Some(lines)
}

/// Per-connection WebSocket logic.
async fn handle_ws(mut socket: WebSocket, state: AppState) {
    let mut events_rx = state.events_tx.subscribe();

    // ── Send initial agent_list + recent session messages ──────────
    if let Ok(agent_ids) = collect_agent_ids().await {
        let list_event = serde_json::json!({
            "type": "agent_list",
            "agents": agent_ids,
        });
        if let Ok(json) = serde_json::to_string(&list_event) {
            let _ = socket.send(Message::Text(json)).await;
        }

        // For each agent, send the most recent session's messages.
        for agent_id in &agent_ids {
            let sessions_dir = crate::utils::agent_workspace(agent_id)
                .join("sessions");

            if let Some(lines) = load_most_recent_session_lines(&sessions_dir).await {
                for line in lines {
                    let evt = match serde_json::from_str::<serde_json::Value>(&line) {
                        Ok(parsed)
                            if parsed.get("role").and_then(|v| v.as_str()).is_some()
                                && parsed.get("content").is_some() =>
                        {
                            let ts = parsed.get("timestamp").and_then(|v| v.as_u64());
                            serde_json::json!({
                                "type": "session_message",
                                "agent": agent_id,
                                "role": parsed["role"],
                                "content": parsed["content"],
                                "timestamp": ts,
                            })
                        }
                        _ => {
                            // Unparseable or missing role/content — send raw line
                            serde_json::json!({
                                "type": "session_message",
                                "agent": agent_id,
                                "content": line,
                            })
                        }
                    };
                    if let Ok(json) = serde_json::to_string(&evt) {
                        if socket.send(Message::Text(json)).await.is_err() {
                            return; // client disconnected
                        }
                    }
                }
            }
        }
    }

    loop {
        tokio::select! {
            // Broadcast event → send to client
            Ok(event) = events_rx.recv() => {
                if socket.send(Message::Text(event)).await.is_err() {
                    break; // client disconnected
                }
            }
            // Client message → forward to commands channel
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if state.commands_tx.send(text).await.is_err() {
                            warn!("commands channel closed");
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        warn!("ws recv error: {e}");
                        break;
                    }
                    _ => {} // ping/pong/binary — ignore
                }
            }
        }
    }
}
