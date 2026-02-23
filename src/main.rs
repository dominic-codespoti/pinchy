use mini_claw::agent;
use mini_claw::auth;
use mini_claw::cli;
use mini_claw::comm;
use mini_claw::config;
use mini_claw::discord;
use mini_claw::models;
use mini_claw::scheduler;
use mini_claw::tools;

use anyhow::Context;
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use tokio_util::sync::CancellationToken;
use tracing::info;

#[derive(Parser, Debug)]
#[command(name = "pinchy", version, about = "Lightweight Rust agent platform")]
struct Cli {
    /// Path to configuration file
    #[arg(short, long)]
    config: Option<PathBuf>,

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Start the daemon (gateway, scheduler, Discord bot)
    Start,
    /// Manage agents
    Agent {
        #[command(subcommand)]
        action: AgentAction,
    },
    /// Debug utilities
    Debug {
        #[command(subcommand)]
        action: DebugAction,
    },
    /// GitHub Copilot authentication
    Copilot {
        #[command(subcommand)]
        command: CopilotCmd,
    },
    /// Run the app-level onboarding wizard
    Onboard,
    /// Check if the Pinchy daemon is running
    Status,
    /// Pull latest code, rebuild, and restart
    Update {
        /// Skip the git pull step (just rebuild in-place)
        #[arg(long)]
        no_pull: bool,
        /// Restart the systemd service after building
        #[arg(long)]
        restart: bool,
    },
    /// Manage secrets
    Secrets {
        #[command(subcommand)]
        command: SecretsCmd,
    },
    /// Install, manage, or remove the systemd service
    Service {
        #[command(subcommand)]
        action: ServiceAction,
    },
}

#[derive(Subcommand, Debug)]
enum SecretsCmd {
    /// Store a secret value (prompted securely)
    Set {
        /// Secret key name (e.g. DISCORD_TOKEN)
        key: String,
    },
}

#[derive(Subcommand, Debug)]
enum ServiceAction {
    /// Install Pinchy as a systemd service (copies binary to /opt/pinchy)
    Install {
        /// System user to run the service as (defaults to $SUDO_USER or root)
        #[arg(long)]
        user: Option<String>,
    },
    /// Remove the systemd service (leaves /opt/pinchy data intact)
    Uninstall,
    /// Start the service
    Start,
    /// Stop the service
    Stop,
    /// Restart the service
    Restart,
    /// Show service status
    Status,
    /// View service logs
    Logs {
        /// Follow log output
        #[arg(short, long)]
        follow: bool,
        /// Number of recent lines to show
        #[arg(short = 'n', long, default_value = "50")]
        lines: usize,
    },
}

#[derive(Subcommand, Debug)]
enum CopilotCmd {
    /// Authenticate via GitHub device flow
    Login {
        /// GitHub OAuth App client ID (defaults to OpenClaw's ID)
        #[arg(long)]
        client_id: Option<String>,
    },
    /// Remove stored Copilot token
    Logout,
}

#[derive(Subcommand, Debug)]
enum AgentAction {
    /// Scaffold a new agent workspace
    New {
        /// Unique identifier for the agent
        id: String,
    },
    /// Set the model for an existing agent
    SetModel {
        /// Agent identifier
        id: String,
        /// Model provider id to assign
        model: String,
    },
    /// Display agent configuration and key workspace files
    Show {
        /// Agent identifier
        id: String,
    },
    /// Edit an agent workspace file (interactive or from file/stdin)
    Edit {
        /// Agent identifier
        id: String,
        /// Which section to edit
        #[arg(value_enum)]
        section: AgentSection,
        /// Read contents from a file instead of opening an editor. Use "-" for stdin.
        #[arg(long)]
        file: Option<String>,
    },
    /// Apply a YAML manifest to an agent workspace
    Apply {
        /// Agent identifier
        id: String,
        /// Path to YAML manifest file
        manifest: String,
    },
    /// Interactively configure an agent (provider, model, skills)
    Configure {
        /// Agent identifier
        id: String,
    },
    /// List all configured agents
    List,
}

// AgentSection re-exported from cli module
use cli::AgentSection;

#[derive(Subcommand, Debug)]
enum DebugAction {
    /// Run a single agent turn and print the reply
    Run {
        /// Agent identifier
        #[arg(long)]
        agent: String,
        /// User message to send
        #[arg(long)]
        message: String,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing with layered subscriber (fmt + log broadcast)
    {
        use tracing_subscriber::layer::SubscriberExt;
        use tracing_subscriber::util::SubscriberInitExt;

        let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

        let fmt_layer = tracing_subscriber::fmt::layer();

        let logs_tx = mini_claw::logs::init_broadcast();
        let broadcast_layer = mini_claw::logs::BroadcastLayer::new(logs_tx);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(fmt_layer)
            .with(broadcast_layer)
            .init();
    }

    let cli = Cli::parse();
    let config_path = cli
        .config
        .unwrap_or_else(|| mini_claw::pinchy_home().join("config.yaml"));

    // Handle non-daemon subcommands
    match cli.command {
        Some(Command::Start) | None => { /* fall through to daemon startup */ }
        Some(command) => {
            return match command {
                Command::Agent { action } => match action {
                    AgentAction::New { id } => cli::scaffold_agent(&id).await,
                    AgentAction::SetModel { id, model } => {
                        cli::set_agent_model(&config_path, &id, &model).await
                    }
                    AgentAction::Show { id } => cli::show_agent(&config_path, &id).await,
                    AgentAction::Edit { id, section, file } => {
                        cli::edit_agent_section(&config_path, &id, section, file.as_deref()).await
                    }
                    AgentAction::Apply { id, manifest } => {
                        cli::apply_manifest(&config_path, &id, &manifest).await
                    }
                    AgentAction::Configure { id } => cli::configure_agent(&config_path, &id).await,
                    AgentAction::List => cli::list_agents(&config_path).await,
                },
                Command::Debug { action } => match action {
                    DebugAction::Run {
                        agent: agent_id,
                        message,
                    } => cli::debug_run_turn(&config_path, &agent_id, &message).await,
                },
                Command::Copilot { command } => match command {
                    CopilotCmd::Login { client_id } => {
                        let cid = client_id
                            .as_deref()
                            .unwrap_or(auth::github_device::DEFAULT_CLIENT_ID);
                        let github_token = auth::github_device::device_flow_get_token(cid).await?;
                        auth::github_device::store_token(&github_token)?;

                        // Exchange the GitHub token for a Copilot session token.
                        println!("Exchanging GitHub token for Copilot session token…");
                        match auth::copilot_token::exchange_github_for_copilot_token(&github_token)
                            .await
                        {
                            Ok(ct) => {
                                auth::copilot_token::cache_copilot_token(&ct)?;
                                println!("Copilot token obtained and cached.");
                            }
                            Err(e) => {
                                // Non-fatal: the GitHub token is still stored.
                                eprintln!("Warning: Copilot token exchange failed: {e}");
                                eprintln!(
                                    "GitHub token was stored; you can retry with `copilot login`."
                                );
                            }
                        }
                        Ok(())
                    }
                    CopilotCmd::Logout => {
                        auth::github_device::remove_token()?;
                        println!("Token removed.");
                        Ok(())
                    }
                },
                Command::Status => cli::check_status().await,
                Command::Update { no_pull, restart } => cli::self_update(no_pull, restart).await,
                Command::Onboard => cli::app_onboard(&config_path).await,
                Command::Secrets { command } => match command {
                    SecretsCmd::Set { key } => {
                        let prompt = format!("Enter value for {key}: ");
                        let val = rpassword::prompt_password(&prompt)
                            .context("failed to read secret value")?;
                        mini_claw::secrets::set_secret_file(None, &key, &val)?;
                        println!("Secret '{key}' saved.");
                        Ok(())
                    }
                },
                Command::Service { action } => match action {
                    ServiceAction::Install { user } => cli::service::install(user.as_deref()),
                    ServiceAction::Uninstall => cli::service::uninstall(),
                    ServiceAction::Start => cli::service::start(),
                    ServiceAction::Stop => cli::service::stop(),
                    ServiceAction::Restart => cli::service::restart(),
                    ServiceAction::Status => cli::service::status(),
                    ServiceAction::Logs { follow, lines } => cli::service::logs(follow, lines),
                },
                Command::Start => unreachable!(),
            };
        }
    }

    // --- Normal server startup ---

    println!(
        r#"
  ╔══════════════════════════════════════╗
  ║       🦀  pinchy  v{}          ║
  ║   lightweight agent platform        ║
  ╚══════════════════════════════════════╝
"#,
        env!("CARGO_PKG_VERSION")
    );

    // Load configuration
    info!(path = %config_path.display(), "loading configuration");
    let cfg = config::Config::load(&config_path).await?;
    info!(
        agents = cfg.agents.len(),
        models = cfg.models.len(),
        "configuration loaded"
    );

    // Load skill registry
    let default_agent_id = cfg
        .routing
        .as_ref()
        .and_then(|r| r.default_agent.clone())
        .or_else(|| cfg.agents.first().map(|a| a.id.clone()));

    // Seed built-in defaults into each agent's skills folder.
    for agent_cfg in &cfg.agents {
        if let Err(e) = mini_claw::skills::defaults::seed_defaults(&agent_cfg.id) {
            tracing::warn!(agent = %agent_cfg.id, error = %e, "failed to seed default skills");
        }
    }

    let mut skill_registry = mini_claw::skills::SkillRegistry::new(default_agent_id.clone());
    skill_registry.load_skills_with_config(Some(&cfg))?;
    info!(
        count = skill_registry.skills.len(),
        "skills loaded"
    );

    // Push loaded skills into the unified tool registry and store the
    // agent ID for future reload operations.
    mini_claw::tools::set_skill_agent_id(default_agent_id);
    mini_claw::tools::sync_skills(&skill_registry);

    // Obtain the global message bus sender
    let bus = comm::sender();

    // Create a shutdown cancellation token.
    let cancel = CancellationToken::new();

    // Initialize modules
    discord::init(&cfg);
    agent::Agent::init(&cfg, bus.clone(), cancel.clone());
    models::init();
    tools::init();

    // --- Housekeeping janitor ---
    // Run an immediate cleanup pass at startup, then spawn a background
    // task that repeats every 6 hours.
    let janitor_cfg = scheduler::JanitorConfig::from_config(&cfg);
    {
        let startup_cleaned = scheduler::run_janitor_pass(&janitor_cfg).await;
        if startup_cleaned > 0 {
            info!(deleted = startup_cleaned, "startup housekeeping pass");
        }
    }
    let _janitor_handle = scheduler::spawn_janitor(janitor_cfg);

    // Start the scheduler when agents have heartbeats/cron configured, or
    // when explicitly forced via env var.
    let has_scheduled_work = cfg
        .agents
        .iter()
        .any(|a| a.heartbeat_secs.is_some() || !a.cron_jobs.is_empty());
    if has_scheduled_work || std::env::var("PINCHY_SCHEDULER").as_deref() == Ok("1") {
        let sched_handle = scheduler::start(&cfg).await?;
        scheduler::set_scheduler_handle(sched_handle).await;
        info!("scheduler enabled");
    } else {
        info!("scheduler disabled (no heartbeats or cron jobs configured)");
    }

    // Start the gateway (enabled by default; set PINCHY_GATEWAY=0 to disable).
    let _gateway = {
        let gw = mini_claw::gateway::spawn_gateway_if_enabled().await;
        if let Some(mut gw) = gw {
            // Drain commands_rx and forward into the comm bus.
            let rx = std::mem::replace(
                &mut gw.commands_rx,
                tokio::sync::mpsc::channel(1).1, // dummy receiver
            );
            mini_claw::gateway::spawn_command_forwarder(rx);
            Some(gw)
        } else if std::env::var("PINCHY_GATEWAY").as_deref() != Ok("0") {
            // Gateway was expected but failed to start.
            // With auto-bind this should be rare (10 ports tried).
            tracing::warn!(
                "gateway failed to start (all ports in use?). Try: PINCHY_GATEWAY=0 pinchy start"
            );
            None
        } else {
            None
        }
    };

    info!("pinchy ready — all modules initialized");

    // ── Startup summary ──────────────────────────────────────────────
    {
        let api_token = std::env::var("PINCHY_API_TOKEN")
            .ok()
            .filter(|s| !s.is_empty());

        let gw_url = _gateway.as_ref().map(|gw| {
            let addr_str = gw.addr.to_string();
            let display_addr = addr_str.replace("0.0.0.0", "127.0.0.1");
            format!("http://{}", display_addr)
        });

        let gw_status = match &gw_url {
            Some(url) => url.clone(),
            None => "disabled".to_string(),
        };

        let sched_status = if has_scheduled_work {
            let hb_count = cfg
                .agents
                .iter()
                .filter(|a| a.heartbeat_secs.is_some())
                .count();
            let cron_count: usize = cfg.agents.iter().map(|a| a.cron_jobs.len()).sum();
            format!("enabled ({hb_count} heartbeat(s), {cron_count} cron job(s))")
        } else {
            "disabled".to_string()
        };

        let skill_count = mini_claw::tools::skill_count();

        let discord_status = if cfg.channels.discord.is_some() {
            "connecting"
        } else {
            "disabled"
        };

        let agent_names: Vec<&str> = cfg.agents.iter().map(|a| a.id.as_str()).collect();

        println!("  ┌──────────────────────────────────────┐");
        println!("  │  ✅  Ready                           │");
        println!("  ├──────────────────────────────────────┤");
        println!("  │  Gateway:   {:<25}│", gw_status);
        println!("  │  Agents:    {:<25}│", agent_names.join(", "));
        println!("  │  Models:    {:<25}│", cfg.models.len());
        println!("  │  Skills:    {:<25}│", skill_count);
        println!("  │  Scheduler: {:<25}│", sched_status);
        println!("  │  Discord:   {:<25}│", discord_status);
        println!("  └──────────────────────────────────────┘");

        // Print the full frontend URL with token baked in.
        if let Some(ref url) = gw_url {
            if let Some(ref token) = api_token {
                println!("  🔗 {url}/?token={token}");
            } else {
                println!("  🔗 {url}/");
            }
        }
        println!();
    }

    // Wait for shutdown signal (Ctrl-C)
    tokio::signal::ctrl_c().await?;
    info!("received Ctrl-C, shutting down…");

    // 1. Signal all agent dispatchers to stop accepting new messages.
    cancel.cancel();

    // 2. Wait for in-flight agent turns to complete (up to 30s).
    let in_flight = agent::in_flight_count();
    if in_flight > 0 {
        info!(in_flight, "waiting for in-flight agent turns to drain…");
    }
    agent::drain_in_flight(std::time::Duration::from_secs(30)).await;

    // 3. Stop the scheduler if it is running.
    if let Some(handle) = scheduler::scheduler_handle_ref() {
        if let Some(sched) = &handle.cron_scheduler {
            info!("stopping scheduler…");
            let mut sched = sched.clone();
            let _ = sched.shutdown().await;
        }
    }

    // 4. Broadcast shutdown event to WebSocket clients.
    mini_claw::gateway::publish_event_json(&serde_json::json!({
        "type": "shutdown",
        "message": "Pinchy daemon shutting down",
    }));

    // Give WebSocket clients a moment to receive the shutdown event
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;

    info!("shutdown complete");

    Ok(())
}
