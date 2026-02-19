//! Agent runtime: manages agent identity, workspace bootstrap, session
//! history, and turn execution.
//!
//! Call [`Agent::init()`] once at startup to spawn a background task that
//! subscribes to the [`crate::comm`] message bus and dispatches incoming
//! messages to the appropriate agent instance.

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

/// When `search_tools` returns its JSON result, extract any discovered tool
/// schemas and append them to `function_defs` so the model can call them via
/// the function-calling API in subsequent iterations.
///
/// Deduplicates by name — tools already in `function_defs` are skipped.
fn expand_function_defs_from_search_result(
    result_json: &str,
    function_defs: &mut Vec<serde_json::Value>,
) {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(result_json) else {
        return;
    };
    let Some(matches) = parsed.get("matches").and_then(|v| v.as_array()) else {
        return;
    };
    let existing_names: std::collections::HashSet<String> = function_defs
        .iter()
        .filter_map(|fd| fd.get("name").and_then(|n| n.as_str()).map(String::from))
        .collect();

    for m in matches {
        let Some(name) = m.get("name").and_then(|n| n.as_str()) else {
            continue;
        };
        if existing_names.contains(name) {
            continue;
        }
        function_defs.push(serde_json::json!({
            "name": name,
            "description": m.get("description").and_then(|d| d.as_str()).unwrap_or(""),
            "parameters": m.get("args_schema").cloned().unwrap_or(serde_json::json!({})),
        }));
        tracing::debug!(tool = name, "dynamically added discovered tool to function_defs");
    }
}

/// Global counter of in-flight agent turns.
static IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

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
            max_tool_iterations: 3,
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
            max_tool_iterations: agent_cfg.max_tool_iterations.unwrap_or(3),
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
                                let mut guard = agent.lock().await;
                                let result = guard.run_turn(msg.clone()).await;
                                IN_FLIGHT.fetch_sub(1, Ordering::Relaxed);
                                match result {
                                    Ok(reply) => {
                                        info!(reply_len = reply.len(), "agent turn completed");
                                        let channel = msg.channel.clone();
                                        let reply_clone = reply.clone();
                                        tokio::spawn(async move {
                                            if let Err(e) =
                                                crate::comm::send_reply(&channel, &reply_clone)
                                                    .await
                                            {
                                                warn!(error = %e, channel = %channel, "failed to send reply");
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
    /// Files checked: `SOUL.md`, `TOOLS.md`, `HEARTBEAT.md`.  Missing
    /// files are silently skipped.
    pub async fn load_bootstrap(&self) -> anyhow::Result<String> {
        let names = ["SOUL.md", "TOOLS.md", "HEARTBEAT.md"];
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
            return Ok(exchanges
                .into_iter()
                // Drop `tool` messages from persisted history — they lack
                // the `tool_call_id` / `tool_calls` context needed by the
                // API and would cause HTTP 400 errors.
                .filter(|ex| ex.role == "user" || ex.role == "assistant")
                .map(|ex| ChatMessage::new(ex.role, ex.content))
                .collect());
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

        // Build provider manager. If fallback models are configured,
        // try to resolve them from the loaded config.
        let manager = if self.fallback_models.is_empty() {
            build_provider_manager(&self.provider, &self.model_id)
        } else {
            // Build a synthetic AgentConfig for the config-aware builder.
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
            };
            // Try to load config for model resolution; fall back to basic manager.
            let config_path = crate::pinchy_home().join("config.yaml");
            match crate::config::Config::load(&config_path).await {
                Ok(cfg) => {
                    crate::models::build_provider_manager_from_config(&agent_cfg, &cfg)
                }
                Err(_) => build_provider_manager(&self.provider, &self.model_id),
            }
        };

        // Stash the providers globally so tools (e.g. semantic memory)
        // can embed text without plumbing.
        crate::models::set_global_providers(std::sync::Arc::new(
            build_provider_manager(&self.provider, &self.model_id),
        ));

        let result = self.run_turn_with_provider(msg, &manager).await;

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
            messages.push(ChatMessage::new("system", bootstrap));
        }

        // Inject skill instructions from the unified tool registry.
        let skill_prompt =
            crate::tools::prompt_instructions(self.enabled_skills.as_deref());
        if !skill_prompt.is_empty() {
            messages.push(ChatMessage::new("system", skill_prompt));
        }

        // Inject persistent memory (cross-session knowledge).
        let mem_block =
            crate::tools::builtins::memory::memory_prompt_block(&self.workspace, 4000).await;
        if !mem_block.is_empty() {
            messages.push(ChatMessage::new("system", mem_block));
        }

        // Inject tools metadata so the model knows which skills are available.
        // Only core (non-deferred) tools are injected upfront; the agent can
        // discover additional tools at runtime via the `search_tools` tool.
        let tool_metas = tools::list_tools_core();
        if !tool_metas.is_empty() {
            let tools_json =
                serde_json::to_string_pretty(&tool_metas).unwrap_or_else(|_| "[]".to_string());
            messages.push(ChatMessage::new(
                "system",
                format!(
                    "The following tools are available. Use TOOL_CALL with the correct name and args.\n\n\
                     ```tools_metadata\n{tools_json}\n```\n\n\
                     IMPORTANT — Tool discovery:\n\
                     • Your visible tool set above is NOT exhaustive. Many specialised tools exist \
                     for cron/scheduling, agent management, sessions, skills, and more.\n\
                     • ALWAYS call `search_tools` BEFORE using `exec_shell` when the task involves \
                     scheduling, cron jobs, agents, sessions, skills, or any domain-specific operation. \
                     Specialised tools are safer, more reliable, and produce better results than shell commands.\n\
                     • Example: to trigger a cron job, search for \"cron\" first — don't try to run a shell script.\n\
                     • Use `exec_shell` only for general-purpose shell tasks (file manipulation, git, building, etc.) \
                     where no specialised tool exists.",
                ),
            ));
        }

        // Inject recent session history for conversational context.
        let history = self.load_history(40).await.unwrap_or_default();
        messages.extend(history);

        messages.push(ChatMessage::new("user", msg.content.clone()));

        // 2b. Context window management: prune old tool results and
        //     compact if over budget.
        let budget = crate::context::ContextBudget::default();
        crate::context::manage_context(&mut messages, &budget, manager).await;

        // 3. Build function definitions for function-calling providers.
        //    Starts with core tools only; dynamically expanded when the agent
        //    calls `search_tools` and discovers deferred tools.
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
        let (mut response, usage) = manager
            .send_chat_with_functions(&messages, &function_defs)
            .await
            .context("model call failed")?;
        receipt_model_calls += 1;

        if let Some(ref u) = usage {
            receipt_tokens.accumulate(u);
            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "token_usage",
                "agent": self.id,
                "prompt_tokens": u.prompt_tokens,
                "completion_tokens": u.completion_tokens,
                "total_tokens": u.total_tokens,
            }));
        }

        // 3a-enforce. Enforcement retry: if the provider returned plain text
        // but function definitions exist and the provider supports functions,
        // nudge the model with a corrective system message (one retry only).
        if let ProviderResponse::Final(ref text) = response {
            if !function_defs.is_empty() && manager.supports_functions && !is_tool_call_only(text) {
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
                messages.push(ChatMessage::new("system", corrective));
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
                        if let Some(ref u) = retry_usage {
                            receipt_tokens.accumulate(u);
                            crate::gateway::publish_event_json(&serde_json::json!({
                                "type": "token_usage",
                                "agent": self.id,
                                "prompt_tokens": u.prompt_tokens,
                                "completion_tokens": u.completion_tokens,
                                "total_tokens": u.total_tokens,
                            }));
                        }
                    }
                    Err(e) => {
                        warn!(error = %e, "enforcement retry failed, using original response");
                    }
                }
            }
        }

        // 3b. exec/exec_shell are now allowed unconditionally (no TOOLS.md gating).

        // 3c. Tool-invocation loop
        let max_iters = self.max_tool_iterations;

        for _iter in 0..max_iters {
            match response {
                ProviderResponse::Final(ref text) => {
                    // Check for fenced-JSON tool call (fallback for
                    // non-function-calling providers).
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

                    // exec/exec_shell allowed unconditionally (TOOLS.md gating removed).

                    debug!(tool = %tool_req.name, "invoking tool (fenced)");

                    let tool_name_owned = tool_req.name.clone();
                    let args_summary = crate::utils::truncate_str(
                        &serde_json::to_string(&tool_req.args).unwrap_or_default(),
                        200,
                    );

                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "tool_start",
                            "agent": self.id,
                            "session": self.current_session,
                            "tool": tool_req.name,
                    }));

                    let tool_timer = std::time::Instant::now();
                    let result =
                        tools::call_skill(&tool_req.name, tool_req.args, &self.workspace).await;
                    let tool_elapsed = tool_timer.elapsed().as_millis() as u64;

                    let (result_json, tool_failed, tool_error) = match result {
                        Ok(v) => (serde_json::to_string(&v)?, false, None),
                        Err(e) => {
                            let err_msg = format!("{e}");
                            warn!(error = %e, "tool execution failed, feeding error back");
                            crate::gateway::publish_event_json(&serde_json::json!({
                                "type": "tool_error",
                                  "agent": self.id,
                                  "session": self.current_session,
                                  "tool": tool_name_owned,
                                  "error": err_msg,
                            }));
                            (
                                serde_json::to_string(&serde_json::json!({"error": &err_msg}))?,
                                true,
                                Some(err_msg),
                            )
                        }
                    };

                    receipt_tool_calls.push(ToolCallRecord {
                        tool: tool_name_owned.clone(),
                        args_summary,
                        success: !tool_failed,
                        duration_ms: tool_elapsed,
                        error: tool_error,
                    });

                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "tool_end",
                            "agent": self.id,
                            "session": self.current_session,
                            "tool": tool_name_owned,
                    }));

                    // Echo the assistant's tool-call block.
                    messages.push(ChatMessage {
                        role: "assistant".into(),
                        content: text.clone(),
                        tool_calls: None,
                        tool_call_id: None,
                    });

                    // If there was remaining assistant text, preserve it.
                    if !remaining.is_empty() {
                        messages.push(ChatMessage {
                            role: "assistant".into(),
                            content: remaining,
                            tool_calls: None,
                            tool_call_id: None,
                        });
                    }

                    // If the tool was search_tools, expand function_defs
                    // with the discovered tool schemas so the model can call
                    // them via function-calling in subsequent iterations.
                    if tool_req.name == "search_tools" && !tool_failed {
                        expand_function_defs_from_search_result(&result_json, &mut function_defs);
                    }

                    // Append tool result as user message (fenced path
                    // cannot produce a real tool_call_id, so we avoid
                    // the `tool` role which requires one).
                    messages.push(ChatMessage {
                        role: "user".into(),
                        content: format!("[Tool Result for {}]: {}", tool_req.name, result_json),
                        tool_calls: None,
                        tool_call_id: None,
                    });

                    // Re-query provider with updated conversation.
                    let (new_resp, loop_usage) = manager
                        .send_chat_with_functions(&messages, &function_defs)
                        .await
                        .context("model call failed (tool loop)")?;
                    response = new_resp;
                    receipt_model_calls += 1;
                    if let Some(ref u) = loop_usage {
                        receipt_tokens.accumulate(u);
                        crate::gateway::publish_event_json(&serde_json::json!({
                            "type": "token_usage",
                            "agent": self.id,
                            "prompt_tokens": u.prompt_tokens,
                            "completion_tokens": u.completion_tokens,
                            "total_tokens": u.total_tokens,
                        }));
                    }
                }
                ProviderResponse::FunctionCall {
                    ref id,
                    ref name,
                    ref arguments,
                } => {
                    // Parse arguments JSON.
                    let args: serde_json::Value =
                        serde_json::from_str(arguments).unwrap_or(serde_json::json!({}));

                    // exec/exec_shell allowed unconditionally (TOOLS.md gating removed).

                    let fc_id = if id.is_empty() {
                        format!("call_{}", uuid_like_id())
                    } else {
                        id.clone()
                    };
                    let fc_name = name.clone();
                    let fc_args_summary = crate::utils::truncate_str(arguments, 200);

                    debug!(tool = %name, "invoking tool (function-call)");

                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "tool_start",
                            "agent": self.id,
                            "session": self.current_session,
                            "tool": fc_name,
                    }));

                    let tool_timer = std::time::Instant::now();
                    let result = tools::call_skill(name, args, &self.workspace).await;
                    let tool_elapsed = tool_timer.elapsed().as_millis() as u64;

                    let (result_json, tool_failed, tool_error) = match result {
                        Ok(v) => (serde_json::to_string(&v)?, false, None),
                        Err(e) => {
                            let err_msg = format!("{e}");
                            warn!(error = %e, "tool execution (function-call) failed, feeding error back");
                            crate::gateway::publish_event_json(&serde_json::json!({
                                "type": "tool_error",
                                  "agent": self.id,
                                  "session": self.current_session,
                                  "tool": fc_name,
                                  "error": err_msg,
                            }));
                            (
                                serde_json::to_string(&serde_json::json!({"error": &err_msg}))?,
                                true,
                                Some(err_msg),
                            )
                        }
                    };

                    receipt_tool_calls.push(ToolCallRecord {
                        tool: fc_name.clone(),
                        args_summary: fc_args_summary,
                        success: !tool_failed,
                        duration_ms: tool_elapsed,
                        error: tool_error,
                    });

                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "tool_end",
                            "agent": self.id,
                            "session": self.current_session,
                            "tool": fc_name,
                    }));

                    // If the tool was search_tools, expand function_defs
                    // with the discovered tool schemas.
                    if fc_name == "search_tools" && !tool_failed {
                        expand_function_defs_from_search_result(&result_json, &mut function_defs);
                    }

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
                        content: result_json,
                        tool_calls: None,
                        tool_call_id: Some(fc_id),
                    });

                    // Re-query provider.
                    let (new_resp, loop_usage) = manager
                        .send_chat_with_functions(&messages, &function_defs)
                        .await
                        .context("model call failed (function-call loop)")?;
                    response = new_resp;
                    receipt_model_calls += 1;
                    if let Some(ref u) = loop_usage {
                        receipt_tokens.accumulate(u);
                        crate::gateway::publish_event_json(&serde_json::json!({
                            "type": "token_usage",
                            "agent": self.id,
                            "prompt_tokens": u.prompt_tokens,
                            "completion_tokens": u.completion_tokens,
                            "total_tokens": u.total_tokens,
                        }));
                    }
                }
                ProviderResponse::MultiFunctionCall(ref calls) => {
                    // Build tool_calls entries and generate ids where needed.
                    let call_entries: Vec<(String, String, String, String)> = calls
                        .iter()
                        .map(|c| {
                            let cid = if c.id.is_empty() {
                                format!("call_{}", uuid_like_id())
                            } else {
                                c.id.clone()
                            };
                            (cid, c.name.clone(), c.arguments.clone(), c.arguments.clone())
                        })
                        .collect();

                    // Push the assistant message with all tool_calls up-front.
                    let tc_json: Vec<serde_json::Value> = call_entries
                        .iter()
                        .map(|(cid, name, args, _)| {
                            serde_json::json!({
                                "id": cid,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": args,
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
                    for (cid, name, args_str, _) in call_entries.iter() {
                        let name = name.clone();
                        let args_str = args_str.clone();
                        let cid = cid.clone();
                        let ws = ws.clone();
                        let agent_id = agent_id.clone();
                            let session_id = session_id.clone();

                        handles.push(tokio::spawn(async move {
                            let args: serde_json::Value =
                                serde_json::from_str(&args_str).unwrap_or(serde_json::json!({}));
                            let args_summary = crate::utils::truncate_str(&args_str, 200);

                            crate::gateway::publish_event_json(&serde_json::json!({
                                "type": "tool_start",
                                "agent": agent_id,
                                    "session": session_id,
                                "tool": name,
                            }));

                            let timer = std::time::Instant::now();
                            let result = tools::call_skill(&name, args, &ws).await;
                            let elapsed = timer.elapsed().as_millis() as u64;

                            let (result_json, failed, error) = match result {
                                Ok(v) => (serde_json::to_string(&v).unwrap_or_default(), false, None),
                                Err(e) => {
                                    let err_msg = format!("{e}");
                                    crate::gateway::publish_event_json(&serde_json::json!({
                                        "type": "tool_error",
                                        "agent": agent_id,
                                            "session": session_id,
                                        "tool": name,
                                        "error": err_msg,
                                    }));
                                    (serde_json::to_string(&serde_json::json!({"error": &err_msg})).unwrap_or_default(), true, Some(err_msg))
                                }
                            };

                            crate::gateway::publish_event_json(&serde_json::json!({
                                "type": "tool_end",
                                "agent": agent_id,
                                    "session": session_id,
                                "tool": name,
                            }));

                            (cid, name, args_summary, result_json, failed, error, elapsed)
                        }));
                    }

                    // Collect results.
                    for handle in handles {
                        if let Ok((cid, name, args_summary, result_json, failed, error, elapsed)) =
                            handle.await
                        {
                            receipt_tool_calls.push(ToolCallRecord {
                                tool: name.clone(),
                                args_summary,
                                success: !failed,
                                duration_ms: elapsed,
                                error,
                            });

                            // Expand function_defs if search_tools discovered new tools.
                            if name == "search_tools" && !failed {
                                expand_function_defs_from_search_result(&result_json, &mut function_defs);
                            }

                            // Append tool result with matching tool_call_id.
                            messages.push(ChatMessage {
                                role: "tool".into(),
                                content: result_json,
                                tool_calls: None,
                                tool_call_id: Some(cid),
                            });
                        }
                    }

                    // Re-query provider with all tool results.
                    let (new_resp, loop_usage) = manager
                        .send_chat_with_functions(&messages, &function_defs)
                        .await
                        .context("model call failed (multi-function-call loop)")?;
                    response = new_resp;
                    receipt_model_calls += 1;
                    if let Some(ref u) = loop_usage {
                        receipt_tokens.accumulate(u);
                        crate::gateway::publish_event_json(&serde_json::json!({
                            "type": "token_usage",
                            "agent": self.id,
                            "prompt_tokens": u.prompt_tokens,
                            "completion_tokens": u.completion_tokens,
                            "total_tokens": u.total_tokens,
                        }));
                    }
                }
            }
        }

        let final_reply = match response {
            ProviderResponse::Final(text) => {
                // The text is already available — stream it to the
                // gateway as chunked deltas.  We deliberately do NOT
                // re-issue the conversation as a streaming request
                // because that would double the API cost (prompt +
                // completion tokens charged again).
                self.stream_reply_to_gateway(&text).await;
                text
            }
            ProviderResponse::FunctionCall { name, arguments, .. } => {
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
        const CHUNK_TARGET: usize = 80; // chars per chunk

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
            // Try to break at a space/newline near the target.
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
                tokio::time::sleep(std::time::Duration::from_millis(15)).await;
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

        // There should be exactly one .jsonl session file in workspace/sessions/
        // (plus one .receipts.jsonl for the turn receipt).
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
