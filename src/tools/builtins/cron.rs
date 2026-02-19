//! Cron job management tools — let the agent list, create, update, delete,
//! manually trigger, and inspect history for scheduled cron jobs.
//!
//! Tools exposed:
//! - `list_cron_jobs { agent_id? }` — list persisted cron jobs
//! - `create_cron_job { agent_id, schedule, message, name? }` — create a new cron job
//! - `update_cron_job { agent_id, name, schedule?, message? }` — update an existing job
//! - `delete_cron_job { agent_id, name }` — remove a cron job
//! - `run_cron_job { agent_id, name }` — manually trigger a cron job now
//! - `cron_job_history { agent_id?, name?, limit? }` — view run history

use std::path::Path;

use serde_json::{json, Value};

use crate::tools::{register_tool, ToolMeta};

/// `list_cron_jobs` — enumerate cron jobs, optionally filtered by agent.
pub async fn list_cron_jobs(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let filter_agent = args["agent_id"].as_str();
    let agents_dir = crate::utils::agents_dir();
    let mut all_jobs: Vec<Value> = Vec::new();

    let mut rd = tokio::fs::read_dir(&agents_dir)
        .await
        .map_err(|e| anyhow::anyhow!("cannot read agents dir: {e}"))?;

    while let Ok(Some(entry)) = rd.next_entry().await {
        let is_dir = entry
            .file_type()
            .await
            .map(|ft| ft.is_dir())
            .unwrap_or(false);
        if !is_dir {
            continue;
        }
        let agent_id = entry.file_name().to_string_lossy().to_string();

        if let Some(filter) = filter_agent {
            if agent_id != filter {
                continue;
            }
        }

        let ws = entry.path();
        let jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
        for job in &jobs {
            let job_id = format!("{}@{}", job.name, agent_id);
            let kind = match &job.kind {
                crate::scheduler::JobKind::Recurring => "Recurring",
                crate::scheduler::JobKind::OneShot => "OneShot",
            };
            all_jobs.push(json!({
                "id": job_id,
                "agent_id": agent_id,
                "name": job.name,
                "schedule": job.schedule,
                "message": job.message,
                "kind": kind,
                "depends_on": job.depends_on,
                "max_retries": job.max_retries,
                "retry_count": job.retry_count,
                "last_status": job.last_status,
            }));
        }
    }

    Ok(json!({ "jobs": all_jobs }))
}

/// `create_cron_job` — create and register a new cron job.
pub async fn create_cron_job(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let agent_id = args["agent_id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_cron_job requires an 'agent_id' string"))?;
    let schedule = args["schedule"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_cron_job requires a 'schedule' string (6-field cron)"))?;
    let message = args["message"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_cron_job requires a 'message' string"))?;

    let ws = crate::utils::agent_root(agent_id);
    if !ws.exists() {
        anyhow::bail!("agent not found: {agent_id}");
    }

    let name = args["name"]
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| {
            let ts = crate::scheduler::now_secs();
            format!("job_{ts}")
        });

    let one_shot = args["one_shot"].as_bool().unwrap_or(false);
    let kind = if one_shot {
        crate::scheduler::JobKind::OneShot
    } else {
        crate::scheduler::JobKind::default()
    };

    let entry = crate::scheduler::PersistedCronJob {
        agent_id: agent_id.to_string(),
        name: name.clone(),
        schedule: schedule.to_string(),
        message: Some(message.to_string()),
        kind,
        depends_on: None,
        max_retries: None,
        retry_delay_secs: None,
        condition: None,
        retry_count: 0,
        last_status: None,
    };

    // Try to register via the global scheduler handle.
    match crate::scheduler::scheduler_handle_ref() {
        Some(handle) => {
            handle.register_job(&ws, entry).await?;
            let job_id = format!("{name}@{agent_id}");
            Ok(json!({
                "status": "created",
                "job_id": job_id,
                "name": name,
                "agent_id": agent_id,
                "schedule": schedule,
                "message": message,
            }))
        }
        None => {
            // Scheduler not running — persist to disk only so it picks up
            // on next restart.
            let mut jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
            jobs.push(entry);
            let path = ws.join("cron_jobs.json");
            let json_str = serde_json::to_string_pretty(&jobs)?;
            tokio::fs::write(&path, json_str).await?;
            let job_id = format!("{name}@{agent_id}");
            Ok(json!({
                "status": "persisted",
                "note": "scheduler not running — job saved to disk, will activate on next start",
                "job_id": job_id,
                "name": name,
                "agent_id": agent_id,
                "schedule": schedule,
                "message": message,
            }))
        }
    }
}

/// `delete_cron_job` — remove a cron job by agent and name.
pub async fn delete_cron_job(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let agent_id = args["agent_id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("delete_cron_job requires an 'agent_id' string"))?;
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("delete_cron_job requires a 'name' string"))?;

    let ws = crate::utils::agent_root(agent_id);
    if !ws.exists() {
        anyhow::bail!("agent not found: {agent_id}");
    }

    let mut jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
    let before = jobs.len();
    jobs.retain(|j| j.name != name);

    if jobs.len() == before {
        anyhow::bail!("cron job '{name}' not found for agent '{agent_id}'");
    }

    let path = ws.join("cron_jobs.json");
    let json_str = serde_json::to_string_pretty(&jobs)?;
    tokio::fs::write(&path, json_str).await?;

    // Also remove from the live scheduler's in-memory list.
    crate::scheduler::remove_persisted_job(&ws, name, agent_id).await;

    let job_id = format!("{name}@{agent_id}");
    Ok(json!({
        "status": "deleted",
        "job_id": job_id,
    }))
}

/// `update_cron_job` — update the schedule and/or message of an existing cron job.
pub async fn update_cron_job(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let agent_id = args["agent_id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("update_cron_job requires an 'agent_id' string"))?;
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("update_cron_job requires a 'name' string"))?;

    let ws = crate::utils::agent_root(agent_id);
    if !ws.exists() {
        anyhow::bail!("agent not found: {agent_id}");
    }

    let mut jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
    let job = jobs
        .iter_mut()
        .find(|j| j.name == name && j.agent_id == agent_id)
        .ok_or_else(|| anyhow::anyhow!("cron job '{name}' not found for agent '{agent_id}'"))?;

    let mut changed = Vec::new();

    if let Some(new_schedule) = args.get("schedule").and_then(Value::as_str) {
        job.schedule = new_schedule.to_string();
        changed.push("schedule");
    }
    if let Some(new_message) = args.get("message").and_then(Value::as_str) {
        job.message = Some(new_message.to_string());
        changed.push("message");
    }
    if let Some(new_kind) = args.get("one_shot").and_then(Value::as_bool) {
        job.kind = if new_kind {
            crate::scheduler::JobKind::OneShot
        } else {
            crate::scheduler::JobKind::Recurring
        };
        changed.push("kind");
    }

    if changed.is_empty() {
        anyhow::bail!("update_cron_job: no fields to update (provide schedule, message, or one_shot)");
    }

    // Persist back.
    let path = ws.join("cron_jobs.json");
    let json_str = serde_json::to_string_pretty(&jobs)?;
    tokio::fs::write(&path, json_str).await?;

    let job_id = format!("{name}@{agent_id}");
    Ok(json!({
        "status": "updated",
        "job_id": job_id,
        "changed_fields": changed,
        "note": "Schedule changes take effect on next scheduler restart. Message changes take effect immediately.",
    }))
}

/// `run_cron_job` — manually trigger a cron job immediately.
pub async fn run_cron_job(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let agent_id = args["agent_id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("run_cron_job requires an 'agent_id' string"))?;
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("run_cron_job requires a 'name' string"))?;

    let ws = crate::utils::agent_root(agent_id);
    if !ws.exists() {
        anyhow::bail!("agent not found: {agent_id}");
    }

    let jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
    let job = jobs
        .iter()
        .find(|j| j.name == name && j.agent_id == agent_id)
        .ok_or_else(|| anyhow::anyhow!("cron job '{name}' not found for agent '{agent_id}'"))?;

    let message = job
        .message
        .clone()
        .unwrap_or_else(|| format!("[cron:{}]", name));

    // Publish the message as an IncomingMessage to the agent's comm bus.
    let cron_session = format!("cron_{}_{}",
        name.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_"),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    );
    let msg = crate::comm::IncomingMessage {
        agent_id: Some(agent_id.to_string()),
        channel: "cron-manual".to_string(),
        author: format!("cron:{name}"),
        content: message.clone(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
        session_id: Some(cron_session),
    };

    let tx = crate::comm::sender();
    let delivered = tx.send(msg).is_ok();

    // Also record a cron run entry.
    let now = crate::scheduler::now_secs();
    let job_id = format!("{name}@{agent_id}");
    let run = crate::scheduler::JobRun {
        id: format!("{}-{}-manual", job_id, now),
        job_id: job_id.clone(),
        scheduled_at: now,
        executed_at: Some(now),
        completed_at: Some(now),
        status: if delivered {
            crate::scheduler::JobStatus::SUCCESS
        } else {
            crate::scheduler::JobStatus::FAILED("no receivers".into())
        },
        output_preview: Some("manual trigger".into()),
        error: if delivered { None } else { Some("no active receivers on comm bus".into()) },
        duration_ms: Some(0),
    };

    // Persist the run record.
    let runs_path = ws.join("cron_runs.jsonl");
    let mut line = serde_json::to_string(&run).unwrap_or_default();
    line.push('\n');
    let _ = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&runs_path)
        .await
        .map(|mut f| {
            use tokio::io::AsyncWriteExt;
            tokio::spawn(async move { let _ = f.write_all(line.as_bytes()).await; })
        });

    Ok(json!({
        "status": if delivered { "triggered" } else { "trigger_failed" },
        "job_id": job_id,
        "message": message,
        "delivered": delivered,
    }))
}

/// `cron_job_history` — view run history for cron jobs.
pub async fn cron_job_history(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let filter_agent = args.get("agent_id").and_then(Value::as_str);
    let filter_name = args.get("name").and_then(Value::as_str);
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(25) as usize;

    let agents_dir = crate::utils::agents_dir();
    let mut all_runs: Vec<Value> = Vec::new();

    let mut rd = tokio::fs::read_dir(&agents_dir)
        .await
        .map_err(|e| anyhow::anyhow!("cannot read agents dir: {e}"))?;

    while let Ok(Some(entry)) = rd.next_entry().await {
        let is_dir = entry
            .file_type()
            .await
            .map(|ft| ft.is_dir())
            .unwrap_or(false);
        if !is_dir {
            continue;
        }
        let agent_id = entry.file_name().to_string_lossy().to_string();

        if let Some(filter) = filter_agent {
            if agent_id != filter {
                continue;
            }
        }

        let ws = entry.path();
        let runs = crate::scheduler::load_cron_runs(&ws).await;

        for run in runs {
            // Filter by job name if specified.
            if let Some(fname) = filter_name {
                let expected_prefix = format!("{fname}@");
                if !run.job_id.starts_with(&expected_prefix) {
                    continue;
                }
            }

            let status_str = match &run.status {
                crate::scheduler::JobStatus::PENDING => "PENDING",
                crate::scheduler::JobStatus::RUNNING => "RUNNING",
                crate::scheduler::JobStatus::SUCCESS => "SUCCESS",
                crate::scheduler::JobStatus::FAILED(_) => "FAILED",
            };
            let error_msg = match &run.status {
                crate::scheduler::JobStatus::FAILED(e) => Some(e.as_str()),
                _ => None,
            };

            all_runs.push(json!({
                "id": run.id,
                "job_id": run.job_id,
                "agent_id": agent_id,
                "scheduled_at": run.scheduled_at,
                "executed_at": run.executed_at,
                "completed_at": run.completed_at,
                "status": status_str,
                "error": error_msg.or(run.error.as_deref()),
                "duration_ms": run.duration_ms,
                "output_preview": run.output_preview,
            }));
        }
    }

    // Sort by scheduled_at descending (most recent first).
    all_runs.sort_by(|a, b| {
        let a_ts = a["scheduled_at"].as_u64().unwrap_or(0);
        let b_ts = b["scheduled_at"].as_u64().unwrap_or(0);
        b_ts.cmp(&a_ts)
    });

    all_runs.truncate(limit);

    Ok(json!({
        "runs": all_runs,
        "total": all_runs.len(),
    }))
}

/// Register cron management tools.
pub fn register() {
    register_tool(ToolMeta {
        name: "list_cron_jobs".into(),
        description:
            "List scheduled cron jobs. Optionally filter by agent_id. Shows schedule, message, status."
                .into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Optional: filter jobs to this agent only"
                }
            }
        }),
    });

    register_tool(ToolMeta {
        name: "create_cron_job".into(),
        description: "Create a new scheduled cron job for an agent. Uses 6-field cron syntax (sec min hour dom month dow).".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "The agent to attach this job to"
                },
                "schedule": {
                    "type": "string",
                    "description": "Cron expression (6-field: sec min hour dom month dow). Example: '0 */5 * * * *' for every 5 minutes"
                },
                "message": {
                    "type": "string",
                    "description": "Message to dispatch to the agent when the job fires"
                },
                "name": {
                    "type": "string",
                    "description": "Human-readable job name (auto-generated if omitted)"
                },
                "one_shot": {
                    "type": "boolean",
                    "description": "If true, job runs once then is removed (default: false)"
                }
            },
            "required": ["agent_id", "schedule", "message"]
        }),
    });

    register_tool(ToolMeta {
        name: "update_cron_job".into(),
        description: "Update an existing cron job's schedule, message, or type. Changes are persisted; schedule changes take full effect on scheduler restart.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "The agent the job belongs to"
                },
                "name": {
                    "type": "string",
                    "description": "The name of the cron job to update"
                },
                "schedule": {
                    "type": "string",
                    "description": "New cron schedule expression"
                },
                "message": {
                    "type": "string",
                    "description": "New message to dispatch"
                },
                "one_shot": {
                    "type": "boolean",
                    "description": "Change to one-shot (true) or recurring (false)"
                }
            },
            "required": ["agent_id", "name"]
        }),
    });

    register_tool(ToolMeta {
        name: "delete_cron_job".into(),
        description: "Delete a scheduled cron job by agent ID and job name.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "The agent the job belongs to"
                },
                "name": {
                    "type": "string",
                    "description": "The name of the cron job to delete"
                }
            },
            "required": ["agent_id", "name"]
        }),
    });

    register_tool(ToolMeta {
        name: "run_cron_job".into(),
        description: "Manually trigger a cron job immediately, regardless of its schedule. The job's message is dispatched to the agent and a run record is saved.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "The agent the job belongs to"
                },
                "name": {
                    "type": "string",
                    "description": "The name of the cron job to trigger"
                }
            },
            "required": ["agent_id", "name"]
        }),
    });

    register_tool(ToolMeta {
        name: "cron_job_history".into(),
        description: "View run history for cron jobs. Shows timestamps, status (SUCCESS/FAILED/PENDING), duration, and errors. Filter by agent and/or job name.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Optional: filter to this agent's jobs"
                },
                "name": {
                    "type": "string",
                    "description": "Optional: filter to a specific job name"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max run records to return (default: 25)"
                }
            }
        }),
    });
}
