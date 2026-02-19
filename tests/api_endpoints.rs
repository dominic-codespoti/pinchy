//! Integration tests for the new REST API endpoints:
//!   - Config load/save
//!   - Agents create/list
//!   - Cron list

use std::net::SocketAddr;
use std::path::PathBuf;

/// Find a free port by binding to :0 and reading the assigned address.
async fn free_addr() -> SocketAddr {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    listener.local_addr().unwrap()
}

// ─── Config endpoints ────────────────────────────────────────────────────────

#[tokio::test]
async fn config_get_returns_json() {
    let tmp = tempfile::tempdir().unwrap();
    let config_path = tmp.path().join("config.yaml");
    let agents_dir = tmp.path().join("agents");
    tokio::fs::create_dir_all(&agents_dir).await.unwrap();

    // Write a minimal valid config
    let yaml = r#"
models:
  - id: test-model
    provider: openai
channels:
  discord:
    token: "$TEST_TOKEN"
agents:
  - id: default
    workspace: ./agents/default
"#;
    tokio::fs::write(&config_path, yaml).await.unwrap();

    // chdir to tmp so relative paths work
    let _guard = ChdirGuard::new(tmp.path());

    let addr = free_addr().await;
    let gw = mini_claw::gateway::start_gateway_with_config(addr, config_path.clone())
        .await
        .unwrap();

    let resp = reqwest::get(format!("http://{}/api/config", gw.addr))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body.get("models").is_some(), "config should have models");
    assert!(body.get("agents").is_some(), "config should have agents");

    gw.handle.abort();
}

#[tokio::test]
async fn config_put_validates_and_saves() {
    let tmp = tempfile::tempdir().unwrap();
    let config_path = tmp.path().join("config.yaml");
    let agents_dir = tmp.path().join("agents");
    tokio::fs::create_dir_all(&agents_dir).await.unwrap();

    let yaml = r#"
models:
  - id: test-model
    provider: openai
channels:
  discord:
    token: "$TEST_TOKEN"
agents:
  - id: default
    workspace: ./agents/default
"#;
    tokio::fs::write(&config_path, yaml).await.unwrap();

    let _guard = ChdirGuard::new(tmp.path());

    let addr = free_addr().await;
    let gw = mini_claw::gateway::start_gateway_with_config(addr, config_path.clone())
        .await
        .unwrap();

    let client = reqwest::Client::new();

    // Valid config update
    let new_config = serde_json::json!({
        "models": [
            { "id": "new-model", "provider": "openai", "model": "gpt-4o" }
        ],
        "channels": { "discord": { "token": "$NEW_TOKEN" } },
        "agents": [
            { "id": "agent-a", "workspace": "./agents/agent-a" }
        ]
    });

    let resp = client
        .put(format!("http://{}/api/config", gw.addr))
        .json(&new_config)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Verify saved file
    let saved = tokio::fs::read_to_string(&config_path).await.unwrap();
    assert!(
        saved.contains("new-model"),
        "saved config should contain new-model"
    );

    // Invalid config should 400
    let invalid_config = serde_json::json!({
        "this_is": "not_a_valid_config"
    });
    let resp = client
        .put(format!("http://{}/api/config", gw.addr))
        .json(&invalid_config)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400);

    gw.handle.abort();
}

// ─── Agent endpoints ─────────────────────────────────────────────────────────

#[tokio::test]
async fn agents_create_and_list() {
    let tmp = tempfile::tempdir().unwrap();
    let config_path = tmp.path().join("config.yaml");
    let agents_dir = tmp.path().join("agents");
    tokio::fs::create_dir_all(&agents_dir).await.unwrap();

    let yaml = r#"
models: []
channels: {}
agents: []
"#;
    tokio::fs::write(&config_path, yaml).await.unwrap();

    let _guard = ChdirGuard::new(tmp.path());
    unsafe { std::env::set_var("PINCHY_HOME", tmp.path()); }

    let addr = free_addr().await;
    let gw = mini_claw::gateway::start_gateway_with_config(addr, config_path)
        .await
        .unwrap();

    let client = reqwest::Client::new();

    // List should be empty initially
    let resp = client
        .get(format!("http://{}/api/agents", gw.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["agents"].as_array().unwrap().len(), 0);

    // Create an agent
    let resp = client
        .post(format!("http://{}/api/agents", gw.addr))
        .json(&serde_json::json!({
            "id": "test-agent",
            "soul": "# Test Agent\nA test."
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201);

    // Verify filesystem
    assert!(agents_dir.join("test-agent").join("SOUL.md").exists());
    assert!(agents_dir.join("test-agent").join("TOOLS.md").exists());
    assert!(agents_dir.join("test-agent").join("HEARTBEAT.md").exists());
    assert!(agents_dir
        .join("test-agent")
        .join("workspace")
        .join("sessions")
        .exists());

    // Check soul content
    let soul = tokio::fs::read_to_string(agents_dir.join("test-agent").join("SOUL.md"))
        .await
        .unwrap();
    assert_eq!(soul, "# Test Agent\nA test.");

    // List should now have 1
    let resp = client
        .get(format!("http://{}/api/agents", gw.addr))
        .send()
        .await
        .unwrap();
    let body: serde_json::Value = resp.json().await.unwrap();
    let agents = body["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 1);
    assert_eq!(agents[0]["id"], "test-agent");
    assert_eq!(agents[0]["has_soul"], true);

    // Create duplicate should fail (409)
    let resp = client
        .post(format!("http://{}/api/agents", gw.addr))
        .json(&serde_json::json!({ "id": "test-agent" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 409);

    // Invalid id should fail (400)
    let resp = client
        .post(format!("http://{}/api/agents", gw.addr))
        .json(&serde_json::json!({ "id": "bad agent!" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400);

    // Get single agent
    let resp = client
        .get(format!("http://{}/api/agents/test-agent", gw.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["id"], "test-agent");
    assert_eq!(body["soul"], "# Test Agent\nA test.");

    // Get nonexistent agent
    let resp = client
        .get(format!("http://{}/api/agents/nonexistent", gw.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404);

    // Update agent
    let resp = client
        .put(format!("http://{}/api/agents/test-agent", gw.addr))
        .json(&serde_json::json!({
            "soul": "# Updated Soul"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let updated_soul = tokio::fs::read_to_string(agents_dir.join("test-agent").join("SOUL.md"))
        .await
        .unwrap();
    assert_eq!(updated_soul, "# Updated Soul");

    // Delete agent
    let resp = client
        .delete(format!("http://{}/api/agents/test-agent", gw.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    assert!(!agents_dir.join("test-agent").exists());

    gw.handle.abort();
}

// ─── Cron list endpoint ──────────────────────────────────────────────────────

#[tokio::test]
async fn cron_jobs_list() {
    let tmp = tempfile::tempdir().unwrap();
    let config_path = tmp.path().join("config.yaml");
    let agents_dir = tmp.path().join("agents");
    let agent_dir = agents_dir.join("cron-agent");
    tokio::fs::create_dir_all(&agent_dir).await.unwrap();

    let yaml = r#"
models: []
channels: {}
agents: []
"#;
    tokio::fs::write(&config_path, yaml).await.unwrap();

    unsafe { std::env::set_var("PINCHY_HOME", tmp.path()); }

    // Write some cron jobs for the agent
    let jobs = serde_json::json!([
        {
            "agent_id": "cron-agent",
            "name": "morning-check",
            "schedule": "0 0 8 * * *",
            "message": "Good morning!",
            "kind": "Recurring"
        },
        {
            "agent_id": "cron-agent",
            "name": "one-shot",
            "schedule": "0 30 12 * * *",
            "message": "Do this once",
            "kind": "OneShot"
        }
    ]);
    tokio::fs::write(
        agent_dir.join("cron_jobs.json"),
        serde_json::to_string_pretty(&jobs).unwrap(),
    )
    .await
    .unwrap();

    let _guard = ChdirGuard::new(tmp.path());

    let addr = free_addr().await;
    let gw = mini_claw::gateway::start_gateway_with_config(addr, config_path)
        .await
        .unwrap();

    let client = reqwest::Client::new();

    // List all cron jobs
    let resp = client
        .get(format!("http://{}/api/cron/jobs", gw.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let body: serde_json::Value = resp.json().await.unwrap();
    let jobs = body["jobs"].as_array().unwrap();
    assert_eq!(jobs.len(), 2);

    // Check that the jobs have the expected fields
    let names: Vec<&str> = jobs.iter().filter_map(|j| j["name"].as_str()).collect();
    assert!(names.contains(&"morning-check"));
    assert!(names.contains(&"one-shot"));

    // List jobs for specific agent
    let resp = client
        .get(format!("http://{}/api/cron/jobs/cron-agent", gw.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["jobs"].as_array().unwrap().len(), 2);

    // List jobs for nonexistent agent
    let resp = client
        .get(format!("http://{}/api/cron/jobs/noagent", gw.addr))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404);

    gw.handle.abort();
}

// ─── Helper: temp chdir ──────────────────────────────────────────────────────

/// RAII guard that changes CWD and restores it on drop.
struct ChdirGuard {
    prev: PathBuf,
}

impl ChdirGuard {
    fn new(dir: &std::path::Path) -> Self {
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(dir).unwrap();
        Self { prev }
    }
}

impl Drop for ChdirGuard {
    fn drop(&mut self) {
        let _ = std::env::set_current_dir(&self.prev);
    }
}
