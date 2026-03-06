//! Integration tests for Phase 2: scheduler slash commands and HTTP API.

use mini_claw::scheduler::{
    HeartbeatHealth, HeartbeatStatus, JobKind, JobRun, JobStatus, PersistedCronJob,
};
use std::path::Path;
use tempfile::TempDir;

/// Construct a PersistedCronJob with phase-4 defaults.
fn pjob(agent_id: &str, name: &str, schedule: &str, message: Option<&str>) -> PersistedCronJob {
    PersistedCronJob {
        agent_id: agent_id.to_string(),
        name: name.to_string(),
        schedule: schedule.to_string(),
        message: message.map(|s| s.to_string()),
        kind: JobKind::default(),
        depends_on: None,
        max_retries: None,
        retry_delay_secs: None,
        condition: None,
        retry_count: 0,
        last_status: None,
    }
}

/// Ensure a global DB is available for all tests in this binary.
fn ensure_test_db() -> &'static mini_claw::store::PinchyDb {
    use std::sync::Once;
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let tmp = std::env::temp_dir().join("pinchy_slash_sched_test");
        let _ = std::fs::create_dir_all(&tmp);
        let db = mini_claw::store::PinchyDb::open(&tmp).expect("open test db");
        mini_claw::store::set_global_db(db);
    });
    mini_claw::store::global_db().expect("test DB should be set")
}

/// Helper: seed heartbeat status into DB.
fn seed_heartbeat_db(status: &HeartbeatStatus) {
    let db = ensure_test_db();
    db.upsert_heartbeat_status(status)
        .expect("upsert heartbeat");
}

/// Helper: seed cron jobs into DB.
fn seed_cron_jobs_db(jobs: &[PersistedCronJob]) {
    let db = ensure_test_db();
    for job in jobs {
        db.upsert_cron_job(job).expect("upsert cron job");
    }
}

/// Helper: seed cron run events into DB.
fn seed_cron_runs_db(runs: &[JobRun]) {
    let db = ensure_test_db();
    for run in runs {
        db.insert_cron_event(run).expect("insert cron event");
    }
}

// ---------------------------------------------------------------------------
// Slash command dispatch tests
// ---------------------------------------------------------------------------

fn make_slash_ctx(agent_id: &str, workspace: &Path) -> mini_claw::slash::Context {
    mini_claw::slash::Context {
        agent_id: agent_id.to_string(),
        agent_root: workspace.to_path_buf(),
        workspace: workspace.join("workspace"),
        channel: "test".to_string(),
        config_path: std::path::PathBuf::from("config.yaml"),
        pinchy_home: mini_claw::pinchy_home(),
    }
}

fn make_registry() -> mini_claw::slash::Registry {
    let reg = mini_claw::slash::Registry::new();
    mini_claw::slash::register_builtin_commands(&reg);
    reg
}

#[tokio::test]
async fn slash_heartbeat_status_returns_table() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    // Create agent subdirectory with heartbeat status
    let agent_ws = agents_dir.join("test-agent");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let status = HeartbeatStatus {
        agent_id: "test-agent".to_string(),
        enabled: true,
        last_tick: Some(1000),
        next_tick: Some(1300),
        interval_secs: Some(300),
        health: HeartbeatHealth::OK,
        message_preview: Some("all good".to_string()),
        latest_session: None,
    };
    seed_heartbeat_db(&status);

    let ctx = make_slash_ctx("test-agent", &agent_ws);
    let reg = make_registry();

    let result = reg.dispatch("test", "/heartbeat status", &ctx).await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(text.contains("test-agent"), "should contain agent ID");
    assert!(text.contains("OK"), "should contain health status");
    assert!(text.contains("300"), "should contain interval");
}

#[tokio::test]
async fn slash_heartbeat_check_returns_details() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    let agent_ws = agents_dir.join("check-agent");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let status = HeartbeatStatus {
        agent_id: "check-agent".to_string(),
        enabled: true,
        last_tick: Some(mini_claw::scheduler::now_secs().saturating_sub(10)),
        next_tick: Some(mini_claw::scheduler::now_secs() + 290),
        interval_secs: Some(300),
        health: HeartbeatHealth::OK,
        message_preview: Some("heartbeat ok".to_string()),
        latest_session: None,
    };
    seed_heartbeat_db(&status);

    let ctx = make_slash_ctx("check-agent", &agent_ws);
    let reg = make_registry();

    let result = reg
        .dispatch("test", "/heartbeat check check-agent", &ctx)
        .await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(text.contains("heartbeat check for check-agent"));
    assert!(text.contains("health: OK"));
}

#[tokio::test]
async fn slash_heartbeat_status_no_data() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    let agent_ws = agents_dir.join("empty-agent");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let ctx = make_slash_ctx("empty-agent", &agent_ws);
    let reg = make_registry();

    let result = reg.dispatch("test", "/heartbeat status", &ctx).await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(text.contains("no heartbeat data found"));
}

#[tokio::test]
async fn slash_cron_list_shows_jobs() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    let agent_ws = agents_dir.join("cron-agent");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let jobs = vec![
        pjob(
            "cron-agent",
            "daily-check",
            "0 0 * * * *",
            Some("run daily check"),
        ),
        pjob("cron-agent", "hourly-ping", "0 0 * * * *", None),
    ];
    seed_cron_jobs_db(&jobs);

    let ctx = make_slash_ctx("cron-agent", &agent_ws);
    let reg = make_registry();

    let result = reg.dispatch("test", "/cron list", &ctx).await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(text.contains("daily-check"), "should list daily-check job");
    assert!(text.contains("hourly-ping"), "should list hourly-ping job");
}

#[tokio::test]
async fn slash_cron_list_empty() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    let agent_ws = agents_dir.join("no-cron");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let ctx = make_slash_ctx("no-cron", &agent_ws);
    let reg = make_registry();

    let result = reg.dispatch("test", "/cron list", &ctx).await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(text.contains("no cron jobs found"));
}

#[tokio::test]
async fn slash_cron_status_shows_runs() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    let agent_ws = agents_dir.join("runs-agent");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let jobs = vec![pjob(
        "runs-agent",
        "my-job",
        "0 0 * * * *",
        Some("test message"),
    )];
    seed_cron_jobs_db(&jobs);

    let runs = vec![
        JobRun {
            id: "run_001".to_string(),
            job_id: "my-job@runs-agent".to_string(),
            scheduled_at: 1000,
            executed_at: Some(1000),
            completed_at: Some(1001),
            status: JobStatus::SUCCESS,
            output_preview: Some("ok".to_string()),
            error: None,
            duration_ms: Some(1000),
        },
        JobRun {
            id: "run_002".to_string(),
            job_id: "my-job@runs-agent".to_string(),
            scheduled_at: 2000,
            executed_at: Some(2000),
            completed_at: Some(2002),
            status: JobStatus::FAILED("timeout".to_string()),
            output_preview: None,
            error: Some("timeout".to_string()),
            duration_ms: Some(2000),
        },
    ];
    seed_cron_runs_db(&runs);

    let ctx = make_slash_ctx("runs-agent", &agent_ws);
    let reg = make_registry();

    let result = reg
        .dispatch("test", "/cron status my-job@runs-agent", &ctx)
        .await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(text.contains("my-job@runs-agent"), "should show job id");
    assert!(text.contains("SUCCESS"), "should show success run");
    assert!(text.contains("FAIL"), "should show failed run");
    assert!(text.contains("runs: 2"), "should show run count");
}

#[tokio::test]
async fn slash_cron_delete_removes_job() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    let agent_ws = agents_dir.join("del-agent");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let jobs = vec![
        pjob("del-agent", "keep-me", "0 0 * * * *", None),
        pjob("del-agent", "delete-me", "0 30 * * * *", Some("bye")),
    ];
    seed_cron_jobs_db(&jobs);

    let ctx = make_slash_ctx("del-agent", &agent_ws);
    let reg = make_registry();

    let result = reg
        .dispatch("test", "/cron delete delete-me@del-agent", &ctx)
        .await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(text.contains("deleted"), "should confirm deletion");

    // Verify file was updated
    let remaining = mini_claw::scheduler::load_persisted_cron_jobs("del-agent").await;
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].name, "keep-me");
}

#[tokio::test]
async fn slash_cron_add_requires_scheduler() {
    let tmp = TempDir::new().unwrap();
    let agents_dir = tmp.path();

    let agent_ws = agents_dir.join("add-agent");
    std::fs::create_dir_all(&agent_ws).unwrap();

    let ctx = make_slash_ctx("add-agent", &agent_ws);
    let reg = make_registry();

    // Without a running scheduler, /cron add should report scheduler not running
    let result = reg
        .dispatch("test", "/cron add 0_0_*_*_*_* do-something", &ctx)
        .await;
    assert!(result.is_ok());

    let mini_claw::slash::SlashResponse::Text(text) = result.unwrap();
    assert!(
        text.contains("scheduler not running"),
        "should indicate scheduler is not running"
    );
}

// ---------------------------------------------------------------------------
// HTTP API tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn api_heartbeat_status_json() {
    // Start a gateway on a random port
    let addr: std::net::SocketAddr = "127.0.0.1:0".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();
    let base_url = format!("http://{}", gw.addr);

    let client = reqwest::Client::new();

    // GET /api/heartbeat/status should return 200 with agents array
    let resp = client
        .get(format!("{base_url}/api/heartbeat/status"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body["agents"].is_array());

    // GET /api/heartbeat/status/nonexistent should return 404
    let resp = client
        .get(format!("{base_url}/api/heartbeat/status/nonexistent"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn api_cron_jobs_json() {
    let addr: std::net::SocketAddr = "127.0.0.1:0".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();
    let base_url = format!("http://{}", gw.addr);

    let client = reqwest::Client::new();

    // GET /api/cron/jobs should return 200 with jobs array
    let resp = client
        .get(format!("{base_url}/api/cron/jobs"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body["jobs"].is_array());
}

#[tokio::test]
async fn api_cron_jobs_agent_not_found() {
    let addr: std::net::SocketAddr = "127.0.0.1:0".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();
    let base_url = format!("http://{}", gw.addr);

    let client = reqwest::Client::new();

    let resp = client
        .get(format!("{base_url}/api/cron/jobs/nonexistent_agent_xyz"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn api_cron_create_without_scheduler() {
    let addr: std::net::SocketAddr = "127.0.0.1:0".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();
    let base_url = format!("http://{}", gw.addr);

    let client = reqwest::Client::new();

    // POST /api/cron/jobs without scheduler running → 503 or 404
    let resp = client
        .post(format!("{base_url}/api/cron/jobs"))
        .json(&serde_json::json!({
            "agent_id": "nonexistent_agent_xyz",
            "schedule": "0 0 * * * *",
            "message": "test"
        }))
        .send()
        .await
        .unwrap();
    // Should return 404 (agent not found) since the agent doesn't exist
    assert!(resp.status().as_u16() == 404 || resp.status().as_u16() == 503);
}

#[tokio::test]
async fn api_status_endpoint() {
    let addr: std::net::SocketAddr = "127.0.0.1:0".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();
    let base_url = format!("http://{}", gw.addr);

    let client = reqwest::Client::new();

    let resp = client
        .get(format!("{base_url}/api/status"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "ok");
}
