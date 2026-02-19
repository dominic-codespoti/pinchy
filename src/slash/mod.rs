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

use thiserror::Error;
use tracing::debug;

use crate::session::SessionStore;

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
#[derive(Debug, Error)]
pub enum SlashError {
    #[error("unknown command: /{0}")]
    UnknownCommand(String),
    #[error("command /{cmd} is not available on channel `{channel}`")]
    NotAvailable { cmd: String, channel: String },
    #[error("{0}")]
    Handler(String),
}

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

                // Create the empty session file.
                let sessions_dir = ctx.workspace.join("sessions");
                tokio::fs::create_dir_all(&sessions_dir)
                    .await
                    .map_err(|e| SlashError::Handler(format!("create sessions dir: {e}")))?;
                tokio::fs::write(sessions_dir.join(format!("{session_id}.jsonl")), b"")
                    .await
                    .map_err(|e| SlashError::Handler(format!("create session file: {e}")))?;

                // Set as current session.
                SessionStore::set_current(&ctx.workspace, &session_id)
                    .await
                    .map_err(|e| SlashError::Handler(format!("set_current failed: {e}")))?;

                // Append to global index.
                crate::session::index::append_global_index(
                    &ctx.pinchy_home,
                    &session_id,
                    &ctx.agent_id,
                    None,
                )
                .await
                .map_err(|e| SlashError::Handler(format!("append global index: {e}")))?;

                debug!(session_id = %session_id, "new session started via /new");
                Ok(SlashResponse::Text(format!("new session started: {session_id}")))
            })
        }),
    );

    // /end — end the current session
    registry.register(
        cmd("end", "End the current conversation session", "/end"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                if SessionStore::load_current_async(&ctx.workspace).await.is_none() {
                    return Ok(SlashResponse::Text("no active session".to_string()));
                }
                SessionStore::clear_current(&ctx.workspace)
                    .await
                    .map_err(|e| SlashError::Handler(format!("clear_current failed: {e}")))?;
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
                let path = ctx.workspace.join("CURRENT_SESSION");
                match tokio::fs::read_to_string(&path).await {
                    Ok(id) => {
                        let id = id.trim().to_string();
                        if id.is_empty() {
                            Ok(SlashResponse::Text("no active session".to_string()))
                        } else {
                            Ok(SlashResponse::Text(format!("current session: {id}")))
                        }
                    }
                    Err(_) => Ok(SlashResponse::Text("no active session".to_string())),
                }
            })
        }),
    );

    // /list_sessions — list session files
    registry.register(
        cmd("list_sessions", "List all saved sessions", "/list_sessions"),
        Arc::new(|ctx, _args| {
            Box::pin(async move {
                let dir = ctx.workspace.join("sessions");
                let mut rd = match tokio::fs::read_dir(&dir).await {
                    Ok(rd) => rd,
                    Err(_) => {
                        return Ok(SlashResponse::Text("no sessions found".to_string()));
                    }
                };
                let mut names = Vec::new();
                while let Ok(Some(entry)) = rd.next_entry().await {
                    let p = entry.path();
                    if p.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                            names.push(stem.to_string());
                        }
                    }
                }
                names.sort();
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
                SessionStore::set_current(&ctx.workspace, &session_id)
                    .await
                    .map_err(|e| SlashError::Handler(format!("set_current failed: {e}")))?;
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
                let (model, provider) = match crate::config::Config::load(&ctx.config_path).await {
                    Ok(cfg) => {
                        let ac = cfg.agents.iter().find(|a| a.id == ctx.agent_id);
                        let model_ref = ac.and_then(|a| a.model.clone());
                        let provider = model_ref
                            .as_deref()
                            .and_then(|mr| cfg.models.iter().find(|m| m.id == mr))
                            .map(|m| m.provider.clone())
                            .unwrap_or_else(|| "(default)".to_string());
                        let model = model_ref.unwrap_or_else(|| "(default)".to_string());
                        (model, provider)
                    }
                    Err(_) => ("(unknown)".to_string(), "(unknown)".to_string()),
                };
                Ok(SlashResponse::Text(format!(
                    "agent: {}\nprovider: {provider}\nmodel: {model}\nsession: {session}\nworkspace: {}",
                    ctx.agent_id,
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
                        let ws = ctx.agent_root.clone();
                        match crate::scheduler::load_heartbeat_status(&ws).await {
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
                        match crate::scheduler::load_heartbeat_status(&ctx.agent_root).await {
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
                        let jobs = crate::scheduler::load_persisted_cron_jobs(&ctx.agent_root).await;
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
                        let runs = crate::scheduler::load_cron_runs(&ctx.agent_root).await;
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
                        crate::scheduler::remove_persisted_job(&ctx.agent_root, name, agent_id).await;
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
                    other => Ok(SlashResponse::Text(format!("unknown cron subcommand: {other}\nusage: /cron list | status | delete | add"))),
                }
            })
        }),
    );

    // /help — list available commands
    registry.register(
        cmd("help", "List available slash commands", "/help"),
        Arc::new(|_ctx, _args| {
            Box::pin(async move {
                let lines = [
                    "/new                   — Start a new conversation session",
                    "/end                   — End the current session",
                    "/session               — Show current session id",
                    "/switch_session <id>   — Switch to an existing session",
                    "/list_sessions         — List all saved sessions",
                    "/list_agents           — List all agent folders",
                    "/set-model <id>        — Change the model for this agent",
                    "/status                — Show agent status",
                    "/help                  — Show this help message",
                    "/exit                  — Quit the REPL (TUI only)",
                ];
                Ok(SlashResponse::Text(lines.join("\n")))
            })
        }),
    );
}
