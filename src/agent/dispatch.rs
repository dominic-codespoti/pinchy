use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use crate::comm::IncomingMessage;
use crate::config::Config;

use super::types::Agent;

static IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

pub fn in_flight_count() -> usize {
    IN_FLIGHT.load(Ordering::Relaxed)
}

pub async fn drain_in_flight(timeout: std::time::Duration) {
    let start = std::time::Instant::now();
    loop {
        if IN_FLIGHT.load(Ordering::Relaxed) == 0 {
            break;
        }
        if start.elapsed() >= timeout {
            warn!(
                remaining = IN_FLIGHT.load(Ordering::Relaxed),
                "shutdown drain timeout reached, proceeding"
            );
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

pub fn init(
    cfg: &Config,
    bus: tokio::sync::broadcast::Sender<IncomingMessage>,
    cancel: CancellationToken,
) {
    let routing = cfg.routing.clone().unwrap_or_default();
    let default_agent = cfg.agents.first().map(|a| a.id.clone());

    for agent_cfg in &cfg.agents {
        let agent_id = agent_cfg.id.clone();
        let agent_root = PathBuf::from(&agent_cfg.root);
        let runtime_workspace = agent_root.join("workspace");
        let agent = Arc::new(Mutex::new(Agent::new_from_config(agent_cfg, cfg)));

        let ws = runtime_workspace.clone();
        tokio::spawn(async move {
            if let Err(e) = tokio::fs::create_dir_all(&ws).await {
                warn!(path = %ws.display(), error = %e, "failed to create agent workspace");
            }
        });

        // Start file watchers if configured.
        if !agent_cfg.watch_paths.is_empty() {
            let watcher_agent_id = agent_id.clone();
            let watcher_workspace = runtime_workspace.clone();
            let watcher_paths = agent_cfg.watch_paths.clone();
            let watcher_cancel = cancel.clone();
            crate::watcher::start_agent_watcher(
                watcher_agent_id,
                watcher_workspace,
                watcher_paths,
                watcher_cancel,
            );
        }

        let mut rx = bus.subscribe();
        let routing = routing.clone();
        let agent_id_outer = agent_id.clone();
        let default_agent = default_agent.clone();
        let cancel = cancel.clone();

        tokio::spawn(async move {
            debug!(agent = %agent_id_outer, "agent dispatcher started");
            loop {
                tokio::select! {
                    _ = cancel.cancelled() => {
                        debug!(agent = %agent_id_outer, "agent dispatcher received shutdown signal");
                        break;
                    }
                    result = rx.recv() => {
                        match result {
                            Ok(msg) => {
                                if !message_targets_agent(&msg, &agent_id_outer, &routing, &default_agent) {
                                    continue;
                                }
                                spawn_turn(Arc::clone(&agent), msg);
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                                warn!(skipped = n, "agent dispatch lagged, dropped messages");
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                                debug!("message bus closed, agent dispatcher exiting");
                                break;
                            }
                        }
                    }
                }
            }
        });
    }

    debug!("agent module loaded");
}

fn message_targets_agent(
    msg: &IncomingMessage,
    agent_id: &str,
    routing: &crate::config::RoutingConfig,
    default_agent: &Option<String>,
) -> bool {
    let target = if let Some(ref id) = msg.agent_id {
        if id.is_empty() {
            None
        } else {
            Some(id.as_str())
        }
    } else {
        let key = &msg.channel;
        routing
            .channels
            .get(key)
            .map(|s| s.as_str())
            .or(routing.default_agent.as_deref())
    };

    match target {
        Some(t) => t == agent_id,
        None => matches!(default_agent, Some(ref d) if d == agent_id),
    }
}

fn spawn_turn(agent_mut: Arc<Mutex<Agent>>, msg: IncomingMessage) {
    tokio::spawn(async move {
        IN_FLIGHT.fetch_add(1, Ordering::Relaxed);
        let _guard = InFlightGuard;

        let start = std::time::Instant::now();
        let mut guard = agent_mut.lock().await;
        let agent_id = guard.id.clone();
        let ws = guard.workspace.clone();

        let result = guard.run_turn(msg.clone()).await;
        let duration = start.elapsed().as_millis() as u64;

        // Record completion for cron jobs.
        if msg.channel.starts_with("cron:") {
            let job_name = &msg.channel[5..];
            let job_id = format!("{}@{}", job_name, agent_id);
            let summary = result
                .as_ref()
                .ok()
                .map(|r| crate::utils::truncate_str(r, 200));
            let error = result.as_ref().err().map(|e| e.to_string());

            let _ = crate::scheduler::complete_cron_run(
                &ws,
                &job_id,
                msg.timestamp as u64,
                result.is_ok(),
                duration,
                summary,
                error,
            )
            .await;
        }

        match result {
            Ok(reply) => {
                info!(reply_len = reply.len(), duration, "agent turn completed");
                let session_id = guard.current_session.clone();
                let channel = msg.channel;
                // Drop the mutex before spawning the reply task.
                drop(guard);
                send_reply(agent_id, session_id, channel, reply);
            }
            Err(e) => {
                warn!(error = %e, duration, "agent turn failed");

                let error_msg = if let Some(auth) = crate::auth::find_auth_error(&e) {
                    format!(
                        "🚨 **{} authentication failed**\n{}",
                        auth.provider, auth.hint
                    )
                } else {
                    format!("⚠️ Sorry, something went wrong: {e}")
                };

                let session_id = guard.current_session.clone();
                let channel = msg.channel.clone();
                drop(guard);

                // Emit events directly with agent metadata so the web UI
                // can match them (it filters on agent/session fields).
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "typing_stop",
                    "agent": &agent_id,
                    "session": &session_id,
                }));
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "session_message",
                    "agent": &agent_id,
                    "session": &session_id,
                    "role": "assistant",
                    "content": &error_msg,
                    "timestamp": std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                }));

                // Also send through the normal channel path for
                // Discord and other connectors.
                send_reply(agent_id, session_id, channel, error_msg);
            }
        }
    });
}

fn send_reply(agent_id: String, session_id: Option<String>, channel: String, reply: String) {
    tokio::spawn(async move {
        // Internal channels (heartbeat, cron) have no connector — publish
        // directly to the gateway instead of going through comm.
        if channel.starts_with("cron:") || channel == "heartbeat" {
            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "agent_reply",
                "agent": agent_id,
                "session": session_id,
                "channel": channel,
                "text": reply,
            }));
            return;
        }

        let ctx = crate::discord::ReplyContext {
            agent_id: agent_id.clone(),
            session_id: session_id.clone(),
        };
        let ch = channel.clone();
        let rp = reply.clone();
        let send_result = crate::discord::CURRENT_REPLY_CONTEXT
            .scope(ctx.clone(), async move {
                crate::comm::send_reply(&ch, &rp).await
            })
            .await;

        if send_result.is_err() {
            warn!(channel = %channel, "failed to send reply (no matching connector)");
        }
    });
}

struct InFlightGuard;
impl Drop for InFlightGuard {
    fn drop(&mut self) {
        IN_FLIGHT.fetch_sub(1, Ordering::Relaxed);
    }
}
