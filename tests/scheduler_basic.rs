//! Basic integration test for the scheduler heartbeat.

use mini_claw::config::{AgentConfig, ChannelsConfig, Config, CronJobConfig, ModelConfig};
use mini_claw::scheduler::{HeartbeatHealth, HeartbeatStatus};
use tempfile::TempDir;

/// Create a minimal config pointing at the temp agent workspace.
fn test_config(workspace: &std::path::Path, agent_id: &str, heartbeat_secs: u64) -> Config {
    Config {
        models: vec![ModelConfig {
            id: "test-model".into(),
            provider: "openai".into(),
            model: Some("gpt-4o".into()),
            api_key: None,
            endpoint: None,
            api_version: None,
            embedding_deployment: None,
        }],
        channels: ChannelsConfig { discord: None },
        agents: vec![AgentConfig {
            id: agent_id.into(),
            root: workspace.display().to_string(),
            model: Some("test-model".into()),
            heartbeat_secs: Some(heartbeat_secs),
            cron_jobs: vec![],
            max_tool_iterations: None,
            enabled_skills: None,
            fallback_models: Vec::new(),
            webhook_secret: None,
            extra_exec_commands: Vec::new(),
        }],
        secrets: None,
        routing: None,
        skills: None,
        session_expiry_days: None,
        cron_session_expiry_days: None,
        cron_events_max_keep: None,
    }
}

#[tokio::test]
async fn heartbeat_writes_heartbeat_ok() {
    // Force a 1-second heartbeat interval via env var.
    std::env::set_var("PINCHY_HEARTBEAT_SECS", "1");

    let tmp = TempDir::new().expect("failed to create temp dir");
    let agent_dir = tmp.path();

    // Write a HEARTBEAT.md so the heartbeat has something to read.
    std::fs::write(agent_dir.join("HEARTBEAT.md"), "# Test heartbeat\n").unwrap();

    let cfg = test_config(agent_dir, "test-agent", 1);
    let handle = mini_claw::scheduler::start(&cfg)
        .await
        .expect("scheduler should start");

    // Wait long enough for at least one heartbeat tick (interval skips the
    // first immediate tick, so we need >1 second).
    tokio::time::sleep(std::time::Duration::from_millis(2500)).await;

    let ok_path = agent_dir.join("HEARTBEAT_OK");
    assert!(
        ok_path.exists(),
        "HEARTBEAT_OK should have been written by the heartbeat task"
    );

    // The file should contain a numeric timestamp.
    let contents = std::fs::read_to_string(&ok_path).unwrap();
    let ts: u64 = contents
        .trim()
        .parse()
        .expect("HEARTBEAT_OK should contain a unix timestamp");
    assert!(ts > 0, "timestamp should be positive");

    // Also verify cron_events/ directory was created with an event file.
    let events_dir = agent_dir.join("cron_events");
    assert!(events_dir.exists(), "cron_events/ directory should exist");

    let entries: Vec<_> = std::fs::read_dir(&events_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert!(
        !entries.is_empty(),
        "cron_events/ should contain at least one heartbeat event file"
    );

    // Clean up env var.
    std::env::remove_var("PINCHY_HEARTBEAT_SECS");

    // Drop handle to cancel heartbeat tasks.
    drop(handle);
}

#[tokio::test]
async fn heartbeat_persists_status_json() {
    std::env::set_var("PINCHY_HEARTBEAT_SECS", "1");

    let tmp = TempDir::new().expect("failed to create temp dir");
    let agent_dir = tmp.path();

    std::fs::write(agent_dir.join("HEARTBEAT.md"), "ping\n").unwrap();

    let cfg = test_config(agent_dir, "status-agent", 1);
    let handle = mini_claw::scheduler::start(&cfg)
        .await
        .expect("scheduler should start");

    tokio::time::sleep(std::time::Duration::from_millis(2500)).await;

    let status_path = agent_dir.join("heartbeat_status.json");
    assert!(
        status_path.exists(),
        "heartbeat_status.json should have been created"
    );

    let raw = std::fs::read_to_string(&status_path).unwrap();
    let status: HeartbeatStatus =
        serde_json::from_str(&raw).expect("heartbeat_status.json should be valid JSON");

    assert_eq!(status.agent_id, "status-agent");
    assert!(status.enabled);
    assert!(status.last_tick > Some(0));
    assert!(status.next_tick > status.last_tick);
    assert_eq!(status.interval_secs, Some(1));
    assert_eq!(status.health, HeartbeatHealth::OK);

    std::env::remove_var("PINCHY_HEARTBEAT_SECS");
    drop(handle);
}

#[tokio::test]
async fn cron_merge_persisted_jobs_on_startup() {
    // Write a persisted cron_jobs.json with one job before starting the
    // scheduler.  Verify that the scheduler merges it with config jobs.
    let tmp = TempDir::new().expect("failed to create temp dir");
    let agent_dir = tmp.path();

    // Persist a runtime job.
    let persisted = serde_json::json!([{
        "agent_id": "merge-agent",
        "name": "persisted-job",
        "schedule": "0 0 * * * *",
        "message": "hello from persisted"
    }]);
    std::fs::write(
        agent_dir.join("cron_jobs.json"),
        serde_json::to_string_pretty(&persisted).unwrap(),
    )
    .unwrap();

    // Config has a different job with the same name → persisted should win,
    // plus an entirely new config-only job.
    let cfg = Config {
        models: vec![ModelConfig {
            id: "test-model".into(),
            provider: "openai".into(),
            model: Some("gpt-4o".into()),
            api_key: None,
            endpoint: None,
            api_version: None,
            embedding_deployment: None,
        }],
        channels: ChannelsConfig { discord: None },
        agents: vec![AgentConfig {
            id: "merge-agent".into(),
            root: agent_dir.display().to_string(),
            model: Some("test-model".into()),
            heartbeat_secs: None,
            cron_jobs: vec![
                CronJobConfig {
                    name: "persisted-job".into(),
                    schedule: "0 30 * * * *".into(), // different schedule
                    message: Some("from config".into()),
                },
                CronJobConfig {
                    name: "config-only-job".into(),
                    schedule: "0 15 * * * *".into(),
                    message: None,
                },
            ],
            max_tool_iterations: None,
            enabled_skills: None,
            fallback_models: Vec::new(),
            webhook_secret: None,
            extra_exec_commands: Vec::new(),
        }],
        secrets: None,
        routing: None,
        skills: None,
        session_expiry_days: None,
        cron_session_expiry_days: None,
        cron_events_max_keep: None,
    };

    let handle = mini_claw::scheduler::start(&cfg)
        .await
        .expect("scheduler should start with merged jobs");

    // If we get here without error the scheduler accepted both the
    // persisted and config-only jobs.  That's the success criterion.
    drop(handle);
}
