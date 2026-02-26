//! Agent runtime: manages agent identity, workspace bootstrap, session
//! history, and turn execution.
//!
//! Call [`Agent::init()`] once at startup to spawn a background task that
//! subscribes to the [`crate::comm`] message bus and dispatches incoming
//! messages to the appropriate agent instance.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use tokio::fs;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use crate::comm::IncomingMessage;
use crate::config::Config;
use crate::models::{
    build_provider_manager, ChatMessage, ProviderManager, ProviderResponse, TokenUsage,
};
use crate::session::{Exchange, SessionStore};
use crate::tools;

/// Generate a short pseudo-random id for synthetic tool_call_ids.
///
/// Used when the API response doesn't include a tool_call_id (e.g. legacy
/// `function_call` format or fenced-JSON tool calls).
fn uuid_like_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:016x}", nanos)
}

/// Maximum bytes for a tool result injected into the conversation.
/// Larger results are tail-truncated with an advisory note.
const MAX_TOOL_RESULT_BYTES: usize = 16_000;

fn truncate_tool_result(s: String) -> String {
    if s.len() <= MAX_TOOL_RESULT_BYTES {
        return s;
    }
    let mut end = MAX_TOOL_RESULT_BYTES;
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    format!(
        "{}\n\n[… result truncated — {} bytes total, showing first {}. Use more specific args to narrow output.]",
        &s[..end],
        s.len(),
        end,
    )
}

/// Build a corrective system message for when a tool call targets an
/// unknown/non-existent tool name.
fn unknown_tool_corrective(bad_name: &str, function_defs: &[serde_json::Value]) -> String {
    let valid_names: Vec<String> = function_defs
        .iter()
        .filter_map(|fd| fd.get("name").and_then(|n| n.as_str()).map(String::from))
        .collect();
    format!(
        "CORRECTIVE: The tool `{bad_name}` does not exist. It is NOT a valid tool. \
         Do NOT claim it worked. You MUST use only tools from this list: [{}]. \
         If none of these tools can do what you need, use `exec_shell` to run \
         a CLI command, or use the `browser` tool/skill to look up documentation. \
         Diagnose the failure and try a different approach.",
        valid_names.join(", ")
    )
}

// ---------------------------------------------------------------------------
// Tool-loop helpers (shared across all call variants)
// ---------------------------------------------------------------------------

/// A single tool invocation to be executed.
struct ToolInvocation {
    call_id: String,
    name: String,
    args_str: String,
}

/// Result of executing a single tool invocation.
struct ToolResult {
    call_id: String,
    name: String,
    result_json: String,
    failed: bool,
    record: ToolCallRecord,
}

/// Execute a single tool call, publish gateway events, and return the result.
async fn execute_tool(
    inv: &ToolInvocation,
    workspace: &std::path::Path,
    agent_id: &str,
    session_id: &Option<String>,
) -> ToolResult {
    let args: serde_json::Value =
        serde_json::from_str(&inv.args_str).unwrap_or(serde_json::json!({}));
    let args_summary = crate::utils::truncate_str(&inv.args_str, 200);

    crate::gateway::publish_event_json(&serde_json::json!({
        "type": "tool_start",
        "agent": agent_id,
        "session": session_id,
        "tool": inv.name,
    }));

    let timer = std::time::Instant::now();
    let result = tools::call_skill(&inv.name, args, workspace).await;
    let elapsed = timer.elapsed().as_millis() as u64;

    let (result_json, failed, error) = match result {
        Ok(v) => (serde_json::to_string(&v).unwrap_or_default(), false, None),
        Err(e) => {
            let err_msg = format!("{e}");
            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "tool_error",
                "agent": agent_id,
                "session": session_id,
                "tool": inv.name,
                "error": err_msg,
            }));
            (
                serde_json::to_string(&serde_json::json!({"error": &err_msg})).unwrap_or_default(),
                true,
                Some(err_msg),
            )
        }
    };

    crate::gateway::publish_event_json(&serde_json::json!({
        "type": "tool_end",
        "agent": agent_id,
        "session": session_id,
        "tool": inv.name,
    }));

    ToolResult {
        call_id: inv.call_id.clone(),
        name: inv.name.clone(),
        result_json,
        failed,
        record: ToolCallRecord {
            tool: inv.name.clone(),
            args_summary,
            success: !failed,
            duration_ms: elapsed,
            error,
        },
    }
}

/// Emit a token_usage gateway event and accumulate into the receipt.
fn emit_and_accumulate_usage(
    usage: &Option<TokenUsage>,
    agent_id: &str,
    receipt_tokens: &mut TokenUsageSummary,
) {
    if let Some(ref u) = usage {
        receipt_tokens.accumulate(u);
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "token_usage",
            "agent": agent_id,
            "prompt_tokens": u.prompt_tokens,
            "completion_tokens": u.completion_tokens,
            "total_tokens": u.total_tokens,
        }));
    }
}

/// Re-query the provider and update tracking state.
async fn requery_provider(
    manager: &ProviderManager,
    messages: &[ChatMessage],
    function_defs: &[serde_json::Value],
    agent_id: &str,
    session_id: Option<&str>,
    receipt_tokens: &mut TokenUsageSummary,
    receipt_model_calls: &mut u32,
) -> anyhow::Result<ProviderResponse> {
    emit_model_request_debug(agent_id, session_id, messages, function_defs);
    let (new_resp, loop_usage) = manager
        .send_chat_with_functions(messages, function_defs)
        .await
        .context("model call failed (tool loop)")?;
    *receipt_model_calls += 1;
    emit_and_accumulate_usage(&loop_usage, agent_id, receipt_tokens);
    Ok(new_resp)
}

/// Check if the last tool call was an unknown-tool error. If so, inject a
/// corrective message and bump the counter. Returns true if the loop should
/// break (3 consecutive unknown-tool calls).
fn handle_unknown_tool(
    result: &ToolResult,
    consecutive_unknown_tool: &mut u32,
    messages: &mut Vec<ChatMessage>,
    function_defs: &[serde_json::Value],
) -> bool {
    if result.failed
        && result
            .record
            .error
            .as_deref()
            .is_some_and(|e| e.contains("unknown tool"))
    {
        *consecutive_unknown_tool += 1;
        messages.push(ChatMessage::system(unknown_tool_corrective(
            &result.name,
            function_defs,
        )));
        if *consecutive_unknown_tool >= 3 {
            warn!("3 consecutive unknown-tool calls — breaking loop");
            return true;
        }
    } else {
        *consecutive_unknown_tool = 0;
    }
    false
}

/// Return `true` when the user message looks conversational (greeting,
/// thanks, simple question) — i.e. unlikely to require tool invocation.
/// Used to skip the enforcement retry and avoid wasting a model call.
fn is_conversational(msg: &str) -> bool {
    let lower = msg.trim().to_lowercase();
    let word_count = lower.split_whitespace().count();
    // Very short messages are almost always conversational.
    if word_count <= 3 {
        let starters = [
            "hi",
            "hello",
            "hey",
            "thanks",
            "thank you",
            "thx",
            "bye",
            "ok",
            "okay",
            "sure",
            "yes",
            "no",
            "yep",
            "nope",
            "cool",
            "great",
            "good",
            "nice",
            "awesome",
            "perfect",
            "got it",
            "what",
            "who",
            "how are you",
            "how's it going",
        ];
        if starters.iter().any(|s| lower.starts_with(s)) {
            return true;
        }
    }
    false
}

/// Global counter of in-flight agent turns.
static IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

/// Ring buffer of recent model request debug payloads (disk-backed).
/// Keyed by a unique request_id. Keeps the last 50 payloads in memory,
/// persisted to `pinchy_home()/debug_payloads.jsonl` so they survive restarts.
static DEBUG_PAYLOADS: std::sync::LazyLock<
    std::sync::Mutex<VecDeque<(String, serde_json::Value)>>,
> = std::sync::LazyLock::new(|| {
    let mut buf = VecDeque::new();
    let path = debug_payloads_path();
    if let Ok(contents) = std::fs::read_to_string(&path) {
        for line in contents.lines() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
                    buf.push_back((id.to_string(), v));
                }
            }
        }
        // Keep only the last N entries.
        while buf.len() > MAX_DEBUG_PAYLOADS {
            buf.pop_front();
        }
    }
    std::sync::Mutex::new(buf)
});

const MAX_DEBUG_PAYLOADS: usize = 50;

fn debug_payloads_path() -> std::path::PathBuf {
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
            })
        })
        .collect()
}

fn emit_model_request_debug(
    agent_id: &str,
    session: Option<&str>,
    messages: &[ChatMessage],
    function_defs: &[serde_json::Value],
) {
    warn!(
        agent = agent_id,
        msgs = messages.len(),
        fns = function_defs.len(),
        "emit_model_request_debug: broadcasting model_request event"
    );
    let request_id = format!(
        "dbg_{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );

    let api_messages = crate::models::serialize_messages(messages);
    let fn_names: Vec<&str> = function_defs
        .iter()
        .filter_map(|f| f.get("name").and_then(|n| n.as_str()))
        .collect();
    let total_tokens = crate::context::estimate_total(messages);
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

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
    });

    // Store full payload in ring buffer.
    if let Ok(mut store) = DEBUG_PAYLOADS.lock() {
        if store.len() >= MAX_DEBUG_PAYLOADS {
            store.pop_front();
        }
        store.push_back((request_id.clone(), full_payload.clone()));
    }

    // Persist to disk (append one JSONL line).
    if let Ok(mut line) = serde_json::to_string(&full_payload) {
        line.push('\n');
        let path = debug_payloads_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
    }

    // Broadcast lightweight summary (full payload fetched on demand via REST).
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
    }));
}

/// Returns the number of agent turns currently executing.
pub fn in_flight_count() -> usize {
    IN_FLIGHT.load(Ordering::Relaxed)
}

/// Wait until all in-flight agent turns have completed, polling at
/// the given interval.  Returns after `timeout` even if turns remain.
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

// ---------------------------------------------------------------------------
// Turn receipt types
// ---------------------------------------------------------------------------

/// Record of a single tool invocation within a turn.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolCallRecord {
    /// Tool / skill name.
    pub tool: String,
    /// Compact summary of the arguments (truncated).
    pub args_summary: String,
    /// Whether the call succeeded.
    pub success: bool,
    /// Wall-clock duration in milliseconds.
    pub duration_ms: u64,
    /// Optional error message on failure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Receipt summarising a completed agent turn.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TurnReceipt {
    /// Agent that ran.
    pub agent: String,
    /// Session id (if any).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    /// Unix-epoch timestamp (ms) when the turn started.
    pub started_at: u64,
    /// Wall-clock duration of the entire turn in milliseconds.
    pub duration_ms: u64,
    /// Condensed user prompt (first 200 chars).
    pub user_prompt: String,
    /// Individual tool calls executed during this turn.
    pub tool_calls: Vec<ToolCallRecord>,
    /// Cumulative token usage across all model calls in this turn.
    pub tokens: TokenUsageSummary,
    /// Number of model round-trips (initial + retries + tool-loop iterations).
    pub model_calls: u32,
    /// Condensed final reply (first 200 chars).
    pub reply_summary: String,
}

/// Aggregated token counts for a turn.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct TokenUsageSummary {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

impl TokenUsageSummary {
    fn accumulate(&mut self, usage: &TokenUsage) {
        self.prompt_tokens += usage.prompt_tokens;
        self.completion_tokens += usage.completion_tokens;
        self.total_tokens += usage.total_tokens;
    }
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/// A running agent instance.
pub struct Agent {
    /// Unique agent identifier (matches config).
    pub id: String,
    /// Agent root directory (e.g. `agents/<id>`).
    /// Contains SOUL.md, TOOLS.md, HEARTBEAT.md.
    pub agent_root: PathBuf,
    /// Runtime workspace directory (`agent_root/workspace`).
    /// Tools, sessions, and file operations are sandboxed here.
    pub workspace: PathBuf,
    /// Provider kind (e.g. "openai", "copilot").
    pub provider: String,
    /// Model id this agent should use for LLM calls.
    pub model_id: String,
    /// Active session id (loaded from `CURRENT_SESSION` file).
    pub current_session: Option<String>,
    /// Max tool-call iterations per turn.
    pub max_tool_iterations: usize,
    /// Skill IDs this agent has opted into.
    pub enabled_skills: Option<Vec<String>>,
    /// Ordered fallback model config ids (resolved at construction).
    pub fallback_models: Vec<String>,
    /// The original model config id reference (for fallback chain resolution).
    pub model_config_ref: Option<String>,
}

impl Agent {
    // -- construction -------------------------------------------------------

    /// Create a new agent bound to the given workspace directory.
    ///
    /// Uses hard-coded defaults (`provider = "openai"`, `model_id =
    /// "openai-default"`).  Prefer [`new_from_config`](Agent::new_from_config)
    /// when a loaded [`Config`] is available.
    pub fn new(id: impl Into<String>, agent_root: impl Into<PathBuf>) -> Self {
        let agent_root = agent_root.into();
        let workspace = agent_root.join("workspace");
        let current_session = SessionStore::load_current(&workspace);
        Self {
            id: id.into(),
            agent_root,
            workspace,
            provider: "openai".to_string(),
            model_id: "openai-default".to_string(),
            current_session,
            max_tool_iterations: 25,
            enabled_skills: None,
            fallback_models: Vec::new(),
            model_config_ref: None,
        }
    }

    /// Create an agent from a parsed [`AgentConfig`] entry, resolving the
    /// model reference against the top-level [`Config::models`] list.
    ///
    /// If `agent_cfg.model` matches a [`ModelConfig::id`] in `cfg.models`,
    /// the provider and model name are taken from that entry.  Otherwise
    /// the same defaults as [`Agent::new`] are used.
    pub fn new_from_config(
        agent_cfg: &crate::config::AgentConfig,
        cfg: &crate::config::Config,
    ) -> Self {
        let agent_root = PathBuf::from(&agent_cfg.root);
        let workspace = agent_root.join("workspace");
        let (provider, model_id) = if let Some(ref model_ref) = agent_cfg.model {
            if let Some(mc) = cfg.models.iter().find(|m| m.id == *model_ref) {
                (
                    mc.provider.clone(),
                    mc.model.clone().unwrap_or_else(|| mc.id.clone()),
                )
            } else {
                ("openai".to_string(), "openai-default".to_string())
            }
        } else {
            ("openai".to_string(), "openai-default".to_string())
        };
        let current_session = SessionStore::load_current(&workspace);
        Self {
            id: agent_cfg.id.clone(),
            agent_root,
            workspace,
            provider,
            model_id,
            current_session,
            max_tool_iterations: agent_cfg.max_tool_iterations.unwrap_or(25),
            enabled_skills: agent_cfg.enabled_skills.clone(),
            fallback_models: agent_cfg.fallback_models.clone(),
            model_config_ref: agent_cfg.model.clone(),
        }
    }

    // -- session management --------------------------------------------------

    /// Start a new session: generate a nonce, write it to
    /// `CURRENT_SESSION` in the workspace, and update `current_session`.
    pub async fn start_session(&mut self) -> String {
        let id = crate::utils::generate_nonce();
        let _ = tokio::fs::create_dir_all(&self.workspace).await;
        let path = self.workspace.join("CURRENT_SESSION");
        let _ = tokio::fs::write(&path, &id).await;
        self.current_session = Some(id.clone());
        id
    }

    // -- init ---------------------------------------------------------------

    /// Spawn a background task for each configured agent.
    ///
    /// Subscribes to the global [`crate::comm`] message bus and dispatches
    /// messages to the matching agent based on `msg.agent_id` or the
    /// configured routing table.
    ///
    /// When `cancel` is triggered the dispatchers stop accepting new
    /// messages and in-flight turns are allowed to finish (tracked via
    /// the global `IN_FLIGHT` counter).
    pub fn init(
        cfg: &Config,
        bus: tokio::sync::broadcast::Sender<IncomingMessage>,
        cancel: CancellationToken,
    ) {
        let routing = cfg.routing.clone().unwrap_or_default();

        // Capture the first configured agent id as the fallback default.
        let default_agent = cfg.agents.first().map(|a| a.id.clone());

        // Spawn a dispatcher for each configured agent.
        for agent_cfg in &cfg.agents {
            let agent_id = agent_cfg.id.clone();
            let agent_root = PathBuf::from(&agent_cfg.root);
            let runtime_workspace = agent_root.join("workspace");
            let agent = Arc::new(Mutex::new(Agent::new_from_config(agent_cfg, cfg)));

            // Ensure runtime workspace directory exists (fire-and-forget).
            let ws = runtime_workspace.clone();
            tokio::spawn(async move {
                if let Err(e) = fs::create_dir_all(&ws).await {
                    warn!(path = %ws.display(), error = %e, "failed to create agent workspace");
                }
            });

            let mut rx = bus.subscribe();
            let routing = routing.clone();
            let agent_id_clone = agent_id.clone();
            let default_agent = default_agent.clone();
            let cancel = cancel.clone();

            tokio::spawn(async move {
                debug!(agent = %agent_id_clone, "agent dispatcher started");
                loop {
                    tokio::select! {
                        _ = cancel.cancelled() => {
                            debug!(agent = %agent_id_clone, "agent dispatcher received shutdown signal");
                            break;
                        }
                        result = rx.recv() => {
                    match result {
                        Ok(msg) => {
                            // Determine if this message is for this agent.
                            let target_agent = if let Some(ref id) = msg.agent_id {
                                if id.is_empty() {
                                    None
                                } else {
                                    Some(id.clone())
                                }
                            } else {
                                // Try routing table: channel
                                let key = msg.channel.clone();
                                routing
                                    .channels
                                    .get(&key)
                                    .cloned()
                                    .or_else(|| routing.default_agent.clone())
                            };

                            if let Some(target) = target_agent {
                                if target != agent_id_clone {
                                    continue;
                                }
                            } else {
                                // No routing resolved — only the default agent handles these.
                                match default_agent {
                                    Some(ref def) if def == &agent_id_clone => {}
                                    _ => continue,
                                }
                            }

                            let agent = Arc::clone(&agent);
                            tokio::spawn(async move {
                                IN_FLIGHT.fetch_add(1, Ordering::Relaxed);
                                struct InFlightGuard;
                                impl Drop for InFlightGuard {
                                    fn drop(&mut self) {
                                        IN_FLIGHT.fetch_sub(1, Ordering::Relaxed);
                                    }
                                }
                                let _guard = InFlightGuard;
                                let mut guard = agent.lock().await;
                                let result = guard.run_turn(msg.clone()).await;
                                // _guard is dropped here (or on panic), ensuring IN_FLIGHT is decremented.
                                match result {
                                    Ok(reply) => {
                                        info!(reply_len = reply.len(), "agent turn completed");
                                        let channel = msg.channel.clone();
                                        let reply_clone = reply.clone();
                                        let reply_agent = guard.id.clone();
                                        let reply_session = guard.current_session.clone();
                                        tokio::spawn(async move {
                                            let ctx = crate::discord::ReplyContext {
                                                agent_id: reply_agent,
                                                session_id: reply_session,
                                            };
                                            let ch = channel.clone();
                                            let rp = reply_clone.clone();
                                            let send_result = crate::discord::CURRENT_REPLY_CONTEXT
                                                .scope(ctx.clone(), async move {
                                                    crate::comm::send_reply(&ch, &rp).await
                                                })
                                                .await;
                                            if send_result.is_err() {
                                                // If the channel is a cron job or heartbeat,
                                                // broadcast the reply via the gateway so it
                                                // appears in the web UI session view instead
                                                // of falling back to a Discord channel.
                                                if channel.starts_with("cron:") || channel == "heartbeat" {
                                                    crate::gateway::publish_event_json(&serde_json::json!({
                                                        "type": "agent_reply",
                                                        "agent": ctx.agent_id,
                                                        "session": ctx.session_id,
                                                        "channel": channel,
                                                        "text": reply_clone,
                                                    }));
                                                } else {
                                                    warn!(channel = %channel, "failed to send reply (no matching connector)");
                                                }
                                            }
                                        });
                                    }
                                    Err(e) => {
                                        warn!(error = %e, "agent turn failed");
                                    }
                                }
                            });
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            warn!(skipped = n, "agent dispatch lagged, dropped messages");
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                            debug!("message bus closed, agent dispatcher exiting");
                            break;
                        }
                    }
                        } // end select recv arm
                    } // end tokio::select!
                }
            });
        }

        debug!("agent module loaded");
    }

    // -- bootstrap ----------------------------------------------------------

    /// Read optional markdown files from the agent workspace and
    /// concatenate their contents into a single system bootstrap string.
    ///
    /// Files checked: `SOUL.md`, `TOOLS.md`,  Missing
    /// files are silently skipped.
    pub async fn load_bootstrap(&self) -> anyhow::Result<String> {
        let names = ["SOUL.md", "TOOLS.md"];
        let mut parts: Vec<String> = Vec::new();

        for name in &names {
            let path = self.agent_root.join(name);
            match fs::read_to_string(&path).await {
                Ok(content) => {
                    debug!(file = %path.display(), "loaded bootstrap file");
                    parts.push(format!("# {name}\n\n{content}"));
                }
                Err(_) => {
                    debug!(file = %path.display(), "bootstrap file not found, skipping");
                }
            }
        }

        Ok(parts.join("\n\n---\n\n"))
    }

    /// Load recent session history from persisted JSONL files.
    ///
    /// Reads all files in `sessions/`, sorts ascending by filename (timestamp),
    /// parses each line as JSON, and converts into [`ChatMessage`]s.
    /// Returns at most the last `max_messages` messages.
    async fn load_history(&self, max_messages: usize) -> anyhow::Result<Vec<ChatMessage>> {
        // If an active session exists, delegate to SessionStore.
        if let Some(ref session_id) = self.current_session {
            let exchanges =
                SessionStore::load_history(&self.workspace, session_id, max_messages).await?;
            let messages: Vec<ChatMessage> = exchanges
                .into_iter()
                .filter(|ex| ex.role == "user" || ex.role == "assistant")
                .map(|ex| ChatMessage::new(ex.role, ex.content))
                .collect();

            return Ok(messages);
        }

        // Legacy: load all session files.
        let sessions_dir = self.workspace.join("sessions");
        let mut entries: Vec<PathBuf> = Vec::new();

        let mut rd = match fs::read_dir(&sessions_dir).await {
            Ok(rd) => rd,
            Err(_) => return Ok(Vec::new()), // no sessions dir yet
        };

        while let Some(entry) = rd.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                entries.push(path);
            }
        }

        entries.sort(); // filenames are timestamps → chronological order

        let mut all: Vec<ChatMessage> = Vec::new();
        for path in &entries {
            let content = match fs::read_to_string(path).await {
                Ok(c) => c,
                Err(_) => continue,
            };
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    let role = v["role"].as_str().unwrap_or("user").to_string();
                    let content = v["content"].as_str().unwrap_or_default().to_string();
                    if role == "user" || role == "assistant" {
                        all.push(ChatMessage::new(role, content));
                    }
                }
            }
        }

        // Keep only the last max_messages
        if all.len() > max_messages {
            all = all.split_off(all.len() - max_messages);
        }
        Ok(all)
    }

    // NOTE: exec_permitted() removed — exec/exec_shell are now
    // accepted unconditionally (no TOOLS.md gating).

    // -- turn execution -----------------------------------------------------

    /// Execute a single conversation turn driven by an [`IncomingMessage`]:
    ///
    /// 1. Read `SOUL.md` from the workspace (if present) as system prompt.
    /// 2. Build `[system, user]` message list.
    /// 3. Call [`send_chat_messages`].
    /// 4. Persist user + assistant messages to a JSONL session file.
    /// 5. Return the assistant reply.
    pub async fn run_turn(&mut self, msg: IncomingMessage) -> anyhow::Result<String> {
        // If the message carries an explicit session override (e.g. from a
        // cron fire), use that session id without touching CURRENT_SESSION
        // on disk.  We save and restore the agent's session pointer so the
        // override is truly scoped to this single turn.
        let session_override = msg.session_id.clone();
        let saved_session = if session_override.is_some() {
            let prev = self.current_session.clone();
            self.current_session = session_override.clone();

            // Ensure the session directory exists.
            let _ = tokio::fs::create_dir_all(self.workspace.join("sessions")).await;

            info!(
                agent = %self.id,
                session = ?session_override,
                "using session override for this turn"
            );

            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "session_created",
                "agent": self.id,
                "session": session_override,
            }));

            Some(prev)
        } else {
            // Normal path: reload CURRENT_SESSION from disk so external
            // writes take effect.
            self.current_session = SessionStore::load_current_async(&self.workspace).await;

            // Auto-create a session if none is active.
            if self.current_session.is_none() {
                let new_id = self.start_session().await;
                info!(agent = %self.id, session = %new_id, "auto-created new session");

                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "session_created",
                    "agent": self.id,
                    "session": new_id,
                }));
            }

            None
        };

        // Load config once for the whole turn — avoids 3× disk reads.
        let config_path = crate::pinchy_home().join("config.yaml");
        let turn_cfg = crate::config::Config::load(&config_path).await.ok();

        // Helper: build a ProviderManager from agent state + config.
        // Called twice because ProviderManager holds trait objects and isn't
        // Clone — once for the turn, once for the global embedding accessor.
        let build_pm = |cfg: Option<&crate::config::Config>| -> ProviderManager {
            if self.fallback_models.is_empty() {
                build_provider_manager(&self.provider, &self.model_id)
            } else {
                let agent_cfg = crate::config::AgentConfig {
                    id: self.id.clone(),
                    root: self.agent_root.display().to_string(),
                    model: self.model_config_ref.clone(),
                    heartbeat_secs: None,
                    cron_jobs: Vec::new(),
                    max_tool_iterations: Some(self.max_tool_iterations),
                    enabled_skills: self.enabled_skills.clone(),
                    fallback_models: self.fallback_models.clone(),
                    webhook_secret: None,
                    extra_exec_commands: Vec::new(),
                    history_messages: None,
                    max_turns: None,
                    timezone: None,
                };
                match cfg {
                    Some(c) => crate::models::build_provider_manager_from_config(&agent_cfg, c),
                    None => build_provider_manager(&self.provider, &self.model_id),
                }
            }
        };

        let manager = build_pm(turn_cfg.as_ref());

        // Stash the providers globally so tools (e.g. semantic memory)
        // can embed text without plumbing.
        crate::models::set_global_providers(std::sync::Arc::new(build_pm(turn_cfg.as_ref())));

        let result = self
            .run_turn_with_provider(msg, &manager, turn_cfg.as_ref())
            .await;

        // Restore original session pointer if we were using an override.
        if let Some(prev) = saved_session {
            self.current_session = prev;
        }

        result
    }

    /// Like [`run_turn`](Agent::run_turn) but accepts an explicit
    /// [`ProviderManager`] (useful for testing).
    pub async fn run_turn_with_provider(
        &mut self,
        msg: IncomingMessage,
        manager: &ProviderManager,
        turn_cfg: Option<&Config>,
    ) -> anyhow::Result<String> {
        // 1. System bootstrap (SOUL.md primarily)
        let bootstrap = self.load_bootstrap().await?;

        // Emit typing indicator start.
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "typing_start",
            "agent": self.id,
            "session": self.current_session,
        }));

        // 2. Build message list
        let mut messages: Vec<ChatMessage> = Vec::new();

        if !bootstrap.is_empty() {
            messages.push(ChatMessage::system(bootstrap));
        }

        // Inject current date/time with timezone context.
        {
            let tz = turn_cfg
                .map(|cfg| cfg.resolve_timezone(&self.id))
                .unwrap_or(chrono_tz::UTC);
            let now = chrono::Utc::now().with_timezone(&tz);
            let time_ctx = format!(
                "Current date and time: {} ({}).",
                now.format("%A, %B %-d, %Y %H:%M %Z"),
                tz,
            );
            messages.push(ChatMessage::system(time_ctx));
        }

        // Inject skill instructions from the unified tool registry.
        let skill_prompt = crate::tools::prompt_instructions(self.enabled_skills.as_deref());
        if !skill_prompt.is_empty() {
            messages.push(ChatMessage::system(skill_prompt));
        }

        // Inject tools metadata so the model knows which skills are available.
        // Only inject the fenced-JSON tool catalogue when the provider does
        // NOT support native function-calling.  When function-calling is
        // available, the model receives the tool schemas via the API's
        // `tools` / `functions` parameter — injecting BOTH creates two
        // competing calling conventions that confuse the model.
        let tool_metas = tools::list_tools_core();
        if !tool_metas.is_empty() && !manager.supports_functions {
            let tools_json =
                serde_json::to_string_pretty(&tool_metas).unwrap_or_else(|_| "[]".to_string());
            messages.push(ChatMessage::system(
                format!(
                    "The following tools are available. Use TOOL_CALL with the correct name and args.\n\n\
                     ```tools_metadata\n{tools_json}\n```",
                ),
            ));
        }

        // Inject recent session history for conversational context.
        let history_limit = turn_cfg
            .and_then(|cfg| {
                cfg.agents
                    .iter()
                    .find(|a| a.id == self.id)
                    .and_then(|a| a.history_messages)
            })
            .unwrap_or(40);
        let history = self.load_history(history_limit).await.unwrap_or_default();
        messages.extend(history);

        messages.push(ChatMessage::user(msg.content.clone()));

        // 2b. Context window management: prune old tool results and
        //     compact if over budget.
        let mut budget = crate::context::ContextBudget::default();
        if let Some(max_turns) = turn_cfg.and_then(|cfg| {
            cfg.agents
                .iter()
                .find(|a| a.id == self.id)
                .and_then(|a| a.max_turns)
        }) {
            budget.max_turns = max_turns;
        }
        crate::context::manage_context(&mut messages, &budget, manager).await;

        // 3. Build function definitions for function-calling providers.
        //    Starts with core tools; deferred tools are auto-injected when
        //    relevant keywords are detected in the user message.
        let mut function_defs: Vec<serde_json::Value> = tool_metas
            .iter()
            .map(|meta| {
                serde_json::json!({
                    "name": meta.name,
                    "description": meta.description,
                    "parameters": meta.args_schema,
                })
            })
            .collect();

        // 3a. Auto-pluck: scan the user message for domain keywords and
        //     inject matching deferred tools automatically.
        //     We scan recent messages of ALL roles (user, assistant, tool)
        //     so that follow-up messages like "try again" or "enumerate
        //     the tools" still pluck tools used in prior turns.
        {
            let mut pluck_text = msg.content.clone();
            // Scan last 5 user messages.
            for m in messages.iter().rev().filter(|m| m.is_user()).take(5) {
                pluck_text.push(' ');
                pluck_text.push_str(&m.content);
            }
            // Scan last 3 assistant messages (contain tool names / results).
            for m in messages.iter().rev().filter(|m| m.is_assistant()).take(3) {
                pluck_text.push(' ');
                pluck_text.push_str(&m.content);
                // Also extract tool names from tool_calls metadata.
                if let Some(ref tcs) = m.tool_calls {
                    for tc in tcs {
                        if let Some(name) = tc
                            .get("function")
                            .and_then(|f| f.get("name"))
                            .and_then(|n| n.as_str())
                        {
                            pluck_text.push(' ');
                            pluck_text.push_str(name);
                        }
                    }
                }
            }
            // Scan last 3 tool-role messages (contain tool result content).
            for m in messages.iter().rev().filter(|m| m.is_tool()).take(3) {
                pluck_text.push(' ');
                pluck_text.push_str(&m.content);
            }
            let plucked = tools::auto_pluck_deferred(&pluck_text);
            let existing_names: std::collections::HashSet<String> = function_defs
                .iter()
                .filter_map(|fd| fd.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect();
            for meta in &plucked {
                if !existing_names.contains(&meta.name) {
                    function_defs.push(serde_json::json!({
                        "name": meta.name,
                        "description": meta.description,
                        "parameters": meta.args_schema,
                    }));
                }
            }
            if !plucked.is_empty() {
                debug!(
                    count = plucked.len(),
                    tools = ?plucked.iter().map(|m| &m.name).collect::<Vec<_>>(),
                    "auto-plucked deferred tools from user message"
                );
            }
        }

        // --- Receipt tracking state -----------------------------------------
        let turn_start = SystemTime::now();
        let turn_start_ms = turn_start
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let mut receipt_tool_calls: Vec<ToolCallRecord> = Vec::new();
        let mut receipt_tokens = TokenUsageSummary::default();
        let mut receipt_model_calls: u32 = 0;

        // 3a. Call model via provider manager (tries function-calling first).
        emit_model_request_debug(
            &self.id,
            self.current_session.as_deref(),
            &messages,
            &function_defs,
        );
        let (mut response, usage) = manager
            .send_chat_with_functions(&messages, &function_defs)
            .await
            .context("model call failed")?;
        receipt_model_calls += 1;

        emit_and_accumulate_usage(&usage, &self.id, &mut receipt_tokens);

        // 3a-enforce. Enforcement retry: if the provider returned plain text
        // but function definitions exist and the provider supports functions,
        // nudge the model with a corrective system message (one retry only).
        //
        // Skip enforcement when the user's message is clearly conversational
        // (greeting, thanks, simple question) — forcing tool use on these
        // wastes a model round-trip.
        if let ProviderResponse::Final(ref text) = response {
            let needs_enforcement = !function_defs.is_empty()
                && manager.supports_functions
                && !is_tool_call_only(text)
                && !is_conversational(&msg.content);
            if needs_enforcement {
                debug!("enforcement retry: provider returned final text but tools are available, sending corrective message");

                // Build a tool-aware corrective message so the model knows
                // about specialised tools (e.g. create_cron_job) instead of
                // falling back to generic write_file/exec_shell.
                let available_tool_names: Vec<String> = function_defs
                    .iter()
                    .filter_map(|fd| fd.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect();
                let corrective = format!(
                    "CORRECTIVE: You MUST use a tool call to fulfil this request — do not respond \
                     with plain text alone. Choose the most appropriate tool from the available set: \
                     [{}]. Prefer specialised tools (e.g. create_cron_job for scheduling, \
                     save_memory for remembering facts) over generic ones (write_file, exec_shell).",
                    available_tool_names.join(", ")
                );
                messages.push(ChatMessage::system(corrective));
                emit_model_request_debug(
                    &self.id,
                    self.current_session.as_deref(),
                    &messages,
                    &function_defs,
                );
                match manager
                    .send_chat_with_functions(&messages, &function_defs)
                    .await
                {
                    Ok((retry_resp, retry_usage)) => {
                        receipt_model_calls += 1;
                        let produced_tool = matches!(
                            retry_resp,
                            ProviderResponse::FunctionCall { .. }
                                | ProviderResponse::MultiFunctionCall(_)
                        ) || matches!(&retry_resp, ProviderResponse::Final(t) if is_tool_call_only(t));
                        debug!(
                            produced_tool_call = produced_tool,
                            "enforcement retry completed"
                        );
                        response = retry_resp;
                        emit_and_accumulate_usage(&retry_usage, &self.id, &mut receipt_tokens);
                    }
                    Err(e) => {
                        warn!(error = %e, "enforcement retry failed, using original response");
                    }
                }
                // Remove the corrective message so it doesn't pollute the
                // tool-loop conversation.
                messages.pop();
            }
        }

        // 3b. exec/exec_shell are now allowed unconditionally (no TOOLS.md gating).

        // 3c. Tool-invocation loop
        let max_iters = self.max_tool_iterations;

        // Track consecutive unknown-tool failures to detect spin loops.
        let mut consecutive_unknown_tool: u32 = 0;

        for _iter in 0..max_iters {
            // ── Fenced-JSON tool call (non-function-calling providers) ──
            if let ProviderResponse::Final(ref text) = response {
                let Some((json_str, remaining)) = extract_tool_call_block(text) else {
                    break;
                };

                let tool_req: ToolRequest = match serde_json::from_str(&json_str) {
                    Ok(r) => r,
                    Err(e) => {
                        warn!(error = %e, "failed to parse TOOL_CALL JSON, stopping loop");
                        break;
                    }
                };

                debug!(tool = %tool_req.name, "invoking tool (fenced)");

                let inv = ToolInvocation {
                    call_id: format!("call_{}", uuid_like_id()),
                    name: tool_req.name.clone(),
                    args_str: serde_json::to_string(&tool_req.args).unwrap_or_default(),
                };
                let tr = execute_tool(&inv, &self.workspace, &self.id, &self.current_session).await;

                // Echo the assistant's tool-call block.
                messages.push(ChatMessage::assistant(text.clone()));

                // Feed the tool result back so the model can see what happened.
                messages.push(ChatMessage::user(format!(
                    "[Tool Result for {}]: {}",
                    tr.name,
                    truncate_tool_result(tr.result_json.clone())
                )));

                // If there was remaining assistant text, preserve it.
                if !remaining.is_empty() {
                    messages.push(ChatMessage::assistant(remaining));
                }

                if handle_unknown_tool(
                    &tr,
                    &mut consecutive_unknown_tool,
                    &mut messages,
                    &function_defs,
                ) {
                    receipt_tool_calls.push(tr.record);
                    break;
                }
                receipt_tool_calls.push(tr.record);

                response = requery_provider(
                    manager,
                    &messages,
                    &function_defs,
                    &self.id,
                    self.current_session.as_deref(),
                    &mut receipt_tokens,
                    &mut receipt_model_calls,
                )
                .await?;
                continue;
            }

            // ── Single function call ──
            if let ProviderResponse::FunctionCall {
                ref id,
                ref name,
                ref arguments,
            } = response
            {
                let fc_id = if id.is_empty() {
                    format!("call_{}", uuid_like_id())
                } else {
                    id.clone()
                };

                debug!(tool = %name, "invoking tool (function-call)");

                let inv = ToolInvocation {
                    call_id: fc_id.clone(),
                    name: name.clone(),
                    args_str: arguments.clone(),
                };
                let tr = execute_tool(&inv, &self.workspace, &self.id, &self.current_session).await;

                // Append assistant message with proper tool_calls metadata.
                messages.push(ChatMessage {
                    role: "assistant".into(),
                    content: String::new(),
                    tool_calls: Some(vec![serde_json::json!({
                        "id": fc_id,
                        "type": "function",
                        "function": {
                            "name": name,
                            "arguments": arguments,
                        }
                    })]),
                    tool_call_id: None,
                });
                // Append tool result with matching tool_call_id.
                messages.push(ChatMessage {
                    role: "tool".into(),
                    content: truncate_tool_result(tr.result_json.clone()),
                    tool_calls: None,
                    tool_call_id: Some(fc_id),
                });

                if handle_unknown_tool(
                    &tr,
                    &mut consecutive_unknown_tool,
                    &mut messages,
                    &function_defs,
                ) {
                    receipt_tool_calls.push(tr.record);
                    break;
                }
                receipt_tool_calls.push(tr.record);

                response = requery_provider(
                    manager,
                    &messages,
                    &function_defs,
                    &self.id,
                    self.current_session.as_deref(),
                    &mut receipt_tokens,
                    &mut receipt_model_calls,
                )
                .await?;
                continue;
            }

            // ── Multiple function calls (parallel) ──
            if let ProviderResponse::MultiFunctionCall(ref calls) = response {
                let invocations: Vec<ToolInvocation> = calls
                    .iter()
                    .map(|c| ToolInvocation {
                        call_id: if c.id.is_empty() {
                            format!("call_{}", uuid_like_id())
                        } else {
                            c.id.clone()
                        },
                        name: c.name.clone(),
                        args_str: c.arguments.clone(),
                    })
                    .collect();

                // Push the assistant message with all tool_calls up-front.
                let tc_json: Vec<serde_json::Value> = invocations
                    .iter()
                    .map(|inv| {
                        serde_json::json!({
                            "id": inv.call_id,
                            "type": "function",
                            "function": {
                                "name": inv.name,
                                "arguments": inv.args_str,
                            }
                        })
                    })
                    .collect();
                messages.push(ChatMessage {
                    role: "assistant".into(),
                    content: String::new(),
                    tool_calls: Some(tc_json),
                    tool_call_id: None,
                });

                // Execute all tool calls concurrently.
                let ws = self.workspace.clone();
                let agent_id = self.id.clone();
                let session_id = self.current_session.clone();

                let mut handles = Vec::new();
                for inv in invocations {
                    let ws = ws.clone();
                    let agent_id = agent_id.clone();
                    let session_id = session_id.clone();
                    handles.push(tokio::spawn(async move {
                        execute_tool(&inv, &ws, &agent_id, &session_id).await
                    }));
                }

                // Collect results.
                for handle in handles {
                    match handle.await {
                        Ok(tr) => {
                            messages.push(ChatMessage {
                                role: "tool".into(),
                                content: truncate_tool_result(tr.result_json),
                                tool_calls: None,
                                tool_call_id: Some(tr.call_id),
                            });
                            receipt_tool_calls.push(tr.record);
                        }
                        Err(join_err) => {
                            warn!("tool task panicked: {join_err}");
                        }
                    }
                }

                response = requery_provider(
                    manager,
                    &messages,
                    &function_defs,
                    &self.id,
                    self.current_session.as_deref(),
                    &mut receipt_tokens,
                    &mut receipt_model_calls,
                )
                .await?;
                continue;
            }

            // Not a tool call — nothing more to do.
            break;
        }

        let final_reply = match response {
            ProviderResponse::Final(text) => {
                self.stream_reply_to_gateway(&text).await;
                text
            }
            ProviderResponse::FunctionCall {
                name, arguments, ..
            } => {
                let t = format!("[tool loop exhausted] last call: {}({})", name, arguments);
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "stream_delta",
                    "agent": self.id,
                        "session": self.current_session,
                    "delta": t,
                    "done": true,
                }));
                t
            }
            ProviderResponse::MultiFunctionCall(calls) => {
                let names: Vec<&str> = calls.iter().map(|c| c.name.as_str()).collect();
                let t = format!("[tool loop exhausted] last calls: {}", names.join(", "));
                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "stream_delta",
                    "agent": self.id,
                        "session": self.current_session,
                    "delta": t,
                    "done": true,
                }));
                t
            }
        };

        // 4. Persist exchange to sessions/<timestamp>.jsonl
        self.persist_exchange(&msg, &final_reply).await?;

        // 5. Build and persist turn receipt.
        let turn_duration = turn_start.elapsed().unwrap_or_default().as_millis() as u64;
        let receipt = TurnReceipt {
            agent: self.id.clone(),
            session: self.current_session.clone(),
            started_at: turn_start_ms,
            duration_ms: turn_duration,
            user_prompt: crate::utils::truncate_str(&msg.content, 200),
            tool_calls: receipt_tool_calls,
            tokens: receipt_tokens,
            model_calls: receipt_model_calls,
            reply_summary: crate::utils::truncate_str(&final_reply, 200),
        };

        self.persist_receipt(&receipt).await;

        crate::gateway::publish_event_json(
            &serde_json::to_value(&receipt)
                .map(|mut v| {
                    v.as_object_mut()
                        .unwrap()
                        .insert("type".into(), serde_json::json!("turn_receipt"));
                    v
                })
                .unwrap_or_else(|_| serde_json::json!({"type": "turn_receipt"})),
        );

        // Emit typing indicator stop.
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "typing_stop",
            "agent": self.id,
            "session": self.current_session,
        }));

        // 5. Return reply
        Ok(final_reply)
    }

    // -- streaming helper ---------------------------------------------------

    /// Stream a completed reply to the gateway as chunked deltas (fallback).
    ///
    /// Splits the text on sentence/paragraph boundaries and publishes
    /// each chunk as a `stream_delta` event.  The final event has
    /// `done: true`.
    async fn stream_reply_to_gateway(&self, text: &str) {
        const CHUNK_TARGET: usize = 12; // chars per chunk – small for visible streaming

        let chars: Vec<char> = text.chars().collect();
        if chars.len() <= CHUNK_TARGET {
            // Short reply — publish as one delta.
            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "stream_delta",
                "agent": self.id,
                    "session": self.current_session,
                "delta": text,
                "done": true,
            }));
            return;
        }

        let mut start = 0;
        while start < chars.len() {
            let end = (start + CHUNK_TARGET).min(chars.len());
            let break_at = if end < chars.len() {
                chars[start..end]
                    .iter()
                    .rposition(|c| *c == ' ' || *c == '\n')
                    .map(|p| start + p + 1)
                    .unwrap_or(end)
            } else {
                end
            };
            let chunk: String = chars[start..break_at].iter().collect();
            let is_last = break_at >= chars.len();

            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "stream_delta",
                "agent": self.id,
                    "session": self.current_session,
                "delta": chunk,
                "done": is_last,
            }));

            start = break_at;

            if !is_last {
                // Small delay between chunks for streaming effect.
                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
            }
        }
    }

    // -- persistence --------------------------------------------------------

    /// Append the user and assistant messages to the session file.
    ///
    /// When `CURRENT_SESSION` is active, delegates to
    /// [`SessionStore::append`]; otherwise falls back to legacy
    /// per-timestamp files.
    async fn persist_exchange(&self, msg: &IncomingMessage, reply: &str) -> anyhow::Result<()> {
        let dur = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let ts = dur.as_secs();
        let ts_ms = dur.as_millis() as u64;

        let user_exchange = Exchange {
            timestamp: ts_ms,
            role: "user".into(),
            content: msg.content.clone(),
            metadata: Some(serde_json::json!({
                "author": msg.author,
                "channel": msg.channel,
            })),
        };
        let assistant_exchange = Exchange {
            timestamp: ts_ms,
            role: "assistant".into(),
            content: reply.to_string(),
            metadata: None,
        };

        if let Some(ref session_id) = self.current_session {
            SessionStore::append(&self.workspace, session_id, &user_exchange).await?;
            SessionStore::append(&self.workspace, session_id, &assistant_exchange).await?;
        } else {
            // Legacy: write to per-timestamp file.
            let sessions_dir = self.workspace.join("sessions");
            fs::create_dir_all(&sessions_dir)
                .await
                .context("create sessions dir")?;

            let path = sessions_dir.join(format!("{ts}.jsonl"));

            let user_line = serde_json::to_string(&user_exchange)?;
            let assistant_line = serde_json::to_string(&assistant_exchange)?;

            use tokio::io::AsyncWriteExt;
            let mut file = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
                .await
                .with_context(|| format!("open session file {}", path.display()))?;

            file.write_all(user_line.as_bytes()).await?;
            file.write_all(b"\n").await?;
            file.write_all(assistant_line.as_bytes()).await?;
            file.write_all(b"\n").await?;

            debug!(path = %path.display(), "session exchange persisted");
        }

        // Publish session events so the UI sees them in real time.
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "session_message",
            "agent": self.id,
            "session": self.current_session,
            "role": "user",
            "content": msg.content,
            "timestamp": ts_ms
        }));
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "session_message",
            "agent": self.id,
            "session": self.current_session,
            "role": "assistant",
            "content": reply,
            "timestamp": ts_ms
        }));

        Ok(())
    }

    /// Persist a turn receipt to `sessions/<id>.receipts.jsonl` (or a
    /// standalone `receipts.jsonl` when no session is active).
    async fn persist_receipt(&self, receipt: &TurnReceipt) {
        let receipts_dir = self.workspace.join("sessions");
        if fs::create_dir_all(&receipts_dir).await.is_err() {
            return;
        }

        let filename = match &self.current_session {
            Some(sid) => format!("{sid}.receipts.jsonl"),
            None => "receipts.jsonl".into(),
        };
        let path = receipts_dir.join(filename);

        let line = match serde_json::to_string(receipt) {
            Ok(l) => l,
            Err(e) => {
                warn!(error = %e, "failed to serialise turn receipt");
                return;
            }
        };

        use tokio::io::AsyncWriteExt;
        match fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
        {
            Ok(mut f) => {
                let _ = f.write_all(line.as_bytes()).await;
                let _ = f.write_all(b"\n").await;
                debug!(path = %path.display(), "turn receipt persisted");
            }
            Err(e) => {
                warn!(error = %e, "failed to open receipts file");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// File backup + write helpers
// ---------------------------------------------------------------------------

/// Create a backup copy of `path` with a `.bak.<unix_timestamp>` suffix.
///
/// If the source file does not exist the call is a no-op and returns `Ok(())`.
pub async fn backup_file(path: &std::path::Path) -> anyhow::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut bak_name = path.file_name().unwrap_or_default().to_os_string();
    bak_name.push(format!(".bak.{ts}"));
    let bak_path = path.with_file_name(bak_name);
    fs::copy(path, &bak_path)
        .await
        .with_context(|| format!("backup {} -> {}", path.display(), bak_path.display()))?;
    debug!(src = %path.display(), dst = %bak_path.display(), "created backup");
    Ok(())
}

/// Backup the target file (if it exists) then write `contents` into it.
pub async fn write_with_backup(path: &std::path::Path, contents: &str) -> anyhow::Result<()> {
    backup_file(path).await?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.ok();
    }
    fs::write(path, contents)
        .await
        .with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

// Re-export parsing helpers for backward compatibility.
pub use crate::tools::parsing::{
    extract_fenced_json, extract_tool_call_block, is_tool_call_only, ToolRequest,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn temp_agent() -> (TempDir, Agent) {
        let dir = TempDir::new().unwrap();
        let agent = Agent::new("test-agent", dir.path().to_path_buf());
        (dir, agent)
    }

    #[tokio::test]
    async fn bootstrap_reads_existing_files() {
        let (dir, agent) = temp_agent();
        fs::write(dir.path().join("SOUL.md"), "I am a helpful bot.")
            .await
            .unwrap();
        let boot = agent.load_bootstrap().await.unwrap();
        assert!(boot.contains("I am a helpful bot."));
        assert!(boot.contains("# SOUL.md"));
    }

    #[tokio::test]
    async fn bootstrap_empty_when_no_files() {
        let (_dir, agent) = temp_agent();
        let boot = agent.load_bootstrap().await.unwrap();
        assert!(boot.is_empty());
    }

    #[tokio::test]
    async fn run_turn_persists_session() {
        let (dir, mut agent) = temp_agent();

        let msg = IncomingMessage {
            agent_id: Some("test-agent".into()),
            author: "tester".into(),
            content: "hello world".into(),
            channel: "test".into(),
            timestamp: 0,
            session_id: None,
        };

        let reply = agent.run_turn(msg).await.unwrap();
        assert!(!reply.is_empty());

        let sessions = dir.path().join("workspace").join("sessions");
        let mut entries: Vec<_> = std::fs::read_dir(&sessions)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.ends_with(".jsonl") && !name.ends_with(".receipts.jsonl")
            })
            .collect();
        assert_eq!(entries.len(), 1);

        let path = entries.remove(0).path();
        assert!(path.extension().unwrap() == "jsonl");

        let data = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = data.trim().lines().collect();
        assert_eq!(lines.len(), 2);

        let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first["role"], "user");
        assert_eq!(first["content"], "hello world");

        let second: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(second["role"], "assistant");
    }
}
