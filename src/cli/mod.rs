use crate::utils::browser_detect;
// CLI/TUI subcommand handlers extracted from `main.rs`.
//
// Keeps `main.rs` slim: clap parsing stays there, heavy logic lives here.

use crate::agent;
use crate::auth;
use crate::comm;
use crate::config;

use anyhow::Context;
use clap::ValueEnum;
use std::io::{IsTerminal, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::debug;

pub mod service;

// ── Public types ─────────────────────────────────────────────────────────────

/// Which workspace file to edit.
#[derive(Debug, Clone, ValueEnum)]
pub enum AgentSection {
    Soul,
    Tools,
    Heartbeat,
}

// ── Scaffold ─────────────────────────────────────────────────────────────────

/// Read a template file, replacing `{{id}}` with the agent id.
/// Falls back to `default` content when the template file is missing.
async fn read_template(name: &str, id: &str, default: &str) -> String {
    let path = crate::pinchy_home()
        .join("templates")
        .join("agent")
        .join(name);
    match tokio::fs::read_to_string(&path).await {
        Ok(contents) => contents.replace("{{id}}", id),
        Err(_) => default.replace("{{id}}", id),
    }
}

/// Create the agent workspace directory with default files.
///
/// Uses template files from `templates/agent/` when available, falling back to
/// built-in defaults.  The workspace directory is created with mode `0o700` and
/// individual files with mode `0o600`.
pub async fn scaffold_agent(id: &str) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let base = crate::utils::agent_root(id);

    if base.exists() {
        anyhow::bail!("agent workspace already exists: {}", base.display());
    }

    // Create directories: agent root and runtime workspace with sessions
    tokio::fs::create_dir_all(base.join("workspace").join("sessions")).await?;

    // Set agent root permissions to 0o700
    tokio::fs::set_permissions(&base, std::fs::Permissions::from_mode(0o700)).await?;

    // Set runtime workspace permissions to 0o700
    tokio::fs::set_permissions(
        &base.join("workspace"),
        std::fs::Permissions::from_mode(0o700),
    )
    .await?;

    // Helper: write content and set file permissions to 0o600
    async fn write_file(path: PathBuf, content: String) -> anyhow::Result<()> {
        use std::os::unix::fs::PermissionsExt;
        tokio::fs::write(&path, &content).await?;
        tokio::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).await?;
        Ok(())
    }

    // Write files from templates (or defaults)
    let soul = read_template(
        "SOUL.md",
        id,
        "# {{id}}\n\nDescribe this agent's personality, role, and boundaries here.\n",
    )
    .await;
    write_file(base.join("SOUL.md"), soul).await?;

    let tools = read_template(
        "TOOLS.md",
        id,
        "# Tools\n\nList the tools this agent is allowed to use.\n\n- read\n- write\n- exec\n",
    )
    .await;
    write_file(base.join("TOOLS.md"), tools).await?;

    let heartbeat = read_template(
        "HEARTBEAT.md",
        id,
        "# Heartbeat\n\nInstructions the agent executes on each heartbeat tick.\n",
    )
    .await;
    write_file(base.join("HEARTBEAT.md"), heartbeat).await?;

    // Seed built-in skills into the new agent's skills folder.
    crate::skills::defaults::seed_defaults(id)?;

    let abs = std::fs::canonicalize(&base)?;
    println!("created agent workspace: {}", abs.display());
    Ok(())
}

// ── Onboarding TUI ──────────────────────────────────────────────────────────

/// Data collected during the step-by-step onboarding wizard.
struct OnboardData {
    provider: String,
    model_id: String,
    browser_path: Option<String>,
}

/// Create a backup of `path` (sync), following the same `.bak.<unix_ts>`
/// convention used by [`agent::backup_file`].
fn sync_backup_file(path: &Path) -> anyhow::Result<()> {
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
    std::fs::copy(path, &bak_path)
        .with_context(|| format!("backup {} -> {}", path.display(), bak_path.display()))?;
    Ok(())
}

/// Step-by-step interactive TUI for agent onboarding.
///
/// Steps:
///   1. Select provider
///   2. Enter model id
///   3. Confirm & Save (updates agents entry in config.yaml)
///
/// No markdown files are edited during onboarding.
///
/// The user may navigate Back / Next / Cancel between steps.  Collected
/// data is preserved across navigation so edits are never lost.
///
/// If stdout is not a TTY the function returns an error so the caller
/// can fall back to non-interactive behaviour.
pub fn interactive_onboard_tui(
    config_path: &Path,
    id: &str,
    initial_model: Option<String>,
) -> anyhow::Result<()> {
    if !std::io::stdout().is_terminal() {
        anyhow::bail!("interactive onboarding requires a TTY");
    }

    // Load current config synchronously (we're in a sync TUI context).
    let cfg_contents = std::fs::read_to_string(config_path)
        .with_context(|| format!("read config {}", config_path.display()))?;
    let cfg: config::Config =
        serde_yaml_ng::from_str(&cfg_contents).context("parse config YAML")?;

    let base = crate::utils::agent_root(id);

    // Ensure workspace dirs exist (sync).
    let sessions_dir = base.join("workspace").join("sessions");
    std::fs::create_dir_all(&sessions_dir)
        .with_context(|| format!("create workspace {}", sessions_dir.display()))?;

    // Seed defaults from existing config agent entry when re-onboarding.
    let existing_agent = cfg.agents.iter().find(|a| a.id == id);
    let default_provider = existing_agent
        .and_then(|a| {
            a.model.as_ref().and_then(|mid| {
                cfg.models
                    .iter()
                    .find(|m| m.id == *mid)
                    .map(|m| m.provider.clone())
            })
        })
        .unwrap_or_else(|| "openai".to_string());
    let default_model_name = initial_model.unwrap_or_else(|| {
        existing_agent
            .and_then(|a| {
                a.model.as_ref().and_then(|mid| {
                    cfg.models
                        .iter()
                        .find(|m| m.id == *mid)
                        .and_then(|m| m.model.clone())
                })
            })
            .unwrap_or_else(|| "gpt-4o".to_string())
    });

    let mut data = OnboardData {
        provider: default_provider,
        model_id: default_model_name,
        browser_path: None,
    };

    let mut step: usize = 0;

    loop {
        match step {
            // ── Step 1: Select provider ───────────────────────────────
            0 => {
                println!("\n── Step 1/3: Select Provider ──");
                let providers = ["openai", "azure-openai", "copilot", "other"];
                let default_idx = providers
                    .iter()
                    .position(|p| *p == data.provider)
                    .unwrap_or(0);
                let sel = dialoguer::Select::new()
                    .with_prompt("Provider")
                    .items(&providers)
                    .default(default_idx)
                    .interact()
                    .unwrap_or(0);
                if providers[sel] == "other" {
                    let custom: String = dialoguer::Input::new()
                        .with_prompt("Custom provider name")
                        .default(data.provider.clone())
                        .interact_text()
                        .unwrap_or_else(|_| data.provider.clone());
                    data.provider = custom;
                } else {
                    data.provider = providers[sel].to_string();
                }
                println!("  Provider: {}", data.provider);
            }

            // ── Step 2: Enter model id ────────────────────────────────
            1 => {
                println!("\n── Step 2/3: Model Name ──");
                // Default model: try first config model matching selected
                // provider, otherwise keep current default.
                let provider_default = cfg
                    .models
                    .iter()
                    .find(|m| m.provider == data.provider)
                    .and_then(|m| m.model.clone())
                    .unwrap_or_else(|| data.model_id.clone());
                let input: String = dialoguer::Input::new()
                    .with_prompt("Model name (e.g. gpt-4o)")
                    .default(provider_default)
                    .interact_text()
                    .unwrap_or_else(|_| data.model_id.clone());
                data.model_id = input;
                println!("  Model: {}", data.model_id);
            }

            // ── Step 3: Detect browser ────────────────────────────────
            2 => {
                println!("\n── Step 3/4: Detect System Browser ──");
                println!("  Playwright’s browser download is always skipped.\n  pinchy will use your system Chromium/Chrome if found.");
                println!("  You can override the browser path anytime with the PINCHY_CHROMIUM_PATH environment variable.\n");
                let detected = browser_detect::detect_browser_path();
                if let Some(path) = detected {
                    println!("  Found system browser: {path}");
                    let use_it = dialoguer::Confirm::new()
                        .with_prompt("Use this browser for Playwright automation?")
                        .default(true)
                        .interact()
                        .unwrap_or(true);
                    if use_it {
                        data.browser_path = Some(path);
                    } else {
                        let custom: String = dialoguer::Input::new()
                            .with_prompt("Enter browser executable path (or leave blank to skip)")
                            .default(String::new())
                            .interact_text()
                            .unwrap_or_default();
                        if !custom.trim().is_empty() {
                            data.browser_path = Some(custom.trim().to_string());
                        }
                    }
                } else {
                    println!("  No Chromium/Chrome browser found in common locations.");
                    println!("  To enable browser automation, install Chromium (e.g. sudo apt install -y chromium-browser), or set PINCHY_CHROMIUM_PATH.");
                    let custom: String = dialoguer::Input::new()
                        .with_prompt("Enter browser executable path (or leave blank to skip)")
                        .default(String::new())
                        .interact_text()
                        .unwrap_or_default();
                    if !custom.trim().is_empty() {
                        data.browser_path = Some(custom.trim().to_string());
                    }
                }
            }
            // ── Step 4: Confirm & Save ────────────────────────────────
            3 => {
                println!("\n── Step 4/4: Confirm & Save ──");
                println!("  Agent:    {id}");
                println!("  Provider: {}", data.provider);
                println!("  Model:    {}", data.model_id);
                println!(
                    "  Browser:  {}",
                    data.browser_path.as_deref().unwrap_or("(none)")
                );

                let confirm = dialoguer::Confirm::new()
                    .with_prompt("Save and complete onboarding?")
                    .default(true)
                    .interact()
                    .unwrap_or(false);

                if confirm {
                    // ── Persist agent entry in config.yaml ─────────────
                    let cfg_contents = std::fs::read_to_string(config_path)
                        .with_context(|| format!("read config {}", config_path.display()))?;
                    let mut cfg: config::Config =
                        serde_yaml_ng::from_str(&cfg_contents).context("parse config YAML")?;

                    // Save browser path at top-level config
                    cfg.chromium_path = data.browser_path.clone();

                    // Ensure a model config entry exists for the chosen provider.
                    let model_config_id = if let Some(existing) =
                        cfg.models.iter().find(|m| m.provider == data.provider)
                    {
                        existing.id.clone()
                    } else {
                        let new_id = format!("{}-default", data.provider);
                        cfg.models.push(config::ModelConfig {
                            id: new_id.clone(),
                            provider: data.provider.clone(),
                            model: Some(data.model_id.clone()),
                            api_key: None,
                            endpoint: None,
                            api_version: None,
                            embedding_deployment: None,
                            embedding_model: None,
                            headers: None,
                        });
                        new_id
                    };

                    let workspace_str = format!("agents/{id}");
                    if let Some(entry) = cfg.agents.iter_mut().find(|a| a.id == id) {
                        entry.model = Some(model_config_id.clone());
                    } else {
                        cfg.agents.push(config::AgentConfig {
                            id: id.to_string(),
                            root: workspace_str,
                            model: Some(model_config_id.clone()),
                            heartbeat_secs: None,
                            cron_jobs: vec![],
                            max_tool_iterations: None,
                            enabled_skills: None,
                            fallback_models: Vec::new(),
                            webhook_secret: None,
                            extra_exec_commands: Vec::new(),
                            history_messages: None,
                            max_turns: None,
                            timezone: None,
                        });
                    }

                    let yaml_out = serde_yaml_ng::to_string(&cfg).context("serialize config")?;
                    sync_backup_file(config_path)?;
                    std::fs::write(config_path, &yaml_out)
                        .with_context(|| format!("write {}", config_path.display()))?;

                    println!(
                        "\nagent '{id}' onboarded — provider: {}, model: {}, browser: {}",
                        data.provider,
                        data.model_id,
                        data.browser_path.as_deref().unwrap_or("(none)")
                    );
                    return Ok(());
                } else {
                    // User declined – go back to browser step.
                    step = 2;
                    continue;
                }
            }

            _ => break,
        }

        // ── Navigation ────────────────────────────────────────────────
        if step == 0 {
            let items = ["Next \u{2192}", "Cancel"];
            let sel = dialoguer::Select::new()
                .items(&items)
                .default(0)
                .interact()
                .unwrap_or(0);
            match sel {
                0 => step = 1,
                _ => {
                    println!("Onboarding cancelled.");
                    return Ok(());
                }
            }
        } else {
            // step 1
            let items = ["Next \u{2192}", "\u{2190} Back", "Cancel"];
            let sel = dialoguer::Select::new()
                .items(&items)
                .default(0)
                .interact()
                .unwrap_or(0);
            match sel {
                0 => step += 1,
                1 => step = step.saturating_sub(1),
                _ => {
                    println!("Onboarding cancelled.");
                    return Ok(());
                }
            }
        }
    }

    Ok(())
}

/// App-level onboarding wizard: ensures config.yaml exists, optionally
/// scaffolds a first agent, and offers Copilot login.
pub async fn app_onboard(config_path: &Path) -> anyhow::Result<()> {
    if !std::io::stdout().is_terminal() {
        anyhow::bail!("onboarding requires an interactive terminal");
    }

    println!("\n── pinchy onboarding ──\n");

    // 1. Load or create config.yaml
    let _cfg = if config_path.exists() {
        println!("Found existing config: {}", config_path.display());
        config::Config::load(config_path).await?
    } else {
        println!("No config.yaml found — creating from template.");
        if let Some(parent) = config_path.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        let template_path = crate::pinchy_home().join("templates").join("config.yaml");
        let template_path = template_path.as_path();
        let content = if template_path.exists() {
            tokio::fs::read_to_string(template_path)
                .await
                .with_context(|| format!("read {}", template_path.display()))?
        } else {
            "models: []\nchannels: {}\nagents: []\n".to_string()
        };
        tokio::fs::write(config_path, &content)
            .await
            .with_context(|| format!("write {}", config_path.display()))?;
        println!("Wrote {}", config_path.display());
        config::Config::load(config_path).await?
    };

    // 2. Optionally create a default agent
    let create_agent = dialoguer::Confirm::new()
        .with_prompt("Create a default agent now?")
        .default(true)
        .interact()
        .unwrap_or(false);

    if create_agent {
        let agent_id: String = dialoguer::Input::new()
            .with_prompt("Agent id")
            .default("default".into())
            .interact_text()
            .unwrap_or_else(|_| "default".into());

        let base = crate::utils::agent_root(&agent_id);
        if !base.exists() {
            scaffold_agent(&agent_id).await?;
        } else {
            println!("Agent workspace already exists: {}", base.display());
        }

        interactive_onboard_tui(config_path, &agent_id, None)?;
    }

    // 3. Provider-specific credentials setup
    println!("\n── Credentials Setup ──\n");
    let provider_choices = ["OpenAI", "Azure OpenAI", "GitHub Copilot", "Skip"];
    let cred_sel = dialoguer::Select::new()
        .with_prompt("Configure API credentials")
        .items(&provider_choices)
        .default(0)
        .interact()
        .unwrap_or(3);

    // Track which provider was configured so embedding options can adapt.
    let configured_provider: Option<&str> = match cred_sel {
        0 => Some("openai"),
        1 => Some("azure-openai"),
        2 => Some("copilot"),
        _ => None,
    };

    match cred_sel {
        0 => {
            // OpenAI
            let key: String = dialoguer::Input::new()
                .with_prompt("OpenAI API key (sk-...)")
                .interact_text()
                .unwrap_or_default();
            if !key.is_empty() {
                let cfg_contents = std::fs::read_to_string(config_path).unwrap_or_default();
                if let Ok(mut cfg) = serde_yaml_ng::from_str::<config::Config>(&cfg_contents) {
                    if !cfg.models.iter().any(|m| m.provider == "openai") {
                        cfg.models.push(config::ModelConfig {
                            id: "openai-default".into(),
                            provider: "openai".into(),
                            model: Some("gpt-4o".into()),
                            api_key: Some(format!("${}", "OPENAI_API_KEY")),
                            endpoint: None,
                            api_version: None,
                            embedding_deployment: None,
                            embedding_model: None,
                            headers: None,
                        });
                    }
                    // Update agent model reference if it doesn't match any model
                    let model_ids: std::collections::HashSet<&str> =
                        cfg.models.iter().map(|m| m.id.as_str()).collect();
                    for agent in &mut cfg.agents {
                        if let Some(ref m) = agent.model {
                            if !model_ids.contains(m.as_str()) {
                                agent.model = Some("openai-default".into());
                            }
                        }
                    }
                    let yaml_out = serde_yaml_ng::to_string(&cfg).unwrap_or_default();
                    sync_backup_file(config_path).ok();
                    std::fs::write(config_path, &yaml_out).ok();
                    println!("  OpenAI model entry written to config.yaml");
                }
                println!("  Set OPENAI_API_KEY in your environment:");
                println!("  export OPENAI_API_KEY=\"{key}\"");
            }
        }
        1 => {
            // Azure OpenAI
            let endpoint: String = dialoguer::Input::new()
                .with_prompt("Azure endpoint (https://…openai.azure.com)")
                .interact_text()
                .unwrap_or_default();
            let key: String = dialoguer::Input::new()
                .with_prompt("Azure API key")
                .interact_text()
                .unwrap_or_default();
            let deployment: String = dialoguer::Input::new()
                .with_prompt("Chat deployment name (e.g. gpt-4o)")
                .interact_text()
                .unwrap_or_default();
            let embed_dep: String = dialoguer::Input::new()
                .with_prompt("Embedding deployment (leave empty to skip)")
                .default(String::new())
                .interact_text()
                .unwrap_or_default();

            if !endpoint.is_empty() && !key.is_empty() && !deployment.is_empty() {
                // Write an azure model entry into config
                let cfg_contents = std::fs::read_to_string(config_path).unwrap_or_default();
                if let Ok(mut cfg) = serde_yaml_ng::from_str::<config::Config>(&cfg_contents) {
                    let embed = if embed_dep.is_empty() {
                        None
                    } else {
                        Some(embed_dep.clone())
                    };
                    cfg.models.push(config::ModelConfig {
                        id: "azure-default".into(),
                        provider: "azure-openai".into(),
                        model: Some(deployment),
                        api_key: Some(key),
                        endpoint: Some(endpoint),
                        api_version: Some("2024-10-21".into()),
                        embedding_deployment: embed,
                        embedding_model: None,
                        headers: None,
                    });
                    let yaml_out = serde_yaml_ng::to_string(&cfg).unwrap_or_default();
                    sync_backup_file(config_path).ok();
                    std::fs::write(config_path, &yaml_out).ok();
                    println!("  Azure model entry written to config.yaml");
                }
            }
        }
        2 => {
            // Copilot
            let cid = auth::github_device::DEFAULT_CLIENT_ID;
            match auth::github_device::device_flow_get_token(cid).await {
                Ok(github_token) => {
                    if let Err(e) = auth::github_device::store_token(&github_token) {
                        eprintln!("Warning: failed to store token: {e}");
                    } else {
                        println!("GitHub token stored.");
                        println!("Exchanging GitHub token for Copilot session token…");
                        match auth::copilot_token::exchange_github_for_copilot_token(&github_token)
                            .await
                        {
                            Ok(ct) => {
                                auth::copilot_token::cache_copilot_token(&ct).ok();
                                println!("Copilot token obtained and cached.");
                            }
                            Err(e) => {
                                eprintln!("Warning: Copilot token exchange failed: {e}");
                            }
                        }
                    }
                    // Ensure a copilot model config entry exists
                    let cfg_contents = std::fs::read_to_string(config_path).unwrap_or_default();
                    if let Ok(mut cfg) = serde_yaml_ng::from_str::<config::Config>(&cfg_contents) {
                        if !cfg.models.iter().any(|m| m.provider == "copilot") {
                            let model_name: String = dialoguer::Input::new()
                                .with_prompt("Copilot model name")
                                .default("gpt-4o".into())
                                .interact_text()
                                .unwrap_or_else(|_| "gpt-4o".into());
                            cfg.models.push(config::ModelConfig {
                                id: "copilot-default".into(),
                                provider: "copilot".into(),
                                model: Some(model_name),
                                api_key: None,
                                endpoint: None,
                                api_version: None,
                                embedding_deployment: None,
                                embedding_model: None,
                                headers: None,
                            });
                        }
                        // Update agent model reference if it doesn't match any model
                        let model_ids: std::collections::HashSet<&str> =
                            cfg.models.iter().map(|m| m.id.as_str()).collect();
                        for agent in &mut cfg.agents {
                            if let Some(ref m) = agent.model {
                                if !model_ids.contains(m.as_str()) {
                                    agent.model = Some("copilot-default".into());
                                }
                            }
                        }
                        let yaml_out = serde_yaml_ng::to_string(&cfg).unwrap_or_default();
                        sync_backup_file(config_path).ok();
                        std::fs::write(config_path, &yaml_out).ok();
                        println!("  Copilot model entry written to config.yaml");
                    }
                }
                Err(e) => {
                    eprintln!("Warning: device flow failed: {e}");
                }
            }
        }
        _ => {
            println!("  Skipped credentials setup.");
        }
    }

    // 4. Embedding model (optional)
    println!("\n── Embedding Model ──\n");
    let do_embed = dialoguer::Confirm::new()
        .with_prompt("Configure an embedding model for semantic memory search?")
        .default(false)
        .interact()
        .unwrap_or(false);

    if do_embed {
        // Build embedding choices based on which provider was configured above.
        let embed_choices: Vec<&str> = match configured_provider {
            Some("azure-openai") => vec![
                "Azure OpenAI (uses embedding deployment from above)",
                "OpenAI (text-embedding-3-small)",
                "Skip",
            ],
            Some("copilot") => vec!["OpenAI (text-embedding-3-small)", "Skip"],
            _ => vec!["OpenAI (text-embedding-3-small)", "Skip"],
        };

        let embed_sel = dialoguer::Select::new()
            .with_prompt("Embedding provider")
            .items(&embed_choices)
            .default(0)
            .interact()
            .unwrap_or(embed_choices.len() - 1);

        let chosen = embed_choices[embed_sel];
        if chosen.starts_with("OpenAI") {
            let key: String = dialoguer::Input::new()
                .with_prompt("OpenAI API key (or press Enter if already set above)")
                .default(String::new())
                .interact_text()
                .unwrap_or_default();
            if !key.is_empty() {
                println!("  Embedding will use text-embedding-3-small via OpenAI.");
                println!("  The recall_memory tool now supports mode: \"semantic\".");
            } else {
                println!("  Will use existing OPENAI_API_KEY for embeddings.");
            }
        } else if chosen.starts_with("Azure") {
            println!(
                "  Azure embedding will use the embedding_deployment from your Azure model config."
            );
            println!("  Make sure your config.yaml model entry includes 'embedding_deployment'.");
        } else {
            println!("  Skipped embedding setup. Semantic search won't be available.");
        }
    }

    // 5. Discord token (optional)
    let do_discord = dialoguer::Confirm::new()
        .with_prompt("Configure Discord bot token?")
        .default(false)
        .interact()
        .unwrap_or(false);

    if do_discord {
        let token: String = dialoguer::Input::new()
            .with_prompt("Discord bot token")
            .interact_text()
            .unwrap_or_default();
        if !token.is_empty() {
            println!("  Set DISCORD_TOKEN in your environment:");
            println!("  export DISCORD_TOKEN=\"{token}\"");
        }
    }

    // 6. Timezone
    println!("\n── Timezone ──\n");
    println!("  Pinchy uses your timezone for cron schedules, timestamps in");
    println!("  agent prompts, and display. Enter an IANA timezone name.");
    println!("  Examples: America/New_York, Europe/London, Asia/Tokyo, UTC");

    let system_tz = iana_tz_from_system().unwrap_or_else(|| "UTC".to_string());
    let tz_input: String = dialoguer::Input::new()
        .with_prompt("Timezone")
        .default(system_tz.clone())
        .interact_text()
        .unwrap_or(system_tz);

    if !tz_input.is_empty() {
        if tz_input.parse::<chrono_tz::Tz>().is_ok() {
            let cfg_contents = std::fs::read_to_string(config_path).unwrap_or_default();
            if let Ok(mut cfg) = serde_yaml_ng::from_str::<config::Config>(&cfg_contents) {
                cfg.timezone = Some(tz_input.clone());
                let yaml_out = serde_yaml_ng::to_string(&cfg).unwrap_or_default();
                sync_backup_file(config_path).ok();
                std::fs::write(config_path, &yaml_out).ok();
                println!("  Timezone set to: {tz_input}");
            }
        } else {
            println!("  Warning: '{tz_input}' is not a valid IANA timezone. Skipping.");
            println!("  You can set it later in config.yaml: timezone: America/New_York");
        }
    }

    // 7. Service install (Linux only)
    #[cfg(target_os = "linux")]
    {
        println!("\n── Systemd Service ──\n");
        println!("  Install pinchy as a systemd service so it starts automatically");
        println!("  on boot and restarts on failure.\n");
        let install_service: bool = dialoguer::Confirm::new()
            .with_prompt("Install systemd service?")
            .default(true)
            .interact()
            .unwrap_or(false);
        if install_service {
            let is_root = unsafe { libc::geteuid() == 0 };
            if is_root {
                match service::install(None) {
                    Ok(()) => println!("  ✅ Service installed and enabled."),
                    Err(e) => println!("  ⚠️  Service install failed: {e}\n  You can retry later with: sudo pinchy service install"),
                }
            } else {
                println!("  Not running as root — run this after onboarding:");
                println!("    sudo pinchy service install");
            }
        }
    }

    // 8. Summary
    println!("\n╔══════════════════════════════════════════╗");
    println!("║       onboarding complete! 🦀            ║");
    println!("╚══════════════════════════════════════════╝");
    println!();
    println!("  Config:     {}", config_path.display());
    if create_agent {
        println!("  Agent:      created and configured");
    }
    println!("  Dashboard:  http://127.0.0.1:3131");
    println!();
    println!("  Next steps:");
    println!("    1. Start pinchy:    pinchy");
    println!("    2. Open dashboard:  http://127.0.0.1:3131");
    println!("    3. Edit agent:      pinchy edit default soul");
    println!("    4. Send a message:  curl -X POST http://127.0.0.1:3131/api/webhook/default \\");
    println!("                          -H 'Content-Type: application/json' \\");
    println!("                          -d '{{\"message\": \"hello\"}}'");
    println!("    5. View skills:     pinchy show default");
    println!("    6. Enable service:  sudo pinchy service install");
    println!();

    Ok(())
}

// ── Show / Edit / Apply ─────────────────────────────────────────────────────

/// Read a workspace file, returning up to `max_chars` characters, or None if missing.
async fn read_workspace_file(base: &Path, name: &str, max_chars: usize) -> Option<String> {
    let path = base.join(name);
    match tokio::fs::read_to_string(&path).await {
        Ok(contents) => {
            if contents.len() > max_chars {
                let truncated: String = contents.chars().take(max_chars).collect();
                Some(format!(
                    "{}\n… (truncated at {} chars)",
                    truncated, max_chars
                ))
            } else {
                Some(contents)
            }
        }
        Err(_) => None,
    }
}

/// List all configured agents with their model and workspace.
pub async fn list_agents(config_path: &Path) -> anyhow::Result<()> {
    let cfg = config::Config::load(config_path).await?;

    if cfg.agents.is_empty() {
        println!("No agents configured.");
        return Ok(());
    }

    println!("{:<16} {:<20} {:<40}", "ID", "MODEL", "WORKSPACE");
    println!("{}", "─".repeat(76));
    for agent in &cfg.agents {
        println!(
            "{:<16} {:<20} {:<40}",
            agent.id,
            agent.model.as_deref().unwrap_or("(default)"),
            agent.root,
        );
    }
    println!("\n{} agent(s) configured.", cfg.agents.len());
    Ok(())
}

/// Display agent configuration and key workspace files.
pub async fn show_agent(config_path: &Path, id: &str) -> anyhow::Result<()> {
    // Try loading config to resolve workspace path
    let workspace = match config::Config::load(config_path).await {
        Ok(cfg) => cfg
            .agents
            .iter()
            .find(|a| a.id == id)
            .map(|a| PathBuf::from(&a.root))
            .unwrap_or_else(|| PathBuf::from("agents").join(id)),
        Err(_) => PathBuf::from("agents").join(id),
    };

    if !workspace.exists() {
        anyhow::bail!("agent root not found: {}", workspace.display());
    }

    let sep = "─".repeat(50);

    println!("\n{sep}");
    println!("  Agent: {id}");
    println!("  Workspace: {}", workspace.display());
    println!("{sep}");

    // Config entry
    if let Ok(cfg) = config::Config::load(config_path).await {
        if let Some(ac) = cfg.agents.iter().find(|a| a.id == id) {
            println!("\n── config.yaml agent entry ──");
            println!("  model: {}", ac.model.as_deref().unwrap_or("(default)"));
            if let Some(hs) = ac.heartbeat_secs {
                println!("  heartbeat_secs: {hs}");
            }
        }
    }

    // SOUL.md
    if let Some(content) = read_workspace_file(&workspace, "SOUL.md", 2000).await {
        println!("\n── SOUL.md ──");
        println!("{content}");
    } else {
        println!("\n── SOUL.md ── (not found)");
    }

    // TOOLS.md
    if let Some(content) = read_workspace_file(&workspace, "TOOLS.md", 2000).await {
        println!("\n── TOOLS.md ──");
        println!("{content}");
    } else {
        println!("\n── TOOLS.md ── (not found)");
    }

    // HEARTBEAT.md
    if let Some(content) = read_workspace_file(&workspace, "HEARTBEAT.md", 2000).await {
        println!("\n── HEARTBEAT.md ──");
        println!("{content}");
    } else {
        println!("\n── HEARTBEAT.md ── (not found)");
    }

    // Sessions
    println!("\n── Sessions ──");
    let sessions_dir = workspace.join("workspace").join("sessions");
    if sessions_dir.exists() {
        let mut entries: Vec<String> = Vec::new();
        let mut rd = tokio::fs::read_dir(&sessions_dir).await?;
        while let Some(entry) = rd.next_entry().await? {
            if let Some(name) = entry.file_name().to_str() {
                entries.push(name.to_string());
            }
        }
        entries.sort();
        if entries.is_empty() {
            println!("  (no sessions)");
        } else {
            let total = entries.len();
            let shown: Vec<&String> = entries.iter().rev().take(3).collect();
            for name in shown.iter().rev() {
                println!("  • {name}");
            }
            if total > 3 {
                println!("  … and {} more", total - 3);
            }
        }
    } else {
        println!("  (no sessions directory)");
    }

    println!("\n{sep}\n");
    Ok(())
}

/// Update the model for an existing agent in `config.yaml`.
pub async fn set_agent_model(config_path: &Path, id: &str, model: &str) -> anyhow::Result<()> {
    let mut cfg = config::Config::load(config_path).await?;

    let entry = cfg
        .agents
        .iter_mut()
        .find(|a| a.id == id)
        .ok_or_else(|| anyhow::anyhow!("agent '{id}' not found in config.yaml"))?;
    entry.model = Some(model.to_string());

    cfg.save(config_path).await?;

    println!("agent '{id}' model set to: {model}");
    Ok(())
}

/// Interactively configure an agent: select provider, model, and skills.
pub async fn configure_agent(config_path: &Path, id: &str) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    if !std::io::stdout().is_terminal() {
        anyhow::bail!("agent configure requires an interactive terminal");
    }

    let mut cfg = config::Config::load(config_path).await?;

    let agent_entry = cfg
        .agents
        .iter()
        .find(|a| a.id == id)
        .ok_or_else(|| anyhow::anyhow!("agent '{id}' not found in config.yaml"))?;
    let current_model = agent_entry.model.clone();

    // ── Step 1: Select provider ──────────────────────────────────────────
    println!("\n── Configure agent '{id}' ──\n");

    let mut providers: Vec<String> = cfg.models.iter().map(|m| m.provider.clone()).collect();
    providers.sort();
    providers.dedup();

    if providers.is_empty() {
        anyhow::bail!("no model providers configured in config.yaml");
    }

    // Determine default provider from current model assignment.
    let current_provider = current_model.as_ref().and_then(|mid| {
        cfg.models
            .iter()
            .find(|m| m.id == *mid)
            .map(|m| m.provider.clone())
    });
    let default_provider_idx = current_provider
        .as_ref()
        .and_then(|cp| providers.iter().position(|p| p == cp))
        .unwrap_or(0);

    let provider_sel = dialoguer::Select::new()
        .with_prompt("Provider")
        .items(&providers)
        .default(default_provider_idx)
        .interact()
        .context("provider selection cancelled")?;
    let chosen_provider = &providers[provider_sel];
    println!("  Provider: {chosen_provider}");

    // ── Step 2: Select model ─────────────────────────────────────────────
    let matching_models: Vec<&crate::config::ModelConfig> = cfg
        .models
        .iter()
        .filter(|m| m.provider == *chosen_provider)
        .collect();

    if matching_models.is_empty() {
        anyhow::bail!("no models configured for provider '{chosen_provider}'");
    }

    let model_ids: Vec<&str> = matching_models.iter().map(|m| m.id.as_str()).collect();
    let default_model_idx = current_model
        .as_ref()
        .and_then(|cm| model_ids.iter().position(|mid| *mid == cm.as_str()))
        .unwrap_or(0);

    let model_sel = dialoguer::Select::new()
        .with_prompt("Model")
        .items(&model_ids)
        .default(default_model_idx)
        .interact()
        .context("model selection cancelled")?;
    let chosen_model = model_ids[model_sel].to_string();
    println!("  Model: {chosen_model}");

    // ── Step 3: Skills (optional) ────────────────────────────────────────
    let edit_skills = dialoguer::Confirm::new()
        .with_prompt("Edit skill allowlist?")
        .default(false)
        .interact()
        .unwrap_or(false);

    if edit_skills {
        // Discover skills by scanning the agent's skills folder.
        let agent_skills_dir = crate::utils::agent_root(id).join("skills");
        let mut available_skills: Vec<String> = Vec::new();

        if agent_skills_dir.is_dir() {
            let mut rd = tokio::fs::read_dir(&agent_skills_dir).await?;
            while let Some(entry) = rd.next_entry().await? {
                let skill_md = entry.path().join("SKILL.md");
                if skill_md.is_file() {
                    if let Ok(raw) = tokio::fs::read_to_string(&skill_md).await {
                        if let Ok((yaml, _)) = crate::skills::parse_skill_md(&raw) {
                            if let Ok(meta) =
                                serde_yaml_ng::from_str::<crate::skills::SkillMeta>(&yaml)
                            {
                                available_skills.push(meta.name.clone());
                            }
                        }
                    }
                }
            }
        }
        available_skills.sort();

        if available_skills.is_empty() {
            println!("  No skills found for agent '{id}'.");
        } else {
            // Load existing per-agent skills.yaml override.
            let agent_skills_path = crate::pinchy_home()
                .join("agents")
                .join(id)
                .join("skills.yaml");
            let existing_skills: config::SkillsConfig =
                if let Ok(raw) = tokio::fs::read_to_string(&agent_skills_path).await {
                    serde_yaml_ng::from_str(&raw).unwrap_or_default()
                } else {
                    config::SkillsConfig::default()
                };

            // Build defaults for multi-select (checked = currently allowed).
            let defaults: Vec<bool> = available_skills
                .iter()
                .map(|s| existing_skills.allow.is_empty() || existing_skills.allow.contains(s))
                .collect();

            let selections = dialoguer::MultiSelect::new()
                .with_prompt("Allowed skills (space to toggle, enter to confirm)")
                .items(&available_skills)
                .defaults(&defaults)
                .interact()
                .context("skill selection cancelled")?;

            let chosen_skills: Vec<String> = selections
                .iter()
                .map(|&i| available_skills[i].clone())
                .collect();

            // Save agent skills.yaml
            let new_skills = config::SkillsConfig {
                enabled: true,
                allow: chosen_skills.clone(),
                deny: vec![],
                operator_allowed: existing_skills.operator_allowed.clone(),
            };
            let yaml_out =
                serde_yaml_ng::to_string(&new_skills).context("serialize skills YAML")?;

            if let Some(parent) = agent_skills_path.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::write(&agent_skills_path, &yaml_out).await?;
            tokio::fs::set_permissions(&agent_skills_path, std::fs::Permissions::from_mode(0o600))
                .await?;

            println!("  Skills allow list: [{}]", chosen_skills.join(", "));
        }
    }

    // ── Persist model selection ──────────────────────────────────────────
    if let Some(entry) = cfg.agents.iter_mut().find(|a| a.id == id) {
        entry.model = Some(chosen_model.clone());
    }
    cfg.save(config_path).await?;

    // ── Summary ──────────────────────────────────────────────────────────
    println!("\nagent '{id}' configured — model: {chosen_model}");
    Ok(())
}

/// Read contents from a `--file` source: a path, or "-" for stdin.
fn read_file_source(source: &str) -> anyhow::Result<String> {
    if source == "-" {
        let mut buf = String::new();
        std::io::stdin()
            .read_to_string(&mut buf)
            .context("read stdin")?;
        Ok(buf)
    } else {
        std::fs::read_to_string(source).with_context(|| format!("read file {source}"))
    }
}

/// Edit an agent workspace file, optionally from a file or stdin.
pub async fn edit_agent_section(
    config_path: &Path,
    id: &str,
    section: AgentSection,
    file_source: Option<&str>,
) -> anyhow::Result<()> {
    let interactive = file_source.is_none();
    if interactive && !std::io::stdout().is_terminal() {
        anyhow::bail!("edit requires an interactive terminal (or use --file)");
    }

    // Resolve workspace from config or default path.
    let workspace = match config::Config::load(config_path).await {
        Ok(cfg) => cfg
            .agents
            .iter()
            .find(|a| a.id == id)
            .map(|a| PathBuf::from(&a.root))
            .unwrap_or_else(|| PathBuf::from("agents").join(id)),
        Err(_) => PathBuf::from("agents").join(id),
    };

    if !workspace.exists() {
        anyhow::bail!("agent root not found: {}", workspace.display());
    }

    match section {
        AgentSection::Soul => {
            let path = workspace.join("SOUL.md");
            if let Some(src) = file_source {
                let contents = read_file_source(src)?;
                agent::write_with_backup(&path, &contents).await?;
                println!("SOUL.md saved.");
            } else {
                let seed = tokio::fs::read_to_string(&path).await.unwrap_or_else(|_| {
                    format!(
                        "# {}\n\nDescribe this agent's personality, role, and boundaries here.\n",
                        id
                    )
                });
                if let Some(edited) = dialoguer::Editor::new()
                    .extension(".md")
                    .edit(&seed)
                    .unwrap_or(None)
                {
                    agent::write_with_backup(&path, &edited).await?;
                    println!("SOUL.md saved.");
                } else {
                    println!("SOUL.md unchanged.");
                }
            }
        }
        AgentSection::Tools => {
            let path = workspace.join("TOOLS.md");
            if let Some(src) = file_source {
                let contents = read_file_source(src)?;
                agent::write_with_backup(&path, &contents).await?;
                println!("TOOLS.md saved.");
            } else {
                let seed = tokio::fs::read_to_string(&path).await.unwrap_or_else(|_| {
                    "# Tools\n\nList the tools this agent is allowed to use.\n\n- read\n- write\n- exec\n".to_string()
                });
                if let Some(edited) = dialoguer::Editor::new()
                    .extension(".md")
                    .edit(&seed)
                    .unwrap_or(None)
                {
                    agent::write_with_backup(&path, &edited).await?;
                    println!("TOOLS.md saved.");
                } else {
                    println!("TOOLS.md unchanged.");
                }
            }
        }
        AgentSection::Heartbeat => {
            let path = workspace.join("HEARTBEAT.md");
            if let Some(src) = file_source {
                let contents = read_file_source(src)?;
                agent::write_with_backup(&path, &contents).await?;
                println!("HEARTBEAT.md saved.");
            } else {
                let seed = tokio::fs::read_to_string(&path).await.unwrap_or_else(|_| {
                    "# Heartbeat\n\nInstructions the agent executes on each heartbeat tick.\n"
                        .to_string()
                });
                if let Some(edited) = dialoguer::Editor::new()
                    .extension(".md")
                    .edit(&seed)
                    .unwrap_or(None)
                {
                    agent::write_with_backup(&path, &edited).await?;
                    println!("HEARTBEAT.md saved.");
                } else {
                    println!("HEARTBEAT.md unchanged.");
                }
            }
        }
    }

    Ok(())
}

// ── Apply manifest ──────────────────────────────────────────────────────────

/// Manifest YAML structure for `agent apply`.
#[derive(Debug, serde::Deserialize)]
struct ApplyManifest {
    model: Option<String>,
    soul: Option<String>,
    tools: Option<String>,
    heartbeat: Option<String>,
}

/// Apply a YAML manifest to an agent workspace.
pub async fn apply_manifest(
    config_path: &Path,
    id: &str,
    manifest_path: &str,
) -> anyhow::Result<()> {
    let raw = std::fs::read_to_string(manifest_path)
        .with_context(|| format!("read manifest {manifest_path}"))?;
    let manifest: ApplyManifest = serde_yaml_ng::from_str(&raw).context("parse apply manifest")?;

    // Resolve workspace
    let workspace = match config::Config::load(config_path).await {
        Ok(cfg) => cfg
            .agents
            .iter()
            .find(|a| a.id == id)
            .map(|a| PathBuf::from(&a.root))
            .unwrap_or_else(|| PathBuf::from("agents").join(id)),
        Err(_) => PathBuf::from("agents").join(id),
    };

    if !workspace.exists() {
        anyhow::bail!("agent root not found: {}", workspace.display());
    }

    if let Some(ref soul) = manifest.soul {
        let path = workspace.join("SOUL.md");
        agent::write_with_backup(&path, soul).await?;
        println!("SOUL.md written.");
    }
    if let Some(ref tools) = manifest.tools {
        let path = workspace.join("TOOLS.md");
        agent::write_with_backup(&path, tools).await?;
        println!("TOOLS.md written.");
    }
    if let Some(ref heartbeat) = manifest.heartbeat {
        let path = workspace.join("HEARTBEAT.md");
        agent::write_with_backup(&path, heartbeat).await?;
        println!("HEARTBEAT.md written.");
    }
    if let Some(ref model) = manifest.model {
        let mut cfg = config::Config::load(config_path).await?;
        if let Some(entry) = cfg.agents.iter_mut().find(|a| a.id == id) {
            entry.model = Some(model.clone());
            cfg.save(config_path).await?;
            println!("config.yaml updated (model: {model}).");
        } else {
            anyhow::bail!("agent '{id}' not found in config.yaml");
        }
    }

    println!("manifest applied to agent '{id}'.");
    Ok(())
}

// ── Status ──────────────────────────────────────────────────────────────────

/// Check whether the Pinchy daemon is running by hitting the gateway /api/status endpoint.
pub async fn check_status() -> anyhow::Result<()> {
    let raw_addr =
        std::env::var("PINCHY_GATEWAY_ADDR").unwrap_or_else(|_| "0.0.0.0:3131".to_string());
    let addr = raw_addr.replace("0.0.0.0", "127.0.0.1");
    let url = format!("http://{addr}/api/status");

    // Build request, optionally with auth token
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()?;

    let mut req = client.get(&url);
    if let Ok(token) = std::env::var("PINCHY_API_TOKEN") {
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    match req.send().await {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            println!("✅ Pinchy daemon is running");
            println!("   Gateway: http://{addr}");
            if let Some(status) = body.get("status").and_then(|s| s.as_str()) {
                println!("   Status:  {status}");
            }

            // Try to get agent count from /api/agents
            let mut agents_req = client.get(format!("http://{addr}/api/agents"));
            if let Ok(token) = std::env::var("PINCHY_API_TOKEN") {
                agents_req = agents_req.header("Authorization", format!("Bearer {token}"));
            }
            if let Ok(agents_resp) = agents_req.send().await {
                if let Ok(agents) = agents_resp.json::<serde_json::Value>().await {
                    if let Some(arr) = agents.as_array() {
                        println!("   Agents:  {}", arr.len());
                    }
                }
            }

            Ok(())
        }
        Ok(resp) => {
            println!("⚠️  Pinchy daemon responded with status: {}", resp.status());
            Ok(())
        }
        Err(_) => {
            println!("❌ Pinchy daemon is not running (no response at http://{addr})");
            println!("   Start it with: pinchy start");
            Ok(())
        }
    }
}

// ── Debug ───────────────────────────────────────────────────────────────────

/// Run a single agent turn via the CLI for debugging.
pub async fn debug_run_turn(
    config_path: &Path,
    agent_id: &str,
    message: &str,
) -> anyhow::Result<()> {
    let cfg = config::Config::load(config_path).await?;

    // Resolve workspace: look up agent in config, or fall back to agents/<id>/
    let workspace = cfg
        .agents
        .iter()
        .find(|a| a.id == agent_id)
        .map(|a| PathBuf::from(&a.root))
        .unwrap_or_else(|| PathBuf::from("agents").join(agent_id));

    debug!(agent = agent_id, workspace = %workspace.display(), "debug run-turn");

    let mut ag = if let Some(agent_cfg) = cfg.agents.iter().find(|a| a.id == agent_id) {
        agent::Agent::new_from_config(agent_cfg, &cfg)
    } else {
        agent::Agent::new(agent_id, &workspace)
    };
    let msg = comm::IncomingMessage {
        agent_id: Some(agent_id.to_string()),
        author: "cli".into(),
        content: message.to_string(),
        channel: "cli:debug".to_string(),
        timestamp: 0,
        session_id: None,
    };
    let reply = ag.run_turn(msg).await?;

    println!("{reply}");
    Ok(())
}

// ── Self-update ──────────────────────────────────────────────────────────────

pub async fn self_update(no_pull: bool, restart: bool) -> anyhow::Result<()> {
    use std::process::Command;

    let repo_root = std::env::current_exe()
        .ok()
        .and_then(|p| {
            let mut dir = p.parent()?.to_path_buf();
            for _ in 0..3 {
                if dir.join("Cargo.toml").exists() {
                    return Some(dir);
                }
                dir = dir.parent()?.to_path_buf();
            }
            None
        })
        .unwrap_or_else(|| std::env::current_dir().expect("cannot determine repo root"));

    println!("📂 Repo: {}", repo_root.display());

    if !no_pull {
        println!("⬇️  Pulling latest…");
        let s = Command::new("git")
            .args(["pull", "--ff-only"])
            .current_dir(&repo_root)
            .status()
            .context("git pull failed")?;
        if !s.success() {
            anyhow::bail!("git pull failed. Use --no-pull to skip.");
        }
    }

    let web_dir = repo_root.join("web");
    if web_dir.join("package.json").exists() {
        println!("🌐 Building frontend…");
        let s = Command::new("pnpm")
            .args(["run", "build"])
            .current_dir(&web_dir)
            .status()
            .context("pnpm build failed")?;
        if !s.success() {
            anyhow::bail!("frontend build failed");
        }
    }

    println!("🔨 Building release…");
    let s = Command::new("cargo")
        .args(["build", "--release"])
        .current_dir(&repo_root)
        .status()
        .context("cargo build failed")?;
    if !s.success() {
        anyhow::bail!("cargo build --release failed");
    }

    let binary = repo_root.join("target/release/pinchy");
    println!("✅ Built: {}", binary.display());

    if std::path::Path::new("/opt/pinchy").exists() {
        println!("📦 Installing to /opt/pinchy/…");
        let _ = Command::new("cp")
            .args([binary.to_str().unwrap(), "/opt/pinchy/pinchy"])
            .status();
    }

    if restart {
        println!("🔄 Restarting service…");
        let _ = Command::new("systemctl")
            .args(["restart", "pinchy"])
            .status();
        println!("✅ Restarted");
    } else {
        println!("💡 Use --restart to also restart the systemd service");
    }

    Ok(())
}

/// Try to detect the system's IANA timezone from `/etc/timezone` or the
/// `TZ` environment variable.
fn iana_tz_from_system() -> Option<String> {
    if let Ok(tz) = std::env::var("TZ") {
        if !tz.is_empty() && tz.parse::<chrono_tz::Tz>().is_ok() {
            return Some(tz);
        }
    }
    if let Ok(link) = std::fs::read_link("/etc/localtime") {
        let path = link.to_string_lossy();
        if let Some(pos) = path.find("zoneinfo/") {
            let tz = &path[pos + 9..];
            if tz.parse::<chrono_tz::Tz>().is_ok() {
                return Some(tz.to_string());
            }
        }
    }
    if let Ok(contents) = std::fs::read_to_string("/etc/timezone") {
        let tz = contents.trim().to_string();
        if tz.parse::<chrono_tz::Tz>().is_ok() {
            return Some(tz);
        }
    }
    None
}
