//! Minimal HTTP + WebSocket gateway.
//!
//! Starts by default; set `PINCHY_GATEWAY=0` to disable.  Serves:
//! - `GET /api/status` — returns `{ "status": "ok" }`
//! - `GET /ws`         — WebSocket: broadcasts internal events to clients;
//!   client messages are forwarded to a commands channel.

mod auth;
mod handlers;
pub(crate) mod types;
mod ws;

use async_trait::async_trait;
use axum::{
    body::Body,
    extract::ws::{Message as WsMessage, WebSocketUpgrade},
    http::{header, StatusCode, Uri},
    middleware,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Router,
};
use rust_embed::Embed;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::{ServeDir, ServeFile};
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

/// HTTP proxy handler: forwards non-API requests to Next.js dev server.
/// Used when PINCHY_DEV_MODE=1 to enable hot reload during development.
async fn dev_mode_http_proxy(path: String, query: Option<String>) -> Response {
    // Proxy to Next.js dev server on localhost:3000
    let target_url = format!(
        "http://localhost:3000{}{}",
        path,
        query
            .as_ref()
            .map(|q| format!("?{}", q))
            .unwrap_or_default()
    );

    // Use trace for static assets (very verbose), debug for everything else
    if path.starts_with("/_next/static/") {
        tracing::trace!(path = %path, "dev mode: proxying static asset");
    } else {
        tracing::debug!(path = %path, "dev mode: proxying to Next.js");
    }

    // Create a new client request to the dev server
    match reqwest::get(&target_url).await {
        Ok(response) => {
            let status = StatusCode::from_u16(response.status().as_u16())
                .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

            // Extract Content-Type header BEFORE consuming the response
            let content_type = response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "text/html; charset=utf-8".to_string());

            // Build response body
            match response.bytes().await {
                Ok(body) => Response::builder()
                    .status(status)
                    .header(header::CONTENT_TYPE, content_type)
                    .body(Body::from(body))
                    .unwrap_or_else(|_| {
                        (StatusCode::INTERNAL_SERVER_ERROR, "Proxy error").into_response()
                    }),
                Err(e) => {
                    warn!(error = %e, "dev mode: failed to read response body");
                    (
                        StatusCode::BAD_GATEWAY,
                        "Failed to read dev server response",
                    )
                        .into_response()
                }
            }
        }
        Err(e) => {
            warn!(error = %e, url = %target_url, "dev mode: failed to proxy to Next.js");
            // Return a helpful error page if Next.js is not running
            Response::builder()
                .status(StatusCode::SERVICE_UNAVAILABLE)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(Body::from(format!(
                    "<h1>Dev Mode Error</h1>
                    <p>Failed to connect to Next.js dev server at http://localhost:3000</p>
                    <p>Make sure Next.js is running: <code>cd web && npm run dev</code></p>
                    <p>Error: {}</p>",
                    e
                )))
                .unwrap_or_else(|_| {
                    (StatusCode::SERVICE_UNAVAILABLE, "Dev server unavailable").into_response()
                })
        }
    }
}

/// Proxy WebSocket connection to Next.js dev server.
async fn dev_mode_ws_proxy(ws: WebSocketUpgrade, uri: Uri) -> Response {
    use futures_util::{SinkExt, StreamExt};

    let path = uri.path().to_string();
    let query = uri.query().map(String::from);
    let target = format!(
        "ws://localhost:3000{}{}",
        path,
        query
            .as_ref()
            .map(|q| format!("?{}", q))
            .unwrap_or_default()
    );

    tracing::debug!(path = %path, "dev mode: proxying WebSocket to Next.js");

    ws.on_upgrade(move |client_socket| async move {
        // Connect to Next.js dev server WebSocket
        let nextjs_stream = match tokio_tungstenite::connect_async(&target).await {
            Ok((stream, _)) => stream,
            Err(e) => {
                warn!(error = %e, url = %target, "dev mode: failed to connect to Next.js WebSocket");
                return;
            }
        };

        // Split both websockets for concurrent read/write
        let (mut client_sender, mut client_receiver) = client_socket.split();
        let (mut nextjs_sender, mut nextjs_receiver) = nextjs_stream.split();

        // Forward client → Next.js
        let client_to_nextjs = async {
            while let Some(result) = client_receiver.next().await {
                match result {
                    Ok(msg) => {
                        let tungstenite_msg = match msg {
                            WsMessage::Text(text) => tokio_tungstenite::tungstenite::Message::Text(text),
                            WsMessage::Binary(bin) => tokio_tungstenite::tungstenite::Message::Binary(bin),
                            WsMessage::Close(frame) => {
                                let frame = frame.map(|f| tokio_tungstenite::tungstenite::protocol::CloseFrame {
                                    code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::from(f.code),
                                    reason: f.reason,
                                });
                                tokio_tungstenite::tungstenite::Message::Close(frame)
                            }
                            WsMessage::Ping(data) => tokio_tungstenite::tungstenite::Message::Ping(data),
                            WsMessage::Pong(data) => tokio_tungstenite::tungstenite::Message::Pong(data),
                        };
                        if nextjs_sender.send(tungstenite_msg).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        };

        // Forward Next.js → client
        let nextjs_to_client = async {
            while let Some(result) = nextjs_receiver.next().await {
                match result {
                    Ok(msg) => {
                        let axum_msg = match msg {
                            tokio_tungstenite::tungstenite::Message::Text(text) => WsMessage::Text(text),
                            tokio_tungstenite::tungstenite::Message::Binary(bin) => WsMessage::Binary(bin),
                            tokio_tungstenite::tungstenite::Message::Close(frame) => {
                                let frame = frame.map(|f| axum::extract::ws::CloseFrame {
                                    code: f.code.into(),
                                    reason: f.reason.to_string().into(),
                                });
                                WsMessage::Close(frame)
                            }
                            tokio_tungstenite::tungstenite::Message::Ping(data) => WsMessage::Ping(data),
                            tokio_tungstenite::tungstenite::Message::Pong(data) => WsMessage::Pong(data),
                            _ => continue,
                        };
                        if client_sender.send(axum_msg).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        };

        // Run both directions concurrently
        tokio::join!(client_to_nextjs, nextjs_to_client);
    })
}

/// HTTP handler for dev mode fallback.
/// Uses axum extractors for proper request handling.
async fn dev_mode_http_handler(uri: Uri) -> Response {
    let path = uri.path().to_string();
    let query = uri.query().map(String::from);

    dev_mode_http_proxy(path, query).await
}

// ---------------------------------------------------------------------------
// ChannelConnector for gateway replies
// ---------------------------------------------------------------------------

struct GatewayConnector;

#[async_trait]
impl crate::comm::ChannelConnector for GatewayConnector {
    fn name(&self) -> &str {
        "gateway"
    }
    fn matches(&self, channel: &str) -> bool {
        channel.starts_with("gateway:")
    }
    async fn send(&self, _channel: &str, _text: &str) -> anyhow::Result<()> {
        // NOTE: We do NOT emit typing_stop or session_message here.
        // The agent's turn completion already emits these events with
        // proper agent/session metadata. This connector is just for
        // message delivery; UI events are handled by the agent runtime.
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

/// Build a CORS allowed-origins list.
///
/// Defaults to `http://localhost:*` and `http://127.0.0.1:*` variants.
/// Additional origins can be appended via `PINCHY_CORS_ORIGINS` (comma-separated).
fn allowed_origins() -> tower_http::cors::AllowOrigin {
    use axum::http::HeaderValue;

    let mut origins: Vec<HeaderValue> = Vec::new();

    // Always allow common local dev origins.
    for port in [3131, 3000, 5173, 8080] {
        if let Ok(v) = format!("http://localhost:{port}").parse() {
            origins.push(v);
        }
        if let Ok(v) = format!("http://127.0.0.1:{port}").parse() {
            origins.push(v);
        }
    }

    // Allow the user to add extra origins via env.
    if let Ok(extra) = std::env::var("PINCHY_CORS_ORIGINS") {
        for origin in extra.split(',') {
            let trimmed = origin.trim();
            if !trimmed.is_empty() {
                if let Ok(v) = trimmed.parse() {
                    origins.push(v);
                } else {
                    warn!("ignoring invalid CORS origin: {trimmed}");
                }
            }
        }
    }

    tower_http::cors::AllowOrigin::list(origins)
}

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
    // Ensure the global DB is initialised (idempotent via OnceLock).
    if crate::store::global_db().is_none() {
        if let Ok(db) = crate::store::PinchyDb::open(&crate::pinchy_home()) {
            crate::store::set_global_db(db);
        }
    }

    let (events_tx, _) = broadcast::channel::<String>(256);
    let (commands_tx, commands_rx) = mpsc::channel::<String>(256);

    let api_token = std::env::var("PINCHY_API_TOKEN")
        .ok()
        .filter(|s| !s.is_empty());

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
        .route(
            "/config",
            get(handlers::config::api_config_get).put(handlers::config::api_config_put),
        )
        .route("/config/schema", get(handlers::config::api_config_schema))
        // Agents
        .route(
            "/agents",
            get(handlers::agents::api_agents_list).post(handlers::agents::api_agent_create),
        )
        .route(
            "/agents/:agent_id",
            get(handlers::agents::api_agent_get)
                .put(handlers::agents::api_agent_update)
                .delete(handlers::agents::api_agent_delete),
        )
        .route(
            "/agents/:agent_id/clone",
            post(handlers::agents::api_agent_clone),
        )
        .route(
            "/agents/:agent_id/cron",
            get(handlers::cron::api_agent_cron_jobs),
        )
        // Agent files
        .route(
            "/agents/:agent_id/files/:filename",
            get(handlers::agents::api_agent_file_get).put(handlers::agents::api_agent_file_put),
        )
        // Sessions
        .route(
            "/agents/:agent_id/session/current",
            get(handlers::sessions::api_session_current),
        )
        .route(
            "/agents/:agent_id/sessions",
            get(handlers::sessions::api_sessions_list),
        )
        .route(
            "/agents/:agent_id/sessions/:session_file",
            get(handlers::sessions::api_session_get)
                .put(handlers::sessions::api_session_update)
                .delete(handlers::sessions::api_session_delete),
        )
        // Receipts
        .route(
            "/agents/:agent_id/receipts",
            get(handlers::receipts::api_receipts_list),
        )
        .route(
            "/agents/:agent_id/receipts/:session_id",
            get(handlers::receipts::api_receipts_by_session),
        )
        // Heartbeat
        .route(
            "/heartbeat/status",
            get(handlers::heartbeat::api_heartbeat_status_all),
        )
        .route(
            "/heartbeat/status/:agent_id",
            get(handlers::heartbeat::api_heartbeat_status_one),
        )
        // Cron
        .route(
            "/cron/jobs",
            get(handlers::cron::api_cron_jobs_all).post(handlers::cron::api_cron_jobs_create),
        )
        .route(
            "/cron/jobs/:agent_id",
            get(handlers::cron::api_cron_jobs_by_agent),
        )
        .route(
            "/cron/jobs/:job_id/runs",
            get(handlers::cron::api_cron_job_runs),
        )
        .route(
            "/cron/jobs/:job_id/delete",
            delete(handlers::cron::api_cron_jobs_delete),
        )
        .route(
            "/cron/jobs/:job_id/update",
            put(handlers::cron::api_cron_jobs_update),
        )
        .route(
            "/cron/jobs/:job_id/trigger",
            post(handlers::cron::api_cron_job_trigger),
        )
        // Memory
        .route(
            "/agents/:agent_id/memory",
            get(handlers::memory::api_memory_list),
        )
        .route(
            "/agents/:agent_id/memory/:key",
            delete(handlers::memory::api_memory_delete),
        )
        // Skills
        .route(
            "/skills",
            get(handlers::skills::api_skills_list).post(handlers::skills::api_skills_create),
        )
        .route(
            "/skills/:name",
            get(handlers::skills::api_skills_get)
                .put(handlers::skills::api_skills_update)
                .delete(handlers::skills::api_skills_delete),
        )
        // AI
        .route(
            "/ai/enhance-prompt",
            post(handlers::cron::api_ai_enhance_prompt),
        )
        // Slash commands
        .route(
            "/slash/commands",
            get(handlers::slash_cmds::api_slash_commands),
        )
        // Usage / cost tracking
        .route("/usage", get(handlers::usage::api_usage))
        // Debug
        .route(
            "/debug/model-requests",
            get(handlers::debug::api_debug_model_requests_list),
        )
        .route(
            "/debug/model-requests/:request_id",
            get(handlers::debug::api_debug_model_request_get),
        )
        // Logs
        .route(
            "/agents/:agent_id/logs",
            get(handlers::debug::api_agent_logs),
        )
        // Model discovery
        .route(
            "/models/registry",
            get(handlers::models::api_models_registry),
        )
        .route(
            "/models/:config_model_id",
            get(handlers::models::api_models_list),
        )
        .route("/models", get(handlers::models::api_all_models))
        // Provider auth status
        .route(
            "/providers/status",
            get(handlers::providers::api_providers_status),
        )
        .route(
            "/providers/:provider/test",
            post(handlers::providers::api_provider_test),
        )
        // API key save/clear/masked endpoints (require auth)
        .route(
            "/auth/:provider/masked",
            get(handlers::providers::api_auth_masked_key),
        )
        .route(
            "/auth/:provider",
            post(handlers::providers::api_auth_save_key)
                .delete(handlers::providers::api_auth_clear),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ));

    // Public auth endpoints: Copilot OAuth device flow (no auth required).
    // These need to be accessible before the user has authenticated with GitHub.
    let public_auth_router = Router::new()
        .route(
            "/auth/copilot/start",
            post(handlers::providers::api_auth_copilot_start),
        )
        .route(
            "/auth/copilot/poll",
            post(handlers::providers::api_auth_copilot_poll),
        );

    // Webhooks: outside auth middleware — uses per-agent ?secret= param.
    // Nested under /api so the URL is /api/webhook/:agent_id but NOT behind
    // the global API-token layer.
    let webhook_router = Router::new().route(
        "/webhook/:agent_id",
        post(handlers::webhook::api_webhook_ingest),
    );

    let (static_root, index_file, ui_label) = resolve_ui_paths();
    let use_filesystem = ui_label != "missing";
    info!(
        root = %static_root.display(),
        index = %index_file.display(),
        ui = %ui_label,
        embedded_fallback = !use_filesystem,
        "serving web UI"
    );

    // Check that embedded assets are actually present (build may have
    // been done without the React UI).
    let has_embedded = WebUiAssets::get("index.html").is_some();
    if !use_filesystem && !has_embedded {
        warn!("No UI assets on disk or embedded — dashboard will 404");
    }

    // Build the authenticated portion with auth middleware
    // WebSocket routes are moved OUTSIDE auth middleware for dev mode access
    let authed_app = Router::new()
        .nest("/api", api_router)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ));

    // Merge public routes AFTER the auth layer so they're not affected
    // WebSocket routes (/ws, /ws/logs) are public for dev mode WebSocket access
    let mut app = authed_app
        .nest("/api", public_auth_router)
        .nest("/api", webhook_router)
        .route("/ws", get(ws::ws_handler))
        .route("/ws/logs", get(ws::ws_logs_handler))
        .layer(
            CorsLayer::new()
                .allow_origin(allowed_origins())
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(RequestBodyLimitLayer::new(5 * 1024 * 1024)) // 5 MB
        .with_state(state);

    // Determine dev mode state
    let dev_mode = std::env::var("PINCHY_DEV_MODE").as_deref() == Ok("1");
    if dev_mode {
        info!("dev mode: proxying UI to http://localhost:3000");
    }

    if dev_mode {
        // Dev mode: proxy all non-API requests to Next.js dev server for HMR
        // WebSocket routes need to be handled explicitly to use WebSocketUpgrade extractor
        app = app
            .route("/_next/webpack-hmr", get(dev_mode_ws_proxy))
            .fallback(dev_mode_http_handler);
    } else if use_filesystem {
        // Dev / deployed-with-files: serve from disk (supports HMR proxy, etc.)
        let static_service = ServeDir::new(static_root.clone())
            .not_found_service(ServeFile::new(index_file.clone()));
        let react_mount_service = ServeDir::new(static_root.clone());
        app = app
            .route_service("/", ServeFile::new(index_file))
            .nest_service("/react", react_mount_service)
            .fallback_service(static_service);
    } else if has_embedded {
        // Installed via `cargo install` or crates.io: serve from embedded assets.
        info!("using embedded web UI assets");
        app = app
            .route("/", get(embedded_static))
            .fallback(embedded_static);
    }

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
/// Listens on `PINCHY_GATEWAY_ADDR` (default `0.0.0.0:3131`).
/// Returns `None` if the gateway is explicitly disabled.
pub async fn spawn_gateway_if_enabled() -> Option<Gateway> {
    if std::env::var("PINCHY_GATEWAY").as_deref() == Ok("0") {
        info!("gateway disabled (PINCHY_GATEWAY=0)");
        return None;
    }

    let addr: SocketAddr = match std::env::var("PINCHY_GATEWAY_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:3131".to_string())
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

fn resolve_ui_paths() -> (PathBuf, PathBuf, &'static str) {
    let cwd_react_index = Path::new("static/react/index.html");
    if cwd_react_index.exists() {
        return (
            PathBuf::from("static/react"),
            PathBuf::from("static/react/index.html"),
            "react",
        );
    }

    // Only use CARGO_MANIFEST_DIR if it looks like a real project checkout
    // (not the crates.io registry cache, which is fragile and may be pruned).
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let is_registry_cache = manifest_dir
        .to_str()
        .map(|s| s.contains(".cargo/registry"))
        .unwrap_or(false);
    if !is_registry_cache {
        let manifest_react_index = manifest_dir.join("static/react/index.html");
        if manifest_react_index.exists() {
            return (
                manifest_dir.join("static/react"),
                manifest_react_index,
                "react",
            );
        }
    }

    // Check next to the running executable (common for deployed binaries).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe
            .canonicalize()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        {
            let exe_react_index = exe_dir.join("static/react/index.html");
            if exe_react_index.exists() {
                return (exe_dir.join("static/react"), exe_react_index, "react");
            }
        }
    }

    // Check inside PINCHY_HOME (e.g. ~/.pinchy/static/react/).
    {
        let home_react_index = crate::pinchy_home().join("static/react/index.html");
        if home_react_index.exists() {
            return (
                crate::pinchy_home().join("static/react"),
                home_react_index,
                "react",
            );
        }
    }

    let cwd_legacy_index = Path::new("static/index.html");
    if cwd_legacy_index.exists() {
        warn!(
            "React UI not built (missing static/react/index.html), falling back to legacy static/"
        );
        return (
            PathBuf::from("static"),
            PathBuf::from("static/index.html"),
            "legacy",
        );
    }

    let manifest_legacy_index = Path::new(env!("CARGO_MANIFEST_DIR")).join("static/index.html");
    if !is_registry_cache && manifest_legacy_index.exists() {
        warn!(
            "React UI not built (missing static/react/index.html), falling back to legacy static/"
        );
        return (
            Path::new(env!("CARGO_MANIFEST_DIR")).join("static"),
            manifest_legacy_index,
            "legacy",
        );
    }

    // Last resort: keep predictable startup.
    warn!(
        "No UI assets found under static/react or static; serving from static/ with expected 404s"
    );
    (
        PathBuf::from("static"),
        PathBuf::from("static/index.html"),
        "missing",
    )
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
            let (command, target_agent, session_id, images) =
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
                    let session = parsed
                        .get("session_id")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                    let imgs: Vec<String> = parsed
                        .get("images")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    (cmd, agent, session, imgs)
                } else {
                    (text.clone(), "default".to_string(), None, Vec::new())
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
                session_id,
                images,
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

// ---------------------------------------------------------------------------
// Embedded web UI assets (built by `cd web && pnpm build`)
// ---------------------------------------------------------------------------

#[derive(Embed)]
#[folder = "static/react/"]
#[prefix = ""]
struct WebUiAssets;

/// Serve a file from the embedded web UI assets.
async fn embedded_static(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    // Strip the /react/ prefix if present (for nested mount).
    let path = path.strip_prefix("react/").unwrap_or(path);
    // Serve the requested file, or fall back to index.html for SPA routing.
    let path = if path.is_empty() { "index.html" } else { path };

    match WebUiAssets::get(path) {
        Some(content) => {
            let mime = mime_from_path(path);
            ([(header::CONTENT_TYPE, mime)], content.data.to_vec()).into_response()
        }
        None => {
            // SPA fallback: serve index.html for unknown paths.
            match WebUiAssets::get("index.html") {
                Some(content) => {
                    let body = content.data.to_vec();
                    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], body).into_response()
                }
                None => (StatusCode::NOT_FOUND, "UI assets not embedded").into_response(),
            }
        }
    }
}

fn mime_from_path(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "application/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("map") => "application/json",
        _ => "application/octet-stream",
    }
}
