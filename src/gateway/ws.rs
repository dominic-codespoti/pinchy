use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use tracing::warn;

use super::handlers::agents::collect_agent_ids;
use super::AppState;
use crate::session::SessionStore;

/// `GET /ws` — upgrade to WebSocket.
pub(crate) async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
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
            result = rx.recv() => {
                match result {
                    Ok(line) => {
                        if socket.send(Message::Text(line)).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
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

        // For each agent, send the latest session's messages.
        for agent_id in &agent_ids {
            let workspace = crate::utils::agent_workspace(agent_id);
            let session_id = SessionStore::resolve_latest(&workspace).await;

            if let Some(ref sid) = session_id {
                if let Ok(exchanges) = SessionStore::load_history(&workspace, sid, 200).await {
                    for ex in &exchanges {
                        let evt = serde_json::json!({
                            "type": "session_message",
                            "agent": agent_id,
                            "session": sid,
                            "role": ex.role,
                            "content": ex.content,
                            "timestamp": ex.timestamp,
                        });
                        if let Ok(json) = serde_json::to_string(&evt) {
                            if socket.send(Message::Text(json)).await.is_err() {
                                return; // client disconnected
                            }
                        }
                    }
                }
            }
        }
    }

    // (Debug events are fetched via REST /api/debug/model-requests on
    // dashboard mount — no need to replay them over WS too.)

    // ── Keepalive: ping every 30 s, close if no pong within 10 s ──
    let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(30));
    ping_interval.tick().await; // consume the immediate first tick
    let mut awaiting_pong = false;

    loop {
        tokio::select! {
            // Broadcast event → send to client
            result = events_rx.recv() => {
                match result {
                    Ok(event) => {
                        if socket.send(Message::Text(event)).await.is_err() {
                            break; // client disconnected
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break, // channel closed
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
                    Some(Ok(Message::Pong(_))) => {
                        awaiting_pong = false;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        warn!("ws recv error: {e}");
                        break;
                    }
                    _ => {} // binary — ignore
                }
            }
            // Periodic ping for keepalive
            _ = ping_interval.tick() => {
                if awaiting_pong {
                    // Previous ping was not answered — assume dead connection.
                    warn!("ws client did not respond to ping, closing");
                    break;
                }
                if socket.send(Message::Ping(vec![])).await.is_err() {
                    break;
                }
                awaiting_pong = true;
            }
        }
    }
}
