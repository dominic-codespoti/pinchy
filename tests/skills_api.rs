//! Integration tests for the skills API and agent `enabled_skills` behaviour.
//!
//! Run with: `cargo test --test skills_api`

use std::net::SocketAddr;

/// Spin up a temporary PINCHY_HOME with a config + one global skill,
/// then exercise the skills and agent endpoints.
#[tokio::test]
async fn skills_api_and_agent_enabled_skills() {
    // ── Set up a temporary PINCHY_HOME ──────────────────────────────────
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path();

    // Minimal config.yaml with one agent.
    let config_yaml = r#"
models:
  - id: stub
    provider: openai
    model: gpt-stub

channels: {}

agents:
  - id: test-agent
    workspace: ./workspaces/test-agent
    model: stub
"#;
    std::fs::write(home.join("config.yaml"), config_yaml).unwrap();

    // Create the agent workspace directory so reads don't fail.
    // The gateway uses agent_root = <PINCHY_HOME>/agents/<id>
    std::fs::create_dir_all(home.join("agents/test-agent/workspace")).unwrap();

    // Create a global skill: skills/global/test-skill/skill.yaml
    let skill_dir = home.join("skills/global/test-skill");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("skill.yaml"),
        r#"
id: test-skill
version: "0.1"
scope: global
description: "A test skill for integration tests"
"#,
    )
    .unwrap();

    // Point pinchy_home() at our temp dir.
    unsafe {
        std::env::set_var("PINCHY_HOME", home.as_os_str());
    }
    // Also set CWD to temp dir so repo-local `skills/global/` isn't picked up.
    let orig_dir = std::env::current_dir().unwrap();
    std::env::set_current_dir(home).unwrap();

    // Load skills and sync them into the unified tool registry.
    let mut reg = mini_claw::skills::SkillRegistry::new(None);
    reg.load_global_skills().unwrap();
    mini_claw::tools::sync_skills(&reg);

    // ── Start the gateway ───────────────────────────────────────────────
    let addr: SocketAddr = "127.0.0.1:4020".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();
    let base = format!("http://{}", gw.addr);

    let client = reqwest::Client::new();

    // ── 1. GET /api/skills returns an array containing 'test-skill' ─────
    let resp = client
        .get(format!("{base}/api/skills"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "GET /api/skills should succeed");
    let body: serde_json::Value = resp.json().await.unwrap();
    let skills = body["skills"]
        .as_array()
        .expect("skills should be an array");
    assert!(
        skills.iter().any(|s| s["id"] == "test-skill"),
        "should contain test-skill; got: {skills:?}"
    );

    // ── 2. PUT /api/agents/test-agent with valid enabled_skills ─────────
    let resp = client
        .put(format!("{base}/api/agents/test-agent"))
        .json(&serde_json::json!({ "enabled_skills": ["test-skill"] }))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        200,
        "PUT with valid skill should succeed: {}",
        resp.text().await.unwrap_or_default()
    );

    // ── 3. GET /api/agents/test-agent should reflect enabled_skills ─────
    let resp = client
        .get(format!("{base}/api/agents/test-agent"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let es = body["enabled_skills"]
        .as_array()
        .expect("enabled_skills should be array");
    assert_eq!(
        es,
        &vec![serde_json::json!("test-skill")],
        "enabled_skills should contain exactly [\"test-skill\"]"
    );

    // ── 4. PUT with unknown skill ID returns 400 ────────────────────────
    let resp = client
        .put(format!("{base}/api/agents/test-agent"))
        .json(&serde_json::json!({ "enabled_skills": ["no-such-skill"] }))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        400,
        "PUT with unknown skill should return 400"
    );
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("unknown skill"),
        "error message should mention unknown skill IDs; got: {body}"
    );

    // ── 5. PUT with empty enabled_skills clears the field ─────────────
    let resp = client
        .put(format!("{base}/api/agents/test-agent"))
        .json(&serde_json::json!({ "enabled_skills": [] }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let resp = client
        .get(format!("{base}/api/agents/test-agent"))
        .send()
        .await
        .unwrap();
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(
        body["enabled_skills"].is_null(),
        "enabled_skills should be null after clearing; got: {body}"
    );

    // ── Cleanup ─────────────────────────────────────────────────────────
    std::env::set_current_dir(orig_dir).unwrap();
    unsafe { std::env::remove_var("PINCHY_HOME"); }
    gw.handle.abort();
}
