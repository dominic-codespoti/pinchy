//! Integration test: verify that `templates/config.yaml` parses
//! into a valid `Config` struct.

use std::path::Path;

/// The config module is internal to the crate, so we parse the YAML
/// directly using the same serde types via a local mirror of the
/// structs.  This keeps the integration test independent of `pub`
/// visibility while still validating the real config file.
#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct Config {
    models: Vec<ModelConfig>,
    channels: ChannelsConfig,
    agents: Vec<AgentConfig>,
    #[serde(default)]
    secrets: Option<SecretsConfig>,
    #[serde(default)]
    session_expiry_days: Option<u64>,
    #[serde(default)]
    cron_session_expiry_days: Option<u64>,
    #[serde(default)]
    cron_events_max_keep: Option<usize>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct ModelConfig {
    id: String,
    provider: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct ChannelsConfig {
    #[serde(default)]
    discord: Option<DiscordConfig>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
#[serde(untagged)]
enum SecretRef {
    Plain(String),
    Pointer { key: String, source: String },
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct DiscordConfig {
    token: SecretRef,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct SecretsConfig {
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    keyring_service: Option<String>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct AgentConfig {
    id: String,
    #[serde(alias = "workspace")]
    root: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    heartbeat_secs: Option<u64>,
}

#[test]
fn config_yaml_parses() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("templates/config.yaml");
    let contents = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));

    let cfg: Config = serde_yaml::from_str(&contents)
        .unwrap_or_else(|e| panic!("config.yaml failed to parse: {e}"));

    // Sanity checks on the parsed config.
    assert!(!cfg.models.is_empty(), "expected at least one model entry");
    assert!(!cfg.agents.is_empty(), "expected at least one agent entry");

    let first_model = &cfg.models[0];
    assert_eq!(first_model.id, "copilot-default");
    assert_eq!(first_model.provider, "copilot");

    let first_agent = &cfg.agents[0];
    assert_eq!(first_agent.id, "default");
    assert!(
        first_agent.root.contains("default"),
        "agent root should reference 'default'"
    );
}

// ── deny_unknown_fields validation ──────────────────────────

/// Verify that the real config structs (with `deny_unknown_fields`)
/// reject YAML containing unrecognised keys.
#[tokio::test]
async fn unknown_top_level_field_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bad.yaml");
    std::fs::write(
        &path,
        "models: []\nchannels: {}\nagents: []\nfoo_unknown: true\n",
    )
    .unwrap();

    let result = mini_claw::config::Config::load(&path).await;
    assert!(
        result.is_err(),
        "unknown top-level field should cause a parse error"
    );
    let err_msg = format!("{:?}", result.unwrap_err());
    assert!(
        err_msg.contains("unknown field") || err_msg.contains("foo_unknown"),
        "error should mention the unknown field, got: {err_msg}"
    );
}

#[tokio::test]
async fn unknown_agent_field_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bad_agent.yaml");
    std::fs::write(
        &path,
        r#"
models: []
channels: {}
agents:
  - id: test
    workspace: agents/test
    bogus_field: 42
"#,
    )
    .unwrap();

    let result = mini_claw::config::Config::load(&path).await;
    assert!(
        result.is_err(),
        "unknown agent-level field should cause a parse error"
    );
    let err_msg = format!("{:?}", result.unwrap_err());
    assert!(
        err_msg.contains("unknown field") || err_msg.contains("bogus_field"),
        "error should mention the unknown field, got: {err_msg}"
    );
}

// ── .bak fallback ───────────────────────────────────────────

#[tokio::test]
async fn bak_fallback_when_primary_missing() {
    let dir = tempfile::tempdir().unwrap();
    // Only create config.yaml.bak, NOT config.yaml
    let bak_path = dir.path().join("config.yaml.bak");
    std::fs::write(&bak_path, "models: []\nchannels: {}\nagents: []\n").unwrap();

    let primary = dir.path().join("config.yaml");
    let cfg = mini_claw::config::Config::load(&primary)
        .await
        .expect("should fall back to .bak file");
    assert!(cfg.agents.is_empty());
}

#[tokio::test]
async fn no_fallback_when_both_missing() {
    let dir = tempfile::tempdir().unwrap();
    let primary = dir.path().join("config.yaml");
    let result = mini_claw::config::Config::load(&primary).await;
    assert!(result.is_err(), "should fail when neither file exists");
}

// ── pinchy_home fallback ────────────────────────────────────

#[tokio::test]
async fn pinchy_home_fallback_when_project_config_missing() {
    // Set up a fake PINCHY_HOME with a valid config.yaml
    let home_dir = tempfile::tempdir().unwrap();
    std::fs::write(
        home_dir.path().join("config.yaml"),
        "models: []\nchannels: {}\nagents: []\n",
    )
    .unwrap();

    // CWD must be a dir where config.yaml does NOT exist, otherwise the
    // relative path resolves immediately instead of triggering the fallback.
    let empty_dir = tempfile::tempdir().unwrap();
    let prev_dir = std::env::current_dir().unwrap();
    std::env::set_current_dir(empty_dir.path()).unwrap();

    // Point PINCHY_HOME to our tempdir
    unsafe { std::env::set_var("PINCHY_HOME", home_dir.path()); }

    // Request a relative "config.yaml" that doesn't exist on disk
    let missing = std::path::Path::new("config.yaml");
    let cfg = mini_claw::config::Config::load(missing)
        .await
        .expect("should fall back to ~/.pinchy/config.yaml");
    assert!(cfg.agents.is_empty());

    // Cleanup
    unsafe { std::env::remove_var("PINCHY_HOME"); }
    let _ = std::env::set_current_dir(&prev_dir);
}

#[tokio::test]
async fn pinchy_home_bak_fallback() {
    let home_dir = tempfile::tempdir().unwrap();
    // Only .bak exists in PINCHY_HOME
    std::fs::write(
        home_dir.path().join("config.yaml.bak"),
        "models: []\nchannels: {}\nagents: []\n",
    )
    .unwrap();

    // CWD must not contain config.yaml or config.yaml.bak
    let empty_dir = tempfile::tempdir().unwrap();
    let prev_dir = std::env::current_dir().unwrap();
    std::env::set_current_dir(empty_dir.path()).unwrap();

    unsafe { std::env::set_var("PINCHY_HOME", home_dir.path()); }

    let missing = std::path::Path::new("config.yaml");
    let cfg = mini_claw::config::Config::load(missing)
        .await
        .expect("should fall back to ~/.pinchy/config.yaml.bak");
    assert!(cfg.agents.is_empty());

    unsafe { std::env::remove_var("PINCHY_HOME"); }
    let _ = std::env::set_current_dir(&prev_dir);
}

#[tokio::test]
async fn no_pinchy_home_fallback_for_absolute_paths() {
    let home_dir = tempfile::tempdir().unwrap();
    std::fs::write(
        home_dir.path().join("config.yaml"),
        "models: []\nchannels: {}\nagents: []\n",
    )
    .unwrap();

    unsafe { std::env::set_var("PINCHY_HOME", home_dir.path()); }

    // Use an absolute path that doesn't exist — should NOT fall back
    let abs_missing = home_dir.path().join("subdir").join("config.yaml");
    let result = mini_claw::config::Config::load(&abs_missing).await;
    assert!(
        result.is_err(),
        "absolute paths should not trigger pinchy_home fallback"
    );

    unsafe { std::env::remove_var("PINCHY_HOME"); }
}
