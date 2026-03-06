//! Channel-agnostic slash command registry and dispatch.
//!
//! Provides a [`Registry`] that maps command names to async [`Handler`]s,
//! plus [`register_builtin_commands`] which wires up the core set of
//! slash commands (`/new`, `/end`, `/session`, `/list_sessions`,
//! `/set-model`, `/status`, `/help`).

use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, RwLock};

use tracing::debug;

use crate::models::ModelProvider;

// ── Types ────────────────────────────────────────────────────

/// Metadata describing a registered slash command.
#[derive(Debug, Clone)]
pub struct Command {
    pub name: String,
    pub description: String,
    pub usage: String,
    /// Which channels this command is available on.  An empty vec or
    /// a vec containing `"*"` means "all channels".
    pub channels: Vec<String>,
}

/// Parsed arguments supplied to a command handler.
#[derive(Debug, Clone)]
pub struct CommandArgs {
    /// Remaining text after the command name (trimmed).
    pub raw: String,
    /// Whitespace-split tokens from `raw`.
    pub args: Vec<String>,
}

/// Execution context provided to every handler invocation.
#[derive(Debug, Clone)]
pub struct Context {
    /// Agent identifier.
    pub agent_id: String,
    /// Agent root directory (e.g. `agents/<id>`).
    /// Contains SOUL.md, TOOLS.md, HEARTBEAT.md, heartbeat_status.json,
    /// cron_events/, etc.
    pub agent_root: PathBuf,
    /// Sandboxed workspace directory (`agent_root/workspace`).
    /// Tools, sessions, and file I/O are sandboxed here.
    pub workspace: PathBuf,
    /// Channel the command originated from (e.g. `"tui"`, `"discord"`).
    pub channel: String,
    /// Path to the config.yaml file.
    pub config_path: PathBuf,
    /// Root of the pinchy home directory.
    pub pinchy_home: PathBuf,
}

/// Possible responses from a slash command handler.
#[derive(Debug, Clone)]
pub enum SlashResponse {
    /// Plain text reply to display to the user.
    Text(String),
}

/// Errors during slash command dispatch or execution.
#[derive(Debug)]
pub enum SlashError {
    UnknownCommand(String),
    NotAvailable { cmd: String, channel: String },
    Handler(String),
}

impl std::fmt::Display for SlashError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownCommand(s) => write!(f, "unknown command: /{s}"),
            Self::NotAvailable { cmd, channel } => {
                write!(f, "command /{cmd} is not available on channel `{channel}`")
            }
            Self::Handler(s) => f.write_str(s),
        }
    }
}

impl std::error::Error for SlashError {}

// ── Handler type alias ───────────────────────────────────────

/// A slash command handler: receives owned [`Context`] + [`CommandArgs`],
/// returns a boxed future producing a [`SlashResponse`] or [`SlashError`].
pub type Handler = Arc<
    dyn Fn(
            Context,
            CommandArgs,
        ) -> Pin<Box<dyn Future<Output = Result<SlashResponse, SlashError>> + Send>>
        + Send
        + Sync,
>;

// ── Registry ─────────────────────────────────────────────────

/// Thread-safe registry mapping command names to metadata + handlers.
pub struct Registry {
    commands: RwLock<HashMap<String, (Command, Handler)>>,
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

impl Registry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self {
            commands: RwLock::new(HashMap::new()),
        }
    }

    /// Register a command and its handler.
    pub fn register(&self, cmd: Command, handler: Handler) {
        let name = cmd.name.clone();
        let mut map = self.commands.write().expect("registry lock poisoned");
        map.insert(name, (cmd, handler));
    }

    /// Dispatch raw user input to the matching command handler.
    ///
    /// `channel` identifies the originating channel for availability
    /// filtering.  `raw` is the full slash-command string (e.g.
    /// `"/set-model gpt-4o"`).
    pub async fn dispatch(
        &self,
        channel: &str,
        raw: &str,
        ctx: &Context,
    ) -> Result<SlashResponse, SlashError> {
        let trimmed = raw.trim();
        let without_slash = trimmed.strip_prefix('/').unwrap_or(trimmed);
        let name = without_slash.split_whitespace().next().unwrap_or("");

        if name.is_empty() {
            return Err(SlashError::UnknownCommand(String::new()));
        }

        let args_str = without_slash.strip_prefix(name).unwrap_or("").trim();

        let cmd_args = CommandArgs {
            raw: args_str.to_string(),
            args: args_str.split_whitespace().map(String::from).collect(),
        };

        let handler = {
            let map = self.commands.read().expect("registry lock poisoned");
            let (cmd, handler) = map
                .get(name)
                .ok_or_else(|| SlashError::UnknownCommand(name.to_string()))?;

            // Check channel availability (empty or "*" means all).
            if !cmd.channels.is_empty() && !cmd.channels.iter().any(|c| c == "*" || c == channel) {
                return Err(SlashError::NotAvailable {
                    cmd: name.to_string(),
                    channel: channel.to_string(),
                });
            }

            Arc::clone(handler)
        };

        handler(ctx.clone(), cmd_args).await
    }

    /// Return metadata for all registered commands, sorted by name.
    pub fn list(&self) -> Vec<Command> {
        let map = self.commands.read().expect("registry lock poisoned");
        let mut cmds: Vec<Command> = map.values().map(|(cmd, _)| cmd.clone()).collect();
        cmds.sort_by(|a, b| a.name.cmp(&b.name));
        cmds
    }
}

// ── Built-in command registration ────────────────────────────

/// Shorthand: build a [`Command`] available on all channels.
fn cmd(name: &str, description: &str, usage: &str) -> Command {
    Command {
        name: name.to_string(),
        description: description.to_string(),
        usage: usage.to_string(),
        channels: vec!["*".to_string()],
    }
}

/// Register all built-in slash commands into the given registry.
pub fn register_builtin_commands(registry: &Registry) {
    // /new — start a new session
    registry.register(
        cmd("new", "Start a new conversation session", "/new"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                let session_id = crate::session::index::new_session_id();

                // Persist to PinchyDb if available.
                if let Some(db) = crate::store::global_db() {
                    let entry = crate::session::index::IndexEntry {
                        session_id: session_id.clone(),
                        agent_id: ctx.agent_id.clone(),
                        created_at: crate::agent::types::epoch_millis(),
                        title: None,
                    };
                    db.insert_session(&entry)
                        .map_err(|e| SlashError::Handler(format!("insert session: {e}")))?;
                    db.set_current_session(&ctx.agent_id, &session_id)
                        .map_err(|e| SlashError::Handler(format!("set current session: {e}")))?;
                } else {
                    tracing::warn!("no database available — skipping /new session creation");
                }

                debug!(session_id = %session_id, "new session started via /new");
                Ok(SlashResponse::Text(format!(
                    "new session started: {session_id}"
                )))
            })
        }),
    );

    // /end — end the current session
    registry.register(
        cmd("end", "End the current conversation session", "/end"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                if let Some(db) = crate::store::global_db() {
                    if db.current_session(&ctx.agent_id).ok().flatten().is_none() {
                        return Ok(SlashResponse::Text("no active session".to_string()));
                    }
                    db.clear_current_session(&ctx.agent_id)
                        .map_err(|e| SlashError::Handler(format!("clear current: {e}")))?;
                } else {
                    tracing::warn!("no database available — skipping /end");
                    return Ok(SlashResponse::Text("no database available".to_string()));
                }
                debug!("session ended via /end");
                Ok(SlashResponse::Text("session ended".to_string()))
            })
        }),
    );

    // /session — show current session id
    registry.register(
        cmd("session", "Show the current session id", "/session"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                let sid = if let Some(db) = crate::store::global_db() {
                    db.current_session(&ctx.agent_id).ok().flatten()
                } else {
                    tracing::warn!("no database available — skipping /session lookup");
                    None
                };
                match sid {
                    Some(id) => Ok(SlashResponse::Text(format!("current session: {id}"))),
                    None => Ok(SlashResponse::Text("no active session".to_string())),
                }
            })
        }),
    );

    // /list_sessions — list session files
    registry.register(
        cmd("list_sessions", "List all saved sessions", "/list_sessions"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                let names: Vec<String> = if let Some(db) = crate::store::global_db() {
                    db.list_sessions_for_agent(&ctx.agent_id)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|e| {
                            let label = e.title.as_deref().unwrap_or(&e.session_id);
                            format!("{} ({})", e.session_id, label)
                        })
                        .collect()
                } else {
                    tracing::warn!("no database available — skipping /list_sessions");
                    Vec::new()
                };

                if names.is_empty() {
                    Ok(SlashResponse::Text("no sessions found".to_string()))
                } else {
                    let listing = names
                        .iter()
                        .map(|n| format!("  {n}"))
                        .collect::<Vec<_>>()
                        .join("\n");
                    Ok(SlashResponse::Text(format!(
                        "sessions ({}):\n{listing}",
                        names.len()
                    )))
                }
            })
        }),
    );

    // /switch_session — switch to an existing session by id
    registry.register(
        cmd(
            "switch_session",
            "Switch to an existing session",
            "/switch_session <id>",
        ),
        Arc::new(|ctx, args| {
            Box::pin(async move {
                let session_id = args.args.first().cloned().unwrap_or_default();
                if session_id.is_empty() {
                    return Ok(SlashResponse::Text(
                        "usage: /switch_session <id>".to_string(),
                    ));
                }

                // Check the session exists.
                let exists = if let Some(db) = crate::store::global_db() {
                    db.load_full_history(&session_id).map(|h| !h.is_empty()).unwrap_or(false)
                } else {
                    tracing::warn!("no database available — cannot verify session exists");
                    false
                };

                if !exists {
                    return Ok(SlashResponse::Text(format!(
                        "session '{session_id}' not found — use /list_sessions to see available sessions"
                    )));
                }

                if let Some(db) = crate::store::global_db() {
                    db.set_current_session(&ctx.agent_id, &session_id)
                        .map_err(|e| SlashError::Handler(format!("set_current failed: {e}")))?;
                } else {
                    tracing::warn!("no database available — skipping /switch_session");
                    return Ok(SlashResponse::Text("no database available".to_string()));
                }
                debug!(session_id = %session_id, "session switched via /switch_session");
                Ok(SlashResponse::Text(format!(
                    "switched to session: {session_id}"
                )))
            })
        }),
    );

    // /list_agents — list agent folders
    registry.register(
        cmd("list_agents", "List all agent folders", "/list_agents"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                // The workspace is e.g. agents/<id>, so the parent is the agents root.
                let agents_dir = ctx
                    .workspace
                    .parent()
                    .unwrap_or_else(|| std::path::Path::new("agents"));
                let mut rd = match tokio::fs::read_dir(agents_dir).await {
                    Ok(rd) => rd,
                    Err(_) => {
                        return Ok(SlashResponse::Text("no agents found".to_string()));
                    }
                };
                let mut names = Vec::new();
                while let Ok(Some(entry)) = rd.next_entry().await {
                    if entry
                        .file_type()
                        .await
                        .map(|ft| ft.is_dir())
                        .unwrap_or(false)
                    {
                        if let Some(name) = entry.file_name().to_str() {
                            names.push(name.to_string());
                        }
                    }
                }
                names.sort();
                if names.is_empty() {
                    Ok(SlashResponse::Text("no agents found".to_string()))
                } else {
                    let listing = names
                        .iter()
                        .map(|n| format!("  {n}"))
                        .collect::<Vec<_>>()
                        .join("\n");
                    Ok(SlashResponse::Text(format!(
                        "agents ({}):\n{listing}",
                        names.len()
                    )))
                }
            })
        }),
    );

    // /set-model — change the agent's model in config.yaml
    registry.register(
        cmd(
            "set-model",
            "Change the model used by this agent",
            "/set-model <model-id>",
        ),
        Arc::new(|ctx, args| {
            Box::pin(async move {
                let model_id = args.args.first().cloned().unwrap_or_default();
                if model_id.is_empty() {
                    return Ok(SlashResponse::Text(
                        "usage: /set-model <model-id>".to_string(),
                    ));
                }
                let config_path = ctx.config_path.clone();
                let _guard = crate::config::config_lock().await;
                let mut cfg: crate::config::Config = crate::config::Config::load(&config_path)
                    .await
                    .map_err(|e| SlashError::Handler(format!("load config: {e}")))?;
                let entry = cfg
                    .agents
                    .iter_mut()
                    .find(|a| a.id == ctx.agent_id)
                    .ok_or_else(|| {
                        SlashError::Handler(format!(
                            "agent '{}' not found in config.yaml",
                            ctx.agent_id
                        ))
                    })?;
                entry.model = Some(model_id.clone());
                cfg.save(&config_path)
                    .await
                    .map_err(|e| SlashError::Handler(format!("save config: {e}")))?;
                debug!(model = %model_id, "model updated via /set-model");
                Ok(SlashResponse::Text(format!("model set to: {model_id}")))
            })
        }),
    );

    // /status — display agent status
    registry.register(
        cmd("status", "Show agent status", "/status"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                let session =
                    match tokio::fs::read_to_string(ctx.workspace.join("CURRENT_SESSION")).await {
                        Ok(s) if !s.trim().is_empty() => s.trim().to_string(),
                        _ => "(none)".to_string(),
                    };
                let (model, provider, tz_str) = match crate::config::Config::load(&ctx.config_path).await {
                    Ok(cfg) => {
                        let ac = cfg.agents.iter().find(|a| a.id == ctx.agent_id);
                        let model_ref = ac.and_then(|a| a.model.clone());
                        let provider = model_ref
                            .as_deref()
                            .and_then(|mr| cfg.models.iter().find(|m| m.id == mr))
                            .map(|m| m.provider.clone())
                            .unwrap_or_else(|| "(default)".to_string());
                        let model = model_ref.unwrap_or_else(|| "(default)".to_string());
                        let tz = cfg.resolve_timezone(&ctx.agent_id);
                        (model, provider, tz.to_string())
                    }
                    Err(_) => ("(unknown)".to_string(), "(unknown)".to_string(), "UTC".to_string()),
                };
                let now = chrono::Utc::now();
                let tz: chrono_tz::Tz = tz_str.parse::<chrono_tz::Tz>().unwrap_or(chrono_tz::UTC);
                let local_now = now.with_timezone(&tz);
                Ok(SlashResponse::Text(format!(
                    "agent: {}\nprovider: {provider}\nmodel: {model}\nsession: {session}\ntimezone: {tz_str}\nlocal time: {}\nworkspace: {}",
                    ctx.agent_id,
                    local_now.format("%Y-%m-%d %H:%M %Z"),
                    ctx.workspace.display()
                )))
            })
        }),
    );

    // /heartbeat — heartbeat status/check subcommands
    registry.register(
        cmd("heartbeat", "Show heartbeat status", "/heartbeat status | /heartbeat check <agent>"),
        Arc::new(|ctx, args| {
            Box::pin(async move {
                let sub = args.args.first().map(|s| s.as_str()).unwrap_or("status");
                match sub {
                    "check" => {
                        let agent_id = args.args.get(1).cloned().unwrap_or(ctx.agent_id.clone());
                        match crate::scheduler::load_heartbeat_status(&agent_id).await {
                            Some(s) => {
                                let health = match &s.health {
                                    crate::scheduler::HeartbeatHealth::OK => "OK",
                                    crate::scheduler::HeartbeatHealth::MISSED => "MISSED",
                                    crate::scheduler::HeartbeatHealth::ERROR(_) => "ERROR",
                                };
                                Ok(SlashResponse::Text(format!(
                                    "heartbeat check for {agent_id}\nhealth: {health}\nlast_tick: {}\ninterval: {}s",
                                    s.last_tick.map(|t| t.to_string()).unwrap_or_else(|| "-".into()),
                                    s.interval_secs.map(|t| t.to_string()).unwrap_or_else(|| "-".into()),
                                )))
                            }
                            None => Ok(SlashResponse::Text(format!("no heartbeat data found for {agent_id}"))),
                        }
                    }
                    _ => {
                        // status
                        match crate::scheduler::load_heartbeat_status(&ctx.agent_id).await {
                            Some(s) => {
                                let health = match &s.health {
                                    crate::scheduler::HeartbeatHealth::OK => "OK",
                                    crate::scheduler::HeartbeatHealth::MISSED => "MISSED",
                                    crate::scheduler::HeartbeatHealth::ERROR(e) => e.as_str(),
                                };
                                Ok(SlashResponse::Text(format!(
                                    "{}\t{}\t{}\t{}",
                                    s.agent_id,
                                    health,
                                    s.interval_secs.map(|t| t.to_string()).unwrap_or_else(|| "-".into()),
                                    s.message_preview.unwrap_or_default(),
                                )))
                            }
                            None => Ok(SlashResponse::Text("no heartbeat data found".to_string())),
                        }
                    }
                }
            })
        }),
    );

    // /cron — cron job management subcommands
    registry.register(
        cmd("cron", "Manage cron jobs", "/cron list | /cron status <job> | /cron delete <job> | /cron add <schedule> <message>"),
        Arc::new(|ctx, args| {
            Box::pin(async move {
                let sub = args.args.first().map(|s| s.as_str()).unwrap_or("list");
                match sub {
                    "list" => {
                        let jobs = crate::scheduler::load_persisted_cron_jobs(&ctx.agent_id).await;
                        if jobs.is_empty() {
                            Ok(SlashResponse::Text("no cron jobs found".to_string()))
                        } else {
                            let listing = jobs.iter()
                                .map(|j| format!("  {}@{} — {} {}", j.name, j.agent_id, j.schedule,
                                    j.message.as_deref().unwrap_or("")))
                                .collect::<Vec<_>>()
                                .join("\n");
                            Ok(SlashResponse::Text(format!("cron jobs ({}):\n{listing}", jobs.len())))
                        }
                    }
                    "status" => {
                        let job_id = args.args.get(1).cloned().unwrap_or_default();
                        if job_id.is_empty() {
                            return Ok(SlashResponse::Text("usage: /cron status <job_id>".to_string()));
                        }
                        let runs = crate::scheduler::load_cron_runs(&ctx.agent_id).await;
                        let matching: Vec<_> = runs.iter().filter(|r| r.job_id == job_id).collect();
                        if matching.is_empty() {
                            return Ok(SlashResponse::Text(format!("no runs found for {job_id}")));
                        }
                        let mut lines = vec![format!("{job_id}\nruns: {}", matching.len())];
                        for r in &matching {
                            let status_str = match &r.status {
                                crate::scheduler::JobStatus::SUCCESS => "SUCCESS".to_string(),
                                crate::scheduler::JobStatus::FAILED(e) => format!("FAILED: {e}"),
                                crate::scheduler::JobStatus::PENDING => "PENDING".to_string(),
                                crate::scheduler::JobStatus::RUNNING => "RUNNING".to_string(),
                            };
                            lines.push(format!("  {} — {}", r.id, status_str));
                        }
                        Ok(SlashResponse::Text(lines.join("\n")))
                    }
                    "delete" => {
                        let job_id = args.args.get(1).cloned().unwrap_or_default();
                        if job_id.is_empty() {
                            return Ok(SlashResponse::Text("usage: /cron delete <name@agent_id>".to_string()));
                        }
                        let (name, agent_id) = job_id.split_once('@').unwrap_or((&job_id, &ctx.agent_id));
                        crate::scheduler::remove_persisted_job(name, agent_id).await;
                        Ok(SlashResponse::Text(format!("deleted cron job: {job_id}")))
                    }
                    "add" => {
                        // Check if scheduler is running
                        if crate::scheduler::scheduler_handle_ref().is_none() {
                            return Ok(SlashResponse::Text("scheduler not running — cannot add cron jobs".to_string()));
                        }
                        let schedule = args.args.get(1).cloned().unwrap_or_default();
                        let message = args.args.get(2..).map(|s| s.join(" ")).unwrap_or_default();
                        if schedule.is_empty() {
                            return Ok(SlashResponse::Text("usage: /cron add <schedule> <message>".to_string()));
                        }
                        Ok(SlashResponse::Text(format!("added cron job: {schedule} — {message}")))
                    }
                    "run" => {
                        let job_id = args.args.get(1).cloned().unwrap_or_default();
                        if job_id.is_empty() {
                            return Ok(SlashResponse::Text("usage: /cron run <name@agent_id>".to_string()));
                        }
                        let (job_name, agent_id) = job_id.split_once('@').unwrap_or((&job_id, &ctx.agent_id));
                        let jobs = crate::scheduler::load_persisted_cron_jobs(&ctx.agent_id).await;
                        let job = jobs.iter().find(|j| j.name == job_name && j.agent_id == agent_id);
                        match job {
                            Some(job) => {
                                crate::scheduler::run_persisted_job_tick(job).await;
                                Ok(SlashResponse::Text(format!("triggered cron job: {job_id}")))
                            }
                            None => Ok(SlashResponse::Text(format!("cron job not found: {job_id}"))),
                        }
                    }
                    other => Ok(SlashResponse::Text(format!("unknown cron subcommand: {other}\nusage: /cron list | status | delete | add | run"))),
                }
            })
        }),
    );

    // /help — list available commands (auto-generated from registry)
    {
        let help_cmd = cmd("help", "List available slash commands", "/help");
        let mut cmds = registry.list();
        cmds.push(help_cmd.clone());
        cmds.sort_by(|a, b| a.name.cmp(&b.name));
        let max_usage_len = cmds.iter().map(|c| c.usage.len()).max().unwrap_or(0);
        let help_text: String = cmds
            .iter()
            .map(|c| {
                format!(
                    "{:<width$} — {}",
                    c.usage,
                    c.description,
                    width = max_usage_len
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        registry.register(
            help_cmd,
            Arc::new(move |_ctx, _args| {
                let text = help_text.clone();
                Box::pin(async move { Ok(SlashResponse::Text(text)) })
            }),
        );
    }

    // /compact — summarise older messages into a compact card via LLM
    registry.register(
        cmd(
            "compact",
            "Summarise older session messages into a compact knowledge card (non-destructive)",
            "/compact",
        ),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                let session_id = if let Some(db) = crate::store::global_db() {
                    db.current_session(&ctx.agent_id)
                        .ok()
                        .flatten()
                        .ok_or_else(|| SlashError::Handler("no active session".to_string()))?
                } else {
                    tracing::warn!("no database available — skipping /compact");
                    return Err(SlashError::Handler("no database available".to_string()));
                };

                let history = if let Some(db) = crate::store::global_db() {
                    db.load_history(&session_id, 200)
                        .map_err(|e| SlashError::Handler(format!("load history: {e}")))?
                } else {
                    tracing::warn!("no database available — skipping /compact history load");
                    Vec::new()
                };

                if history.len() < 4 {
                    return Ok(SlashResponse::Text(
                        "not enough messages to compact (need at least 4)".to_string(),
                    ));
                }

                let config_path = ctx.config_path.clone();
                let history_limit = crate::config::Config::load(&config_path)
                    .await
                    .ok()
                    .and_then(|cfg| {
                        cfg.agents
                            .iter()
                            .find(|a| a.id == ctx.agent_id)
                            .and_then(|a| a.history_messages)
                    })
                    .unwrap_or(40);

                let keep_tail = history_limit.min(history.len());
                let to_summarise_end = history.len().saturating_sub(keep_tail);
                if to_summarise_end == 0 {
                    return Ok(SlashResponse::Text(
                        "all messages are within the context window — nothing to compact".to_string(),
                    ));
                }

                let older: Vec<String> = history[..to_summarise_end]
                    .iter()
                    .map(|ex| {
                        let content = if ex.content.len() > 600 {
                            format!("{}…[truncated]", &ex.content[..600])
                        } else {
                            ex.content.clone()
                        };
                        format!("[{}]: {}", ex.role, content)
                    })
                    .collect();

                let summary_prompt = format!(
                    "Summarise the following conversation history into a concise but thorough summary. \
                     Preserve key facts, decisions, file paths mentioned, tool results, and action items. \
                     Use markdown formatting (headers, bullets). Omit greetings and filler.\n\n{}",
                    older.join("\n")
                );

                let pm = crate::models::get_global_providers()
                    .ok_or_else(|| {
                        SlashError::Handler("no model provider available".to_string())
                    })?;

                let msgs = vec![crate::models::ChatMessage::user(summary_prompt)];
                let summary: String = pm
                    .send_chat(&msgs)
                    .await
                    .map_err(|e| SlashError::Handler(format!("LLM summarisation failed: {e}")))?;

                let summary_text = summary.trim().to_string();

                crate::gateway::publish_event_json(&serde_json::json!({
                    "type": "compact_summary",
                    "agent": ctx.agent_id,
                    "session": session_id,
                    "summary": summary_text,
                    "messages_compacted": to_summarise_end,
                    "messages_kept": keep_tail,
                }));

                Ok(SlashResponse::Text(format!(
                    "✅ Compacted {} older messages into a summary card. {} recent messages remain in context.",
                    to_summarise_end, keep_tail
                )))
            })
        }),
    );

    // /gh-login — trigger GitHub OAuth device flow to (re-)authenticate Copilot
    registry.register(
        cmd(
            "gh-login",
            "Authenticate with GitHub for Copilot access",
            "/gh-login",
        ),
        Arc::new(|_ctx, _args| {
            Box::pin(async move {
                let client_id = crate::auth::github_device::DEFAULT_CLIENT_ID;
                let http = reqwest::Client::new();

                // Request a device code from GitHub.
                let resp: serde_json::Value = http
                    .post("https://github.com/login/device/code")
                    .header("Accept", "application/json")
                    .form(&[("client_id", client_id), ("scope", "read:user")])
                    .send()
                    .await
                    .map_err(|e| SlashError::Handler(format!("network error: {e}")))?
                    .json()
                    .await
                    .map_err(|e| SlashError::Handler(format!("json error: {e}")))?;

                let device_code = resp["device_code"]
                    .as_str()
                    .ok_or_else(|| SlashError::Handler("missing device_code".into()))?
                    .to_string();
                let user_code = resp["user_code"].as_str().unwrap_or("???").to_string();
                let uri = resp["verification_uri"]
                    .as_str()
                    .unwrap_or("https://github.com/login/device")
                    .to_string();
                let interval = resp["interval"].as_u64().unwrap_or(5);

                // Poll in the background until the user authorises.
                tokio::spawn(async move {
                    let poll_dur = std::time::Duration::from_secs(interval);
                    loop {
                        tokio::time::sleep(poll_dur).await;

                        let poll: serde_json::Value = match http
                            .post("https://github.com/login/oauth/access_token")
                            .header("Accept", "application/json")
                            .form(&[
                                ("client_id", client_id),
                                ("device_code", device_code.as_str()),
                                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                            ])
                            .send()
                            .await
                        {
                            Ok(r) => r.json().await.unwrap_or_default(),
                            Err(e) => {
                                tracing::warn!("gh-login: poll error: {e}");
                                continue;
                            }
                        };

                        if let Some(tok) = poll["access_token"].as_str() {
                            match crate::auth::github_device::store_token(tok) {
                                Ok(()) => tracing::info!("gh-login: token stored"),
                                Err(e) => tracing::error!("gh-login: store failed: {e}"),
                            }
                            break;
                        }

                        match poll["error"].as_str() {
                            Some("authorization_pending") => continue,
                            Some("slow_down") => {
                                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                            }
                            Some(other) => {
                                tracing::error!("gh-login: device flow error: {other}");
                                break;
                            }
                            None => {
                                tracing::warn!("gh-login: unexpected response: {poll}");
                                break;
                            }
                        }
                    }
                });

                Ok(SlashResponse::Text(format!(
                    "🔐 **GitHub Authentication**\n\n\
                     1. Open: **{uri}**\n\
                     2. Enter code: **{user_code}**\n\n\
                     Polling in the background — you can start using Copilot \
                     as soon as you authorise."
                )))
            })
        }),
    );
}
