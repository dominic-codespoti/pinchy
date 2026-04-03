//! Pinchy agent chat API — real agent runtime endpoint.
//!
//! This provides a `/api/pinchy/chat` endpoint that uses the normal agent
//! runtime to talk to the predefined `pinchy` agent, instead of the stub
//! assistant direct-call path.
//!
//! Features:
//! - Uses the normal message bus and dispatch flow
//! - Full tool access via the agent runtime
//! - Supports conversation context (agent/group scope)
//! - Streaming responses via WebSocket events
//! - Session management

use axum::{extract::Json, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

/// Chat request to the Pinchy agent.
#[derive(Debug, Deserialize)]
pub(crate) struct PinchyChatRequest {
    /// User message
    pub message: String,
    /// Optional conversation context (agent or group scope)
    #[serde(default)]
    pub context: Option<crate::comm::ConversationContext>,
    /// Optional session ID for continuing conversations
    #[serde(default)]
    pub session_id: Option<String>,
    /// Optional conversation history for context (reserved for future use)
    #[allow(dead_code)]
    #[serde(default)]
    pub history: Vec<PinchyMessage>,
}

/// A single message in the conversation history.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct PinchyMessage {
    pub role: String,
    pub content: String,
}

/// Chat response from the Pinchy agent.
#[derive(Debug, Serialize)]
pub(crate) struct PinchyChatResponse {
    pub reply: String,
    pub session_id: String,
    pub agent_id: String,
}

/// POST /api/pinchy/chat
///
/// Chat with the predefined Pinchy agent using the normal runtime.
/// The request is sent through the message bus and dispatched to the
/// pinchy agent, which processes it using the normal turn execution
/// with full tool access.
pub(crate) async fn api_pinchy_chat(Json(body): Json<PinchyChatRequest>) -> impl IntoResponse {
    // Validate request
    if body.message.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "message is required"
            })),
        )
            .into_response();
    }

    // Ensure the pinchy agent exists
    if !crate::pinchy_agent::pinchy_agent_exists() {
        if let Err(e) = crate::pinchy_agent::ensure_pinchy_agent().await {
            warn!(error = %e, "failed to create pinchy agent workspace");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("failed to initialize pinchy agent: {e}")
                })),
            )
                .into_response();
        }
    }

    // Generate or use provided session ID
    let session_id = body
        .session_id
        .clone()
        .unwrap_or_else(crate::session::index::new_session_id);

    debug!(session = %session_id, "sending message to pinchy agent via message bus");

    // Build the incoming message with context
    let msg = crate::comm::IncomingMessage {
        agent_id: Some(crate::pinchy_agent::PINCHY_AGENT_ID.to_string()),
        channel: "gateway:pinchy".to_string(),
        author: "user".to_string(),
        content: body.message.clone(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
        session_id: Some(session_id.clone()),
        images: Vec::new(),
        context: body.context.clone(),
    };

    // Send to message bus - the agent runtime will pick it up
    // We need to wait for the response, so we'll use a oneshot channel
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();

    // Set up a temporary reply listener
    let session_id_for_listener = session_id.clone();
    let mut events_rx = crate::gateway::global_events_tx()
        .map(|tx| tx.subscribe())
        .unwrap_or_else(|| {
            // If no global sender, create a dummy channel
            let (_, rx) = tokio::sync::broadcast::channel(1);
            rx
        });

    // Spawn a task to listen for the assistant reply
    tokio::spawn(async move {
        let mut reply: Option<String> = None;
        let timeout = tokio::time::Duration::from_secs(120);
        let deadline = tokio::time::Instant::now() + timeout;

        while tokio::time::Instant::now() < deadline {
            match tokio::time::timeout(std::time::Duration::from_millis(100), events_rx.recv())
                .await
            {
                Ok(Ok(event_json)) => {
                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(&event_json) {
                        // Check for session_message events from the pinchy agent
                        if event.get("type").and_then(|v| v.as_str()) == Some("session_message") {
                            let event_agent = event.get("agent").and_then(|v| v.as_str());
                            let event_session = event.get("session").and_then(|v| v.as_str());
                            let event_role = event.get("role").and_then(|v| v.as_str());

                            if event_agent == Some(crate::pinchy_agent::PINCHY_AGENT_ID)
                                && event_session == Some(&session_id_for_listener)
                                && event_role == Some("assistant")
                            {
                                if let Some(content) = event.get("content").and_then(|v| v.as_str())
                                {
                                    reply = Some(content.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
                _ => continue,
            }
        }

        let _ = tx.send(reply.unwrap_or_else(|| {
            "[No response received from Pinchy agent within timeout]".to_string()
        }));
    });

    // Send the message to the bus
    if let Err(e) = crate::comm::sender().send(msg) {
        warn!(error = %e, "failed to send message to comm bus");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": format!("failed to send message: {e}")
            })),
        )
            .into_response();
    }

    // Wait for the reply
    match rx.await {
        Ok(reply) => {
            let response = PinchyChatResponse {
                reply,
                session_id,
                agent_id: crate::pinchy_agent::PINCHY_AGENT_ID.to_string(),
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": "failed to receive response from pinchy agent"
            })),
        )
            .into_response(),
    }
}
