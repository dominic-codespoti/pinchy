//! Phase 4 advanced scheduler tests: oneshot, retry, dependency blocking.

use mini_claw::config::{AgentConfig, ChannelsConfig, Config, ModelConfig};
use mini_claw::scheduler::{
    check_dependencies, load_cron_runs, load_persisted_cron_jobs, JobKind, JobRun, JobStatus,
    PersistedCronJob,
};
use tempfile::TempDir;

/// Build a minimal Config for a single agent (no heartbeat).
fn test_config(workspace: &std::path::Path, agent_id: &str) -> Config {
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
        channels: ChannelsConfig { discord: None, default_channel: None },
        agents: vec![AgentConfig {
            id: agent_id.into(),
            root: workspace.display().to_string(),
            model: Some("test-model".into()),
            heartbeat_secs: None,
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

// ── Backward compatibility ──────────────────────────────────────────────

#[test]
fn backward_compat_deserialize_old_format() {
    // Old-format JSON without any Phase 4 fields should deserialize
    // with sensible defaults.
    let old_json = r#"[
        {
            "agent_id": "a",
            "name": "j",
            "schedule": "0 0 * * * *",
            "message": "hello"
        }
    ]"#;
    let jobs: Vec<PersistedCronJob> =
        serde_json::from_str(old_json).expect("should deserialize old format");
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].kind, JobKind::Recurring);
    assert_eq!(jobs[0].retry_count, 0);
    assert!(jobs[0].depends_on.is_none());
    assert!(jobs[0].max_retries.is_none());
    assert!(jobs[0].retry_delay_secs.is_none());
    assert!(jobs[0].condition.is_none());
    assert!(jobs[0].last_status.is_none());
}

#[test]
fn round_trip_new_fields() {
    let job = PersistedCronJob {
        agent_id: "a".into(),
        name: "j".into(),
        schedule: "* * * * * *".into(),
        message: Some("msg".into()),
        kind: JobKind::OneShot,
        depends_on: Some(vec!["dep1".into(), "dep2".into()]),
        max_retries: Some(5),
        retry_delay_secs: Some(10),
        condition: None,
        retry_count: 2,
        last_status: Some("FAILED".into()),
    };
    let json = serde_json::to_string(&job).unwrap();
    let decoded: PersistedCronJob = serde_json::from_str(&json).unwrap();
    assert_eq!(decoded.kind, JobKind::OneShot);
    assert_eq!(decoded.depends_on.as_ref().unwrap().len(), 2);
    assert_eq!(decoded.max_retries, Some(5));
    assert_eq!(decoded.retry_delay_secs, Some(10));
    assert_eq!(decoded.retry_count, 2);
    assert_eq!(decoded.last_status.as_deref(), Some("FAILED"));
}

// ── Dependency checking ─────────────────────────────────────────────────

#[tokio::test]
async fn dependency_met_when_dep_succeeded() {
    let tmp = TempDir::new().unwrap();

    // Write a SUCCESS run for "dep_job".
    let run = JobRun {
        id: "r1".into(),
        job_id: "dep_job@test-agent".into(),
        scheduled_at: 100,
        executed_at: Some(100),
        completed_at: Some(101),
        status: JobStatus::SUCCESS,
        output_preview: None,
        error: None,
        duration_ms: Some(1000),
    };
    let line = serde_json::to_string(&run).unwrap();
    std::fs::write(tmp.path().join("cron_runs.jsonl"), format!("{line}\n")).unwrap();

    let deps = Some(vec!["dep_job".to_string()]);
    assert!(
        check_dependencies(tmp.path(), &deps, "test-agent").await,
        "dependency should be met when dep has SUCCESS run"
    );
}

#[tokio::test]
async fn dependency_blocks_when_dep_not_run() {
    let tmp = TempDir::new().unwrap();

    let deps = Some(vec!["missing_job".to_string()]);
    assert!(
        !check_dependencies(tmp.path(), &deps, "test-agent").await,
        "dependency should block when dep has never run"
    );
}

#[tokio::test]
async fn dependency_blocks_when_dep_failed() {
    let tmp = TempDir::new().unwrap();

    let run = JobRun {
        id: "r1".into(),
        job_id: "dep_job@test-agent".into(),
        scheduled_at: 100,
        executed_at: Some(100),
        completed_at: Some(101),
        status: JobStatus::FAILED("boom".into()),
        output_preview: None,
        error: Some("boom".into()),
        duration_ms: Some(500),
    };
    let line = serde_json::to_string(&run).unwrap();
    std::fs::write(tmp.path().join("cron_runs.jsonl"), format!("{line}\n")).unwrap();

    let deps = Some(vec!["dep_job".to_string()]);
    assert!(
        !check_dependencies(tmp.path(), &deps, "test-agent").await,
        "dependency should block when dep's last run is FAILED"
    );
}

#[tokio::test]
async fn dependency_none_always_passes() {
    let tmp = TempDir::new().unwrap();
    assert!(check_dependencies(tmp.path(), &None, "a").await);
    assert!(check_dependencies(tmp.path(), &Some(vec![]), "a").await);
}

// ── OneShot job removal ─────────────────────────────────────────────────

#[tokio::test]
async fn oneshot_job_removed_after_success() {
    let tmp = TempDir::new().unwrap();
    let ws = tmp.path();

    // Pre-populate cron_jobs.json with a OneShot job that fires every second.
    let jobs = vec![PersistedCronJob {
        agent_id: "os-agent".into(),
        name: "oneshot-test".into(),
        schedule: "* * * * * *".into(),
        message: Some("[oneshot test]".into()),
        kind: JobKind::OneShot,
        depends_on: None,
        max_retries: None,
        retry_delay_secs: None,
        condition: None,
        retry_count: 0,
        last_status: None,
    }];
    std::fs::write(
        ws.join("cron_jobs.json"),
        serde_json::to_string_pretty(&jobs).unwrap(),
    )
    .unwrap();

    let cfg = test_config(ws, "os-agent");
    let handle = mini_claw::scheduler::start(&cfg)
        .await
        .expect("scheduler should start");

    // Wait for the oneshot job to fire and be removed.
    tokio::time::sleep(std::time::Duration::from_secs(4)).await;

    // The job should no longer be in cron_jobs.json.
    let remaining = load_persisted_cron_jobs(ws).await;
    assert!(
        remaining.iter().all(|j| j.name != "oneshot-test"),
        "oneshot job should be removed after success; remaining: {:?}",
        remaining.iter().map(|j| &j.name).collect::<Vec<_>>()
    );

    // Verify there was at least one successful run.
    let runs = load_cron_runs(ws).await;
    assert!(
        runs.iter()
            .any(|r| r.job_id == "oneshot-test@os-agent" && r.status == JobStatus::SUCCESS),
        "should have a SUCCESS run for the oneshot job"
    );

    drop(handle);
}

// ── Retry logic ─────────────────────────────────────────────────────────

#[tokio::test]
async fn retry_records_multiple_failures() {
    let tmp = TempDir::new().unwrap();
    let ws = tmp.path();

    // Block session writing by creating `sessions` as a file (not a dir).
    std::fs::write(ws.join("sessions"), "blocker").unwrap();

    let jobs = vec![PersistedCronJob {
        agent_id: "retry-agent".into(),
        name: "retry-test".into(),
        schedule: "* * * * * *".into(),
        message: Some("[retry test]".into()),
        kind: JobKind::Recurring,
        depends_on: None,
        max_retries: Some(3),
        retry_delay_secs: Some(1),
        condition: None,
        retry_count: 0,
        last_status: None,
    }];
    std::fs::write(
        ws.join("cron_jobs.json"),
        serde_json::to_string_pretty(&jobs).unwrap(),
    )
    .unwrap();

    let cfg = test_config(ws, "retry-agent");
    let handle = mini_claw::scheduler::start(&cfg)
        .await
        .expect("scheduler should start");

    // Wait for initial fire + at least one retry (1s base delay * 2^0 = 1s).
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

    let runs = load_cron_runs(ws).await;
    let failed_runs: Vec<_> = runs
        .iter()
        .filter(|r| {
            r.job_id == "retry-test@retry-agent" && matches!(r.status, JobStatus::FAILED(_))
        })
        .collect();

    assert!(
        failed_runs.len() >= 2,
        "expected at least 2 failed runs (initial + retry), got {}",
        failed_runs.len()
    );

    drop(handle);
}

#[tokio::test]
async fn retry_succeeds_after_initial_failures() {
    let tmp = TempDir::new().unwrap();
    let ws = tmp.path();

    // Block session writing initially.
    std::fs::write(ws.join("sessions"), "blocker").unwrap();

    let jobs = vec![PersistedCronJob {
        agent_id: "rs-agent".into(),
        name: "rs-test".into(),
        schedule: "* * * * * *".into(),
        message: Some("[retry-succeed]".into()),
        kind: JobKind::Recurring,
        depends_on: None,
        max_retries: Some(5),
        retry_delay_secs: Some(1),
        condition: None,
        retry_count: 0,
        last_status: None,
    }];
    std::fs::write(
        ws.join("cron_jobs.json"),
        serde_json::to_string_pretty(&jobs).unwrap(),
    )
    .unwrap();

    let cfg = test_config(ws, "rs-agent");
    let handle = mini_claw::scheduler::start(&cfg)
        .await
        .expect("scheduler should start");

    // Wait for a couple of failures.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    // Unblock: remove the file and let the dir be created naturally.
    std::fs::remove_file(ws.join("sessions")).unwrap();

    // Wait for the retry to succeed.
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

    let runs = load_cron_runs(ws).await;
    let target_runs: Vec<_> = runs
        .iter()
        .filter(|r| r.job_id == "rs-test@rs-agent")
        .collect();

    let has_failure = target_runs
        .iter()
        .any(|r| matches!(r.status, JobStatus::FAILED(_)));
    let has_success = target_runs.iter().any(|r| r.status == JobStatus::SUCCESS);

    assert!(has_failure, "should have at least one FAILED run");
    assert!(
        has_success,
        "should eventually succeed after unblocking sessions"
    );

    drop(handle);
}

// ── Dependency blocks execution ─────────────────────────────────────────

#[tokio::test]
async fn dependency_prevents_job_execution() {
    let tmp = TempDir::new().unwrap();
    let ws = tmp.path();

    // Job that depends on "precursor" which hasn't run.
    let jobs = vec![PersistedCronJob {
        agent_id: "dep-agent".into(),
        name: "dependent".into(),
        schedule: "* * * * * *".into(),
        message: Some("[dep test]".into()),
        kind: JobKind::Recurring,
        depends_on: Some(vec!["precursor".to_string()]),
        max_retries: None,
        retry_delay_secs: None,
        condition: None,
        retry_count: 0,
        last_status: None,
    }];
    std::fs::write(
        ws.join("cron_jobs.json"),
        serde_json::to_string_pretty(&jobs).unwrap(),
    )
    .unwrap();

    let cfg = test_config(ws, "dep-agent");
    let handle = mini_claw::scheduler::start(&cfg)
        .await
        .expect("scheduler should start");

    // Wait for the job to attempt a few times.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let runs = load_cron_runs(ws).await;
    let dep_runs: Vec<_> = runs
        .iter()
        .filter(|r| r.job_id == "dependent@dep-agent")
        .collect();

    // All runs should be FAILED with "dependency not satisfied"
    assert!(
        !dep_runs.is_empty(),
        "job should have attempted to run at least once"
    );
    for r in &dep_runs {
        match &r.status {
            JobStatus::FAILED(msg) => {
                assert!(
                    msg.contains("dependency"),
                    "expected dependency error, got: {msg}"
                );
            }
            other => panic!("expected FAILED status, got: {:?}", other),
        }
    }

    // No session file should have been created (the job never executed).
    assert!(
        !ws.join("sessions").join("dep-agent.jsonl").exists(),
        "session file should NOT exist since job was blocked by dependency"
    );

    drop(handle);
}
