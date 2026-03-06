use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{interval, Duration};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{debug, error, info, trace, warn};

use crate::comm;
use crate::config::Config;
use crate::gateway;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Handle returned by [`Scheduler::start`].  Holds the background task
/// handles and the cron scheduler so they stay alive.  Dropping this
/// handle cancels all heartbeat tasks (cron scheduler is Arc-ref-counted
/// internally by `tokio_cron_scheduler`).
pub struct SchedulerHandle {
    _heartbeat_handles: Vec<JoinHandle<()>>,
    _cron_scheduler: Option<JobScheduler>,
    /// Shared list of persisted cron job specs so `register_job` can
    /// append at runtime.
    cron_jobs: Arc<Mutex<Vec<PersistedCronJob>>>,
    /// Cron scheduler reference for runtime registration.
    pub cron_scheduler: Option<JobScheduler>,
    /// Maps "name@agent_id" -> scheduler UUID so we can remove live jobs.
    job_uuids: Arc<Mutex<HashMap<String, uuid::Uuid>>>,
}

/// The kind of a cron job.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum JobKind {
    #[default]
    Recurring,
    OneShot,
}

/// Status of a single job run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum JobStatus {
    PENDING,
    RUNNING,
    SUCCESS,
    FAILED(String),
}

/// Health status for heartbeat monitoring.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum HeartbeatHealth {
    OK,
    MISSED,
    ERROR(String),
}

/// Heartbeat status for a single agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatStatus {
    pub agent_id: String,
    pub enabled: bool,
    pub health: HeartbeatHealth,
    pub last_tick: Option<u64>,
    pub next_tick: Option<u64>,
    pub interval_secs: Option<u64>,
    pub message_preview: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_session: Option<String>,
}

/// A single persisted cron job run record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRun {
    pub id: String,
    pub job_id: String,
    pub scheduled_at: u64,
    pub executed_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub status: JobStatus,
    pub output_preview: Option<String>,
    pub error: Option<String>,
    pub duration_ms: Option<u64>,
}

/// A cron job entry persisted in the `cron_jobs` SQLite table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedCronJob {
    pub agent_id: String,
    pub name: String,
    pub schedule: String,
    pub message: Option<String>,
    #[serde(default)]
    pub kind: JobKind,
    #[serde(default)]
    pub depends_on: Option<Vec<String>>,
    #[serde(default)]
    pub max_retries: Option<u32>,
    #[serde(default)]
    pub retry_delay_secs: Option<u64>,
    #[serde(default)]
    pub condition: Option<String>,
    #[serde(default)]
    pub retry_count: u32,
    #[serde(default)]
    pub last_status: Option<String>,
}

/// Resolve the effective timezone for an agent from config.
fn resolve_agent_timezone(config: &Config, agent_id: &str) -> chrono_tz::Tz {
    config.resolve_timezone(agent_id)
}

/// Read the heartbeat interval from `PINCHY_HEARTBEAT_SECS` env var,
/// falling back to the per-agent config value, then to the provided
/// `default`.
fn resolve_heartbeat_secs(config_value: Option<u64>, default: u64) -> u64 {
    if let Ok(val) = std::env::var("PINCHY_HEARTBEAT_SECS") {
        if let Ok(s) = val.parse::<u64>() {
            return s;
        }
    }
    config_value.unwrap_or(default)
}

impl SchedulerHandle {
    /// Register a new cron job at runtime.  The job is persisted and
    /// scheduled immediately.
    pub async fn register_job(&self, mut entry: PersistedCronJob) -> anyhow::Result<()> {
        entry.schedule = normalize_cron_schedule(&entry.schedule);
        let agent_id = entry.agent_id.clone();
        let name = entry.name.clone();
        let schedule = entry.schedule.clone();
        let message = entry.message.clone();
        let job_key = format!("{}@{}", name, agent_id);

        // Remove any existing live job with the same key first.
        {
            let mut uuids = self.job_uuids.lock().await;
            if let Some(old_uuid) = uuids.remove(&job_key) {
                if let Some(sched) = &self.cron_scheduler {
                    let _ = sched.remove(&old_uuid).await;
                }
            }
        }

        // Persist --------------------------------------------------------
        {
            let mut jobs = self.cron_jobs.lock().await;
            // Deduplicate: remove any existing job with the same name+agent
            jobs.retain(|j| !(j.name == entry.name && j.agent_id == entry.agent_id));
            jobs.push(entry.clone());

            // Prefer PinchyDb.
            if let Some(db) = crate::store::global_db() {
                db.upsert_cron_job(&entry)
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
            } else {
                warn!("no database available — skipping register_job persistence");
            }
        }

        // Schedule -------------------------------------------------------
        if let Some(sched) = &self.cron_scheduler {
            let aid = agent_id.to_string();
            let jn = name.to_string();
            let msg = message.unwrap_or_else(|| format!("[cron:{}]", jn));

            // Resolve timezone for this agent.
            let tz = {
                let config_path = crate::pinchy_home().join("config.yaml");
                crate::config::Config::load(&config_path)
                    .await
                    .map(|cfg| resolve_agent_timezone(&cfg, &aid))
                    .unwrap_or(chrono_tz::UTC)
            };

            let job = Job::new_async_tz(schedule, tz, move |_uuid, _lock| {
                let aid = aid.clone();
                let jn = jn.clone();
                let msg = msg.clone();
                Box::pin(async move {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    debug!(agent = %aid, job = %jn, "runtime cron job fired");

                    // Create a dedicated session for this cron fire.
                    let session_id = format!(
                        "cron_{}_{}",
                        jn.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_"),
                        now,
                    );

                    let incoming = comm::IncomingMessage {
                        agent_id: Some(aid.clone()),
                        channel: format!("cron:{jn}"),
                        author: format!("cron:{jn}"),
                        content: msg.clone(),
                        timestamp: now as i64,
                        session_id: Some(session_id),
                        images: Vec::new(),
                    };

                    if let Err(e) = comm::sender().send(incoming) {
                        error!(agent = %aid, job = %jn, error = %e,
                               "failed to dispatch runtime cron message");
                    }

                    gateway::publish_event_json(&serde_json::json!({
                        "type": "cron",
                        "agent": aid,
                        "job": jn,
                        "timestamp": now,
                    }));
                })
            })
            .context("failed to create cron job")?;

            let uuid = sched
                .add(job)
                .await
                .context("failed to add cron job to scheduler")?;
            self.job_uuids.lock().await.insert(job_key, uuid);
        }

        debug!(agent = %agent_id, job = %name, "registered cron job at runtime");
        Ok(())
    }

    /// Remove a cron job from the live scheduler and in-memory list.
    pub async fn remove_job(&self, name: &str, agent_id: &str) {
        let job_key = format!("{name}@{agent_id}");

        // Remove from live scheduler.
        {
            let mut uuids = self.job_uuids.lock().await;
            if let Some(uuid) = uuids.remove(&job_key) {
                if let Some(sched) = &self.cron_scheduler {
                    if let Err(e) = sched.remove(&uuid).await {
                        warn!(job = %job_key, error = %e, "failed to remove job from live scheduler");
                    } else {
                        debug!(job = %job_key, "removed job from live scheduler");
                    }
                }
            }
        }

        // Remove from in-memory list.
        {
            let mut jobs = self.cron_jobs.lock().await;
            jobs.retain(|j| !(j.name == name && j.agent_id == agent_id));
        }
    }
}

/// Start the scheduler: spawns heartbeat tasks for every agent that has a
/// `HEARTBEAT.md` and registers cron jobs from config.
///
/// Returns a [`SchedulerHandle`] that keeps background work alive.
pub async fn start(config: &Config) -> anyhow::Result<SchedulerHandle> {
    info!("scheduler: initializing heartbeats and cron jobs");

    let mut heartbeat_handles: Vec<JoinHandle<()>> = Vec::new();

    // --- Heartbeats ---
    for agent in &config.agents {
        let secs = match agent.heartbeat_secs {
            Some(s) => resolve_heartbeat_secs(Some(s), 300),
            None => {
                // Check env var even when config doesn't set heartbeat_secs.
                if std::env::var("PINCHY_HEARTBEAT_SECS").is_ok() {
                    resolve_heartbeat_secs(None, 300)
                } else {
                    continue;
                }
            }
        };

        let agent_id = agent.id.clone();
        let agent_root = PathBuf::from(&agent.root);

        // Only spawn if the agent root actually has HEARTBEAT.md (or will
        // be created shortly).  We still spawn even when it doesn't exist
        // yet — the heartbeat loop handles a missing file gracefully.
        debug!(agent = %agent_id, interval_secs = secs, "spawning heartbeat task");

        let handle = tokio::spawn(async move {
            // Catch panics so one misbehaving heartbeat can't crash the
            // whole scheduler.
            let aid = agent_id.clone();
            let ws = agent_root.clone();
            let result = tokio::spawn(async move {
                run_heartbeat(&aid, &ws, secs).await;
            });
            match result.await {
                Ok(()) => {}
                Err(e) => {
                    error!(agent = %agent_id, error = %e, "heartbeat task panicked");
                }
            }
        });
        heartbeat_handles.push(handle);
    }

    // --- Cron jobs (DB is the single source of truth) ---

    // Seed config-defined cron jobs into DB so config.yaml acts as a
    // declarative bootstrap.  Existing DB entries are left as-is (the
    // user may have updated schedule/message via the API).
    if let Some(db) = crate::store::global_db() {
        for agent in &config.agents {
            for job_cfg in &agent.cron_jobs {
                // Only insert if no DB row exists for this (agent, name) pair.
                let existing = db.list_cron_jobs(&agent.id).unwrap_or_default();
                if !existing.iter().any(|j| j.name == job_cfg.name) {
                    let entry = PersistedCronJob {
                        agent_id: agent.id.clone(),
                        name: job_cfg.name.clone(),
                        schedule: normalize_cron_schedule(&job_cfg.schedule),
                        message: job_cfg.message.clone(),
                        kind: JobKind::Recurring,
                        depends_on: None,
                        max_retries: None,
                        retry_delay_secs: None,
                        condition: None,
                        retry_count: 0,
                        last_status: None,
                    };
                    if let Err(e) = db.upsert_cron_job(&entry) {
                        warn!(agent = %agent.id, job = %job_cfg.name,
                              error = %e, "failed to seed config cron job into DB");
                    } else {
                        debug!(agent = %agent.id, job = %job_cfg.name,
                               "seeded config cron job into DB");
                    }
                }
            }
        }
    }

    // Load all cron jobs from DB (the single source of truth).
    let mut all_jobs: Vec<PersistedCronJob> = Vec::new();
    for agent in &config.agents {
        let pjobs = load_persisted_cron_jobs(&agent.id).await;
        all_jobs.extend(pjobs);
    }

    let persisted_jobs_list = Arc::new(Mutex::new(Vec::<PersistedCronJob>::new()));

    let (cron_sched, cron_sched_for_handle, job_uuids_map) = if !all_jobs.is_empty() {
        let sched = JobScheduler::new()
            .await
            .context("failed to create cron scheduler")?;

        let job_uuids_map: Arc<Mutex<HashMap<String, uuid::Uuid>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // Register all jobs from DB using the unified persisted-job path.
        for pjob in &all_jobs {
            let mut pj = pjob.clone();
            pj.schedule = normalize_cron_schedule(&pj.schedule);

            debug!(agent = %pj.agent_id, job = %pj.name, schedule = %pj.schedule,
                   "registering cron job from DB");

            let schedule = pj.schedule.clone();
            let job = Job::new_async_tz(
                schedule.as_str(),
                resolve_agent_timezone(config, &pj.agent_id),
                move |_uuid, _lock| {
                    let pj = pj.clone();
                    Box::pin(async move {
                        run_persisted_job_tick(&pj).await;
                    })
                },
            )
            .context("failed to create cron job")?;

            let uuid = sched.add(job).await.context("failed to add cron job")?;

            let job_key = format!("{}@{}", pjob.name, pjob.agent_id);
            job_uuids_map.lock().await.insert(job_key, uuid);
        }

        sched
            .start()
            .await
            .context("failed to start cron scheduler")?;

        debug!("scheduler: cron scheduler started");
        (Some(sched.clone()), Some(sched), job_uuids_map)
    } else {
        debug!("scheduler: no cron jobs configured");
        (None, None, Arc::new(Mutex::new(HashMap::new())))
    };

    info!("scheduler: initialized");
    Ok(SchedulerHandle {
        _heartbeat_handles: heartbeat_handles,
        _cron_scheduler: cron_sched,
        cron_jobs: persisted_jobs_list,
        cron_scheduler: cron_sched_for_handle,
        job_uuids: job_uuids_map,
    })
}

/// Global handle storage so other modules can access the scheduler at runtime.
static SCHEDULER_HANDLE: tokio::sync::OnceCell<SchedulerHandle> =
    tokio::sync::OnceCell::const_new();

/// Store the scheduler handle globally for runtime access by slash commands
/// and the gateway.
pub async fn set_scheduler_handle(handle: SchedulerHandle) {
    let _ = SCHEDULER_HANDLE.set(handle);
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

/// Heartbeat loop: periodically reads `HEARTBEAT.md` from the agent workspace,
/// writes `HEARTBEAT_OK` with a timestamp, enqueues a system
/// [`comm::IncomingMessage`] on the global comm bus, and persists a session log
/// entry.
async fn run_heartbeat(agent_id: &str, workspace: &Path, interval_secs: u64) {
    let mut tick = interval(Duration::from_secs(interval_secs));
    let tx = comm::sender();

    // The first tick completes immediately — skip it so we don't heartbeat on
    // startup before the agent workspace is ready.
    tick.tick().await;

    loop {
        tick.tick().await;

        let heartbeat_path = workspace.join("HEARTBEAT.md");
        let content = match tokio::fs::read_to_string(&heartbeat_path).await {
            Ok(c) => c,
            Err(_) => {
                // Missing file is fine — use a default heartbeat message.
                "heartbeat tick".to_string()
            }
        };

        let preview: String = content.chars().take(200).collect();
        trace!(agent = %agent_id, preview = %preview, "heartbeat: tick");

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // --- Write HEARTBEAT_OK with timestamp --------------------------
        let ok_path = workspace.join("HEARTBEAT_OK");
        let ok_body = format!("{}\n", now);
        if let Err(e) = tokio::fs::write(&ok_path, &ok_body).await {
            error!(agent = %agent_id, error = %e, "heartbeat: failed to write HEARTBEAT_OK");
        }

        // --- Persist heartbeat status -----------------------------------
        let latest_session = if let Some(db) = crate::store::global_db() {
            db.current_session(agent_id).ok().flatten()
        } else {
            warn!(agent = %agent_id, "no database available — skipping heartbeat latest_session lookup");
            None
        };
        let status = HeartbeatStatus {
            agent_id: agent_id.to_string(),
            enabled: true,
            health: HeartbeatHealth::OK,
            last_tick: Some(now),
            next_tick: Some(now + interval_secs),
            interval_secs: Some(interval_secs),
            message_preview: Some(preview.clone()),
            latest_session,
        };

        if let Some(db) = crate::store::global_db() {
            if let Err(e) = db.upsert_heartbeat_status(&status) {
                error!(agent = %agent_id, error = %e, "heartbeat: failed to upsert heartbeat_status in db");
            }
        } else {
            warn!(agent = %agent_id, "no database available — skipping heartbeat status persistence");
        }

        // --- Write event to cron_events (db or file) --------------------
        if let Some(db) = crate::store::global_db() {
            let event = crate::scheduler::JobRun {
                id: format!("heartbeat-{}-{}", agent_id, now),
                job_id: format!("heartbeat@{}", agent_id),
                scheduled_at: now,
                executed_at: Some(now),
                completed_at: Some(now),
                status: JobStatus::SUCCESS,
                output_preview: Some(preview.clone()),
                error: None,
                duration_ms: Some(0),
            };
            if let Err(e) = db.insert_cron_event(&event) {
                error!(agent = %agent_id, error = %e, "heartbeat: failed to insert cron event in db");
            }
        } else {
            warn!(agent = %agent_id, "no database available — skipping heartbeat cron event persistence");
        }

        // --- Comm bus notification -------------------------------------
        let msg = comm::IncomingMessage {
            agent_id: Some(agent_id.to_string()),
            channel: "heartbeat".to_string(),
            author: "scheduler".to_string(),
            content: content.clone(),
            timestamp: now as i64,
            session_id: None,
            images: Vec::new(),
        };

        // Best-effort send — if no receivers are active yet the message is
        // simply dropped.
        if let Err(e) = tx.send(msg) {
            warn!(agent = %agent_id, error = %e, "heartbeat: no comm receivers");
        }

        // --- Gateway event broadcast -----------------------------------
        gateway::publish_event_json(&serde_json::json!({
            "type": "heartbeat",
            "agent": agent_id,
            "timestamp": now,
        }));
    }
}

// ---------------------------------------------------------------------------
// Public utility functions used by the gateway
// ---------------------------------------------------------------------------

/// Return the current Unix timestamp in seconds.
pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Return a reference to the global scheduler handle, if it has been set.
pub fn scheduler_handle_ref() -> Option<&'static SchedulerHandle> {
    SCHEDULER_HANDLE.get()
}

/// Load the heartbeat status for a given agent.
pub async fn load_heartbeat_status(agent_id: &str) -> Option<HeartbeatStatus> {
    if let Some(db) = crate::store::global_db() {
        return db.load_heartbeat_status(agent_id).ok().flatten();
    }

    warn!(agent = %agent_id, "no database available — skipping load_heartbeat_status");
    None
}

/// Load persisted cron job entries from db.
pub async fn load_persisted_cron_jobs(agent_id: &str) -> Vec<PersistedCronJob> {
    if let Some(db) = crate::store::global_db() {
        return db.list_cron_jobs(agent_id).unwrap_or_default();
    }

    warn!("no database available — skipping load_persisted_cron_jobs");
    Vec::new()
}

/// Load cron run records for a given agent.
pub async fn load_cron_runs(agent_id: &str) -> Vec<JobRun> {
    if let Some(db) = crate::store::global_db() {
        return db.list_cron_events_for_agent(agent_id).unwrap_or_default();
    }

    warn!("no database available — skipping load_cron_runs");
    Vec::new()
}

/// Check whether all dependency jobs have at least one SUCCESS run.
/// Returns `true` if there are no dependencies or all are satisfied.
pub async fn check_dependencies(depends_on: &Option<Vec<String>>, agent_id: &str) -> bool {
    let deps = match depends_on {
        Some(d) if !d.is_empty() => d,
        _ => return true,
    };

    let runs = load_cron_runs(agent_id).await;
    for dep in deps {
        let full_id = format!("{}@{}", dep, agent_id);
        // Check if the most recent run for this dep is SUCCESS.
        let last_run = runs.iter().rev().find(|r| r.job_id == full_id);
        match last_run {
            Some(r) if r.status == JobStatus::SUCCESS => {}
            _ => return false,
        }
    }
    true
}

// ---------------------------------------------------------------------------
// Persisted cron job execution helpers
// ---------------------------------------------------------------------------

/// Persist a cron run record to PinchyDb.
async fn persist_cron_run(run: &JobRun) -> anyhow::Result<()> {
    // Prefer PinchyDb.
    if let Some(db) = crate::store::global_db() {
        return db
            .insert_cron_event(run)
            .map_err(|e| anyhow::anyhow!("{e}"));
    }

    warn!("no database available — skipping persist_cron_run");
    Ok(())
}

/// Remove a job (by name + agent_id) from PinchyDb and the live scheduler.
pub async fn remove_persisted_job(name: &str, agent_id: &str) {
    // Remove from live scheduler + in-memory list.
    if let Some(handle) = scheduler_handle_ref() {
        handle.remove_job(name, agent_id).await;
    }

    // Prefer PinchyDb.
    if let Some(db) = crate::store::global_db() {
        let _ = db.remove_cron_job(agent_id, name);
        return;
    }

    warn!("no database available — skipping remove_persisted_job");
}

/// Execute a single persisted cron job tick: check dependencies, run,
/// record result, handle oneshot removal.
pub async fn run_persisted_job_tick(job: &PersistedCronJob) {
    let agent_id = &job.agent_id;
    let job_name = &job.name;
    let job_id = format!("{}@{}", job_name, agent_id);
    let now = now_secs();

    // Check dependencies first.
    if !check_dependencies(&job.depends_on, agent_id).await {
        let run = JobRun {
            id: format!("{}-{}", job_id, now),
            job_id: job_id.clone(),
            scheduled_at: now,
            executed_at: Some(now),
            completed_at: Some(now),
            status: JobStatus::FAILED("dependency not satisfied".into()),
            output_preview: None,
            error: Some("dependency not satisfied".into()),
            duration_ms: Some(0),
        };
        let _ = persist_cron_run(&run).await;
        return;
    }

    // Try to execute (dispatch to agent via comm bus).
    let message = job
        .message
        .clone()
        .unwrap_or_else(|| format!("[cron:{}]", job_name));

    // Create a dedicated session for this cron fire.
    let session_id = format!(
        "cron_{}_{}",
        job_name.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_"),
        now,
    );

    let msg = comm::IncomingMessage {
        agent_id: Some(agent_id.to_string()),
        channel: format!("cron:{job_name}"),
        author: format!("cron:{job_name}"),
        content: message.clone(),
        timestamp: now as i64,
        session_id: Some(session_id),
        images: Vec::new(),
    };

    let result = comm::sender()
        .send(msg)
        .map(|_| ())
        .map_err(|e| anyhow::anyhow!("{e}"));
    let completed = now_secs();
    let elapsed_ms = (completed - now) * 1000;

    let status = match &result {
        Ok(()) => JobStatus::SUCCESS,
        Err(e) => JobStatus::FAILED(e.to_string()),
    };

    let run = JobRun {
        id: format!("{}-{}", job_id, now),
        job_id: job_id.clone(),
        scheduled_at: now,
        executed_at: Some(now),
        completed_at: Some(completed),
        status: status.clone(),
        output_preview: None,
        error: result.err().map(|e| e.to_string()),
        duration_ms: Some(elapsed_ms),
    };
    let _ = persist_cron_run(&run).await;

    // Gateway notification.
    gateway::publish_event_json(&serde_json::json!({
        "type": "cron",
        "agent": agent_id,
        "job": job_name,
        "timestamp": completed,
    }));

    // OneShot: remove from persisted jobs on success.
    if job.kind == JobKind::OneShot && status == JobStatus::SUCCESS {
        remove_persisted_job(job_name, agent_id).await;
    }
}

/// Record completion for a cron job that was previously marked as RUNNING.
///
/// This is called by the agent turn completion logic to update the history
/// with real duration and output.
pub async fn complete_cron_run(
    job_id: &String,
    timestamp: u64,
    success: bool,
    duration_ms: u64,
    output_preview: Option<String>,
    error_msg: Option<String>,
) -> anyhow::Result<()> {
    // Reconstruct the same ID used by `run_persisted_job_tick`.
    let run_id = format!("{}-{}", job_id, timestamp);

    let status_label = if success { "SUCCESS" } else { "FAILED" };

    let run = JobRun {
        id: run_id,
        job_id: job_id.clone(),
        scheduled_at: timestamp,
        executed_at: Some(timestamp),
        completed_at: Some(now_secs()),
        status: if success {
            JobStatus::SUCCESS
        } else {
            JobStatus::FAILED(
                error_msg
                    .clone()
                    .unwrap_or_else(|| "unknown agent error".into()),
            )
        },
        output_preview,
        error: error_msg,
        duration_ms: Some(duration_ms),
    };

    // Persist the run event.
    persist_cron_run(&run).await?;

    // Update the `last_status` on the job config itself.
    if let Some(db) = crate::store::global_db() {
        let _ = db.update_cron_job_status(job_id, status_label);
    } else {
        warn!("no database available — skipping complete_cron_run status update");
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Janitor — periodic housekeeping
// ---------------------------------------------------------------------------

/// Configuration for the janitor task, extracted from [`Config`] at startup.
#[derive(Debug, Clone)]
pub struct JanitorConfig {
    /// Agent roots to scan.
    pub agent_roots: Vec<PathBuf>,
    /// Delete interactive sessions older than this many days (0 = disabled).
    pub session_expiry_days: u64,
    /// Delete cron session files older than this many days (0 = disabled).
    pub cron_session_expiry_days: u64,
    /// Keep at most this many heartbeat event files per agent (0 = unlimited).
    pub cron_events_max_keep: usize,
}

impl JanitorConfig {
    /// Build from the loaded application [`Config`].
    pub fn from_config(config: &Config) -> Self {
        let agent_roots: Vec<PathBuf> = config
            .agents
            .iter()
            .map(|a| PathBuf::from(&a.root))
            .collect();

        Self {
            agent_roots,
            session_expiry_days: config.session_expiry_days.unwrap_or(30),
            cron_session_expiry_days: config.cron_session_expiry_days.unwrap_or(7),
            cron_events_max_keep: config.cron_events_max_keep.unwrap_or(50),
        }
    }
}

/// Spawn the janitor background loop.  Runs every 6 hours and cleans up
/// cron sessions, cron event files, the legacy heartbeat session log, and
/// the global session index.
pub fn spawn_janitor(config: JanitorConfig) -> JoinHandle<()> {
    tokio::spawn(async move {
        // Run once shortly after startup (60 s) then every 6 hours.
        let startup_delay = Duration::from_secs(60);
        tokio::time::sleep(startup_delay).await;

        let mut tick = interval(Duration::from_secs(6 * 3600));
        // Skip the immediate first tick (we already handle startup).
        tick.tick().await;

        loop {
            info!("janitor: starting housekeeping pass");
            let total = run_janitor_pass(&config).await;
            if total > 0 {
                info!(deleted = total, "janitor: housekeeping pass complete");
            } else {
                debug!("janitor: housekeeping pass complete (nothing to clean)");
            }
            tick.tick().await;
        }
    })
}

/// Execute a single janitor pass.  Returns total number of items cleaned.
pub async fn run_janitor_pass(config: &JanitorConfig) -> usize {
    let mut total = 0usize;

    for agent_root in &config.agent_roots {
        let ws = agent_root.join("workspace");

        // 1) Cron session cleanup — delete cron_*.jsonl older than threshold.
        if config.cron_session_expiry_days > 0 {
            let max_age = std::time::Duration::from_secs(config.cron_session_expiry_days * 86400);
            match cleanup_cron_sessions(&ws, max_age).await {
                Ok(n) if n > 0 => {
                    info!(agent_root = %agent_root.display(), deleted = n,
                          "janitor: expired cron sessions removed");
                    total += n;
                }
                Ok(_) => {}
                Err(e) => warn!(agent_root = %agent_root.display(), error = %e,
                                "janitor: cron session cleanup failed"),
            }
        }

        // 2) Interactive session cleanup.
        if config.session_expiry_days > 0 {
            let max_age = std::time::Duration::from_secs(config.session_expiry_days * 86400);
            match crate::session::SessionStore::cleanup_expired(&ws, max_age).await {
                Ok(n) if n > 0 => {
                    info!(agent_root = %agent_root.display(), deleted = n,
                          "janitor: expired interactive sessions removed");
                    total += n;
                }
                Ok(_) => {}
                Err(e) => warn!(agent_root = %agent_root.display(), error = %e,
                                "janitor: interactive session cleanup failed"),
            }
        }

        // 3) Cron event files — prune excess.
        if config.cron_events_max_keep > 0 {
            match cleanup_cron_events(agent_root, config.cron_events_max_keep).await {
                Ok(n) if n > 0 => {
                    info!(agent_root = %agent_root.display(), deleted = n,
                          "janitor: excess cron event files removed");
                    total += n;
                }
                Ok(_) => {}
                Err(e) => warn!(agent_root = %agent_root.display(), error = %e,
                                "janitor: cron event cleanup failed"),
            }
        }

        // 4) Legacy heartbeat session log (orphaned at <agent_root>/sessions/).
        total += cleanup_legacy_heartbeat_log(agent_root).await;
    }

    total
}

/// Delete `cron_*.jsonl` (and their `.receipts.jsonl`) older than `max_age`.
async fn cleanup_cron_sessions(
    workspace: &Path,
    max_age: std::time::Duration,
) -> anyhow::Result<usize> {
    let sessions_dir = workspace.join("sessions");
    let mut rd = match tokio::fs::read_dir(&sessions_dir).await {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e.into()),
    };

    let now = std::time::SystemTime::now();
    let mut deleted = 0usize;

    while let Some(entry) = rd.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        // Only target cron session files.
        if !name.starts_with("cron_")
            || !name.ends_with(".jsonl")
            || name.ends_with(".receipts.jsonl")
        {
            continue;
        }

        let metadata = match tokio::fs::metadata(entry.path()).await {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified = match metadata.modified() {
            Ok(t) => t,
            Err(_) => continue,
        };

        if let Ok(age) = now.duration_since(modified) {
            if age > max_age {
                let path = entry.path();
                if tokio::fs::remove_file(&path).await.is_ok() {
                    deleted += 1;
                    debug!(path = %path.display(), "janitor: removed expired cron session");

                    // Also remove receipts.
                    let session_id = name.trim_end_matches(".jsonl");
                    let receipts = sessions_dir.join(format!("{session_id}.receipts.jsonl"));
                    if tokio::fs::remove_file(&receipts).await.is_ok() {
                        deleted += 1;
                    }
                }
            }
        }
    }

    Ok(deleted)
}

/// Keep only the newest `max_keep` files in `<agent_root>/cron_events/`.
async fn cleanup_cron_events(agent_root: &Path, max_keep: usize) -> anyhow::Result<usize> {
    let events_dir = agent_root.join("cron_events");
    let mut rd = match tokio::fs::read_dir(&events_dir).await {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e.into()),
    };

    // Collect all files with their names (sorted by name = sorted by timestamp
    // because the naming pattern is `heartbeat_{unix_ts}.json`).
    let mut files: Vec<(String, PathBuf)> = Vec::new();
    while let Some(entry) = rd.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".json") {
            files.push((name, entry.path()));
        }
    }

    if files.len() <= max_keep {
        return Ok(0);
    }

    // Sort ascending by name (oldest first).
    files.sort_by(|a, b| a.0.cmp(&b.0));

    let to_remove = files.len() - max_keep;
    let mut deleted = 0usize;
    for (_, path) in files.into_iter().take(to_remove) {
        if tokio::fs::remove_file(&path).await.is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

/// Truncate or remove the legacy heartbeat session log at
/// `<agent_root>/sessions/`.  This directory was written by `append_session_message`
/// from run_heartbeat (now removed) and is never read by the agent runtime.
async fn cleanup_legacy_heartbeat_log(agent_root: &Path) -> usize {
    let legacy_dir = agent_root.join("sessions");
    if !legacy_dir.is_dir() {
        return 0;
    }

    let mut deleted = 0usize;
    if let Ok(mut rd) = tokio::fs::read_dir(&legacy_dir).await {
        while let Ok(Some(entry)) = rd.next_entry().await {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("jsonl")
                && tokio::fs::remove_file(&path).await.is_ok()
            {
                debug!(path = %path.display(), "janitor: removed legacy heartbeat session file");
                deleted += 1;
            }
        }
    }

    // Try to remove the directory itself if now empty.
    let _ = tokio::fs::remove_dir(&legacy_dir).await;

    deleted
}

/// Normalize a cron schedule expression to the 6-field format required by
/// `tokio_cron_scheduler` (sec min hour dom month dow).
/// Accepts 5-field (standard crontab) by prepending `0` for seconds,
/// and passes 6/7-field expressions through unchanged.
pub fn normalize_cron_schedule(schedule: &str) -> String {
    let fields: Vec<&str> = schedule.split_whitespace().collect();
    if fields.len() == 5 {
        format!("0 {schedule}")
    } else {
        schedule.to_string()
    }
}
