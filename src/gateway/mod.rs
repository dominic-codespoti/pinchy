//! Minimal HTTP + WebSocket gateway.
//!
//! Starts by default; set `PINCHY_GATEWAY=0` to disable.  Serves:
//! - `GET /api/status` — returns `{ "status": "ok" }`
//! - `GET /ws`         — WebSocket: broadcasts internal events to clients;
//!   client messages are forwarded to a commands channel.

mod auth;
mod handlers;
mod ws;

use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use std::net::SocketAddr;
use std::sync::OnceLock;
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;
use tower_http::services::ServeDir;
use async_trait::async_trait;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

// ---------------------------------------------------------------------------
// Global senders (so other modules can publish events / send commands)
// ---------------------------------------------------------------------------

static GLOBAL_EVENTS_TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

/// Store the gateway broadcast sender so other modules can publish events.
pub fn set_global_events_tx(tx: broadcast::Sender<String>) {
    let _ = GLOBAL_EVENTS_TX.set(tx);
}

/// Retrieve the global events sender (if the gateway is running).
pub fn global_events_tx() -> Option<broadcast::Sender<String>> {
    GLOBAL_EVENTS_TX.get().cloned()
}

/// Serialize `value` as JSON and broadcast it to all WebSocket clients.
///
/// No-op if the gateway is not running.
pub fn publish_event_json(value: &serde_json::Value) {
    if let Some(tx) = global_events_tx() {
        match serde_json::to_string(value) {
            Ok(json) => {
                // Best-effort: ignore send errors (e.g. no active receivers).
                let _ = tx.send(json);
            }
            Err(e) => {
                warn!(error = %e, "gateway: failed to serialize event");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// ChannelConnector for gateway replies
// ---------------------------------------------------------------------------

struct GatewayConnector;

#[async_trait]
impl crate::comm::ChannelConnector for GatewayConnector {
    fn name(&self) -> &str { "gateway" }
    fn matches(&self, channel: &str) -> bool { channel.starts_with("gateway:") }
    async fn send(&self, _channel: &str, text: &str) -> anyhow::Result<()> {
        publish_event_json(&serde_json::json!({
            "type": "agent_reply",
            "text": text,
        }));
        Ok(())
    }
    async fn send_rich(&self, _channel: &str, msg: crate::comm::RichMessage) -> anyhow::Result<()> {
        publish_event_json(&serde_json::json!({
            "type": "agent_rich_reply",
            "message": msg,
        }));
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Gateway handle
// ---------------------------------------------------------------------------

/// Handle returned by [`start_gateway`].  Holds the broadcast sender so
/// other modules can publish events, plus the command receiver.
pub struct Gateway {
    /// Send events that will be forwarded to all WebSocket clients.
    pub events_tx: broadcast::Sender<String>,
    /// Receive commands sent by WebSocket clients.
    pub commands_rx: mpsc::Receiver<String>,
    /// Server task handle.
    pub handle: JoinHandle<()>,
    /// The address the server is actually listening on.
    pub addr: SocketAddr,
}

// ---------------------------------------------------------------------------
// Shared state injected into axum handlers
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) events_tx: broadcast::Sender<String>,
    pub(crate) commands_tx: mpsc::Sender<String>,
    pub(crate) config_path: std::path::PathBuf,
    pub(crate) api_token: Option<String>,
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

/// Start the gateway HTTP + WS server on `addr`.
///
/// Returns a [`Gateway`] holding channels and the server task handle.
pub async fn start_gateway(addr: SocketAddr) -> std::io::Result<Gateway> {
    start_gateway_with_config(addr, crate::pinchy_home().join("config.yaml")).await
}

/// Start the gateway HTTP + WS server on `addr` with a specific config path.
///
/// Returns a [`Gateway`] holding channels and the server task handle.
pub async fn start_gateway_with_config(
    addr: SocketAddr,
    config_path: std::path::PathBuf,
) -> std::io::Result<Gateway> {
    let (events_tx, _) = broadcast::channel::<String>(256);
    let (commands_tx, commands_rx) = mpsc::channel::<String>(256);

    let api_token = std::env::var("PINCHY_API_TOKEN").ok().filter(|s| !s.is_empty());

    let state = AppState {
        events_tx: events_tx.clone(),
        commands_tx,
        config_path,
        api_token,
    };

    if state.api_token.is_some() {
        info!("API authentication enabled (PINCHY_API_TOKEN set)");
    } else {
        warn!("API authentication disabled (PINCHY_API_TOKEN not set)");
    }

    let _ = handlers::health::STARTUP_TIME.set(std::time::Instant::now());

    let api_router = Router::new()
        .route("/status", get(handlers::health::status_handler))
        .route("/health", get(handlers::health::api_health))
        // Config
        .route("/config", get(handlers::config::api_config_get).put(handlers::config::api_config_put))
        // Agents
        .route("/agents", get(handlers::agents::api_agents_list).post(handlers::agents::api_agent_create))
        .route(
            "/agents/:agent_id",
            get(handlers::agents::api_agent_get)
                .put(handlers::agents::api_agent_update)
                .delete(handlers::agents::api_agent_delete),
        )
        // Agent files
        .route(
            "/agents/:agent_id/files/:filename",
            get(handlers::agents::api_agent_file_get).put(handlers::agents::api_agent_file_put),
        )
        // Sessions
        .route("/agents/:agent_id/session/current", get(handlers::sessions::api_session_current))
        .route("/agents/:agent_id/sessions", get(handlers::sessions::api_sessions_list))
        .route(
            "/agents/:agent_id/sessions/:session_file",
            get(handlers::sessions::api_session_get)
                .put(handlers::sessions::api_session_update)
                .delete(handlers::sessions::api_session_delete),
        )
        // Receipts
        .route("/agents/:agent_id/receipts", get(handlers::receipts::api_receipts_list))
        .route(
            "/agents/:agent_id/receipts/:session_id",
            get(handlers::receipts::api_receipts_by_session),
        )
        // Heartbeat
        .route("/heartbeat/status", get(handlers::heartbeat::api_heartbeat_status_all))
        .route(
            "/heartbeat/status/:agent_id",
            get(handlers::heartbeat::api_heartbeat_status_one),
        )
        // Cron
        .route(
            "/cron/jobs",
            get(handlers::cron::api_cron_jobs_all).post(handlers::cron::api_cron_jobs_create),
        )
        .route("/cron/jobs/:agent_id", get(handlers::cron::api_cron_jobs_by_agent))
        .route("/cron/jobs/:job_id/runs", get(handlers::cron::api_cron_job_runs))
        .route(
            "/cron/jobs/:job_id/delete",
            delete(handlers::cron::api_cron_jobs_delete),
        )
        .route("/cron/jobs/:job_id/update", put(handlers::cron::api_cron_jobs_update))
        // Skills
        .route("/skills", get(handlers::skills::api_skills_list))
        // Webhooks (outside auth middleware — uses per-agent ?secret= param)
        .route("/webhook/:agent_id", post(handlers::webhook::api_webhook_ingest))
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware));

    let app = Router::new()
        .nest("/api", api_router)
        // WebSocket
        .route("/ws", get(ws::ws_handler))
        .route("/ws/logs", get(ws::ws_logs_handler))
        .with_state(state)
        .fallback_service(ServeDir::new("static"));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    let bound_addr = listener.local_addr()?;

    let handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            error!("gateway server error: {e}");
        }
    });

    info!(%bound_addr, "gateway started");

    Ok(Gateway {
        events_tx,
        commands_rx,
        handle,
        addr: bound_addr,
    })
}

/// Convenience: start the gateway unless `PINCHY_GATEWAY=0`.
///
/// Listens on `PINCHY_GATEWAY_ADDR` (default `127.0.0.1:3000`).
/// Returns `None` if the gateway is explicitly disabled.
pub async fn spawn_gateway_if_enabled() -> Option<Gateway> {
    if std::env::var("PINCHY_GATEWAY").as_deref() == Ok("0") {
        info!("gateway disabled (PINCHY_GATEWAY=0)");
        return None;
    }

    let addr: SocketAddr = match std::env::var("PINCHY_GATEWAY_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:3000".to_string())
        .parse()
    {
        Ok(a) => a,
        Err(e) => {
            error!("invalid PINCHY_GATEWAY_ADDR: {e}");
            return None;
        }
    };

    // Try up to 10 consecutive ports so a stale process doesn't block startup.
    let max_attempts = 10u16;
    let mut attempt_addr = addr;
    for attempt in 0..max_attempts {
        match start_gateway(attempt_addr).await {
            Ok(gw) => {
                set_global_events_tx(gw.events_tx.clone());
                crate::comm::register_connector(Arc::new(GatewayConnector)).await;
                if attempt > 0 {
                    info!(
                        original = %addr,
                        bound = %gw.addr,
                        "port {} in use, auto-bound to {}",
                        addr.port(),
                        gw.addr.port(),
                    );
                }
                info!(addr = %gw.addr, "gateway enabled");
                return Some(gw);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse && attempt + 1 < max_attempts => {
                debug!(port = attempt_addr.port(), "port in use, trying next");
                attempt_addr.set_port(attempt_addr.port() + 1);
            }
            Err(e) => {
                error!("failed to start gateway: {e}");
                return None;
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Command forwarding (WS client commands → comm bus)
// ---------------------------------------------------------------------------

/// Spawn a background task that reads commands from `commands_rx` and
/// forwards each one into the [`crate::comm`] message bus as an
/// `IncomingMessage` from the `"gateway"` channel.
///
/// Slash commands (messages starting with `/`) are intercepted and
/// dispatched through the [`crate::slash::Registry`] so they are never
/// forwarded to the LLM.
pub fn spawn_command_forwarder(mut commands_rx: mpsc::Receiver<String>) {
    use crate::comm;
    use crate::slash;

    // Build a slash registry once for the forwarder lifetime.
    let registry = slash::Registry::new();
    slash::register_builtin_commands(&registry);

    tokio::spawn(async move {
        debug!("gateway command forwarder started");
        while let Some(text) = commands_rx.recv().await {
            // Try to parse as JSON payload from the web client.
            let (command, target_agent) =
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    let cmd = parsed
                        .get("command")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&text)
                        .to_string();
                    let agent = parsed
                        .get("target_agent")
                        .and_then(|v| v.as_str())
                        .unwrap_or("default")
                        .to_string();
                    (cmd, agent)
                } else {
                    (text.clone(), "default".to_string())
                };

            // Intercept slash commands — dispatch via registry.
            if command.starts_with('/') {
                let agent_root = crate::utils::agent_root(&target_agent);
                let ctx = slash::Context {
                    agent_id: target_agent.clone(),
                    agent_root: agent_root.clone(),
                    workspace: agent_root.join("workspace"),
                    channel: "gateway".to_string(),
                    config_path: crate::pinchy_home().join("config.yaml"),
                    pinchy_home: crate::pinchy_home(),
                };
                match registry.dispatch("gateway", &command, &ctx).await {
                    Ok(slash::SlashResponse::Text(reply)) => {
                        debug!(cmd = %command, agent = %target_agent, "slash command dispatched via gateway");
                        publish_event_json(&serde_json::json!({
                            "type": "slash_response",
                            "agent": target_agent,
                            "command": command,
                            "response": reply,
                        }));
                    }
                    Err(e) => {
                        warn!(error = %e, cmd = %command, "gateway slash dispatch error");
                        publish_event_json(&serde_json::json!({
                            "type": "slash_error",
                            "agent": target_agent,
                            "command": command,
                            "error": format!("{e}"),
                        }));
                    }
                }
                continue; // consumed — do NOT forward to comm bus
            }

            let msg = comm::IncomingMessage {
                agent_id: Some(target_agent.clone()),
                channel: "gateway:ws-client".to_string(),
                author: "ws-client".to_string(),
                content: command,
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64,
                session_id: None,
            };
            let content = msg.content.clone();
            let agent = target_agent;
            if let Err(e) = comm::sender().send(msg) {
                warn!(error = %e, "gateway: failed to forward command to comm bus");
            } else {
                publish_event_json(&serde_json::json!({
                    "type": "gateway_command_forwarded",
                    "agent": agent,
                    "content": content
                }));
            }
        }
        debug!("gateway command forwarder stopped (channel closed)");
    });
}
