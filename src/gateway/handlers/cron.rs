use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use super::super::auth::validate_path_segment;

/// `GET /api/cron/jobs` — list all cron jobs for all agents.
pub(crate) async fn api_cron_jobs_all() -> impl IntoResponse {
    let agents_dir = crate::utils::agents_dir();
    let mut all_jobs = Vec::new();

    if let Ok(mut rd) = tokio::fs::read_dir(agents_dir).await {
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
            let ws = entry.path();
            let jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
            for job in jobs {
                all_jobs.push(cron_job_to_json(&agent_id, &job));
            }
        }
    }

    Json(serde_json::json!({ "jobs": all_jobs }))
}

/// `GET /api/cron/jobs/:agent_id` — list cron jobs for a specific agent.
pub(crate) async fn api_cron_jobs_by_agent(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let ws = crate::utils::agent_root(&agent_id);
    if !ws.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "agent_id": agent_id })),
        )
            .into_response();
    }

    let jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
    let jobs_json: Vec<_> = jobs
        .iter()
        .map(|j| cron_job_to_json(&agent_id, j))
        .collect();

    (
        StatusCode::OK,
        Json(serde_json::json!({ "jobs": jobs_json })),
    )
        .into_response()
}

/// `GET /api/cron/runs/:job_id` — list runs for a specific job.
pub(crate) async fn api_cron_job_runs(Path(job_id): Path<String>) -> impl IntoResponse {
    // job_id format: name@agent_id
    let (job_name, agent_id) = if let Some(pos) = job_id.rfind('@') {
        (&job_id[..pos], &job_id[pos + 1..])
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "invalid job_id format, expected name@agent_id"
            })),
        )
            .into_response();
    };
    if let Err(e) = validate_path_segment(agent_id) {
        return e.into_response();
    }

    let ws = crate::utils::agent_root(agent_id);
    if !ws.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "agent_id": agent_id })),
        )
            .into_response();
    }

    let all_runs = crate::scheduler::load_cron_runs(&ws).await;
    let full_job_id = format!("{}@{}", job_name, agent_id);
    let mut runs: Vec<serde_json::Value> = all_runs
        .iter()
        .filter(|r| r.job_id == full_job_id)
        .map(cron_run_to_json)
        .collect();
    runs.reverse(); // newest first

    (StatusCode::OK, Json(serde_json::json!({ "runs": runs }))).into_response()
}

/// Request body for POST /api/cron/jobs
#[derive(serde::Deserialize)]
pub(crate) struct CreateCronJobRequest {
    agent_id: String,
    name: Option<String>,
    schedule: String,
    message: String,
    #[serde(default)]
    one_shot: bool,
    depends_on: Option<Vec<String>>,
    max_retries: Option<u32>,
    retry_delay_secs: Option<u64>,
}

/// `POST /api/cron/jobs` — create a new cron job.
pub(crate) async fn api_cron_jobs_create(Json(body): Json<CreateCronJobRequest>) -> impl IntoResponse {
    let ws = crate::utils::agent_root(&body.agent_id);
    if !ws.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "agent not found",
                "agent_id": body.agent_id
            })),
        )
            .into_response();
    }

    let name = body.name.unwrap_or_else(|| {
        let ts = crate::scheduler::now_secs();
        format!("job_{ts}")
    });

    let kind = if body.one_shot {
        crate::scheduler::JobKind::OneShot
    } else {
        crate::scheduler::JobKind::default()
    };

    let entry = crate::scheduler::PersistedCronJob {
        agent_id: body.agent_id.clone(),
        name: name.clone(),
        schedule: body.schedule.clone(),
        message: Some(body.message.clone()),
        kind,
        depends_on: body.depends_on.clone(),
        max_retries: body.max_retries,
        retry_delay_secs: body.retry_delay_secs,
        condition: None,
        retry_count: 0,
        last_status: None,
    };

    // Try to register via scheduler handle
    match crate::scheduler::scheduler_handle_ref() {
        Some(handle) => match handle.register_job(&ws, entry).await {
            Ok(()) => {
                let job_id = format!("{}@{}", name, body.agent_id);
                (
                    StatusCode::CREATED,
                    Json(serde_json::json!({
                        "job_id": job_id,
                        "name": name,
                        "agent_id": body.agent_id,
                        "schedule": body.schedule,
                        "message": body.message,
                        "created_at": crate::scheduler::now_secs(),
                    })),
                )
                    .into_response()
            }
            Err(e) => (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("{e:#}") })),
            )
                .into_response(),
        },
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "scheduler not running (set PINCHY_SCHEDULER=1)"
            })),
        )
            .into_response(),
    }
}

/// `DELETE /api/cron/jobs/:job_id` — delete a cron job.
pub(crate) async fn api_cron_jobs_delete(Path(job_id): Path<String>) -> impl IntoResponse {
    let (job_name, agent_id) = if let Some(pos) = job_id.rfind('@') {
        (&job_id[..pos], &job_id[pos + 1..])
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "invalid job_id format, expected name@agent_id"
            })),
        )
            .into_response();
    };
    if let Err(e) = validate_path_segment(agent_id) {
        return e.into_response();
    }

    let ws = crate::utils::agent_root(agent_id);
    if !ws.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "agent_id": agent_id })),
        )
            .into_response();
    }

    let mut jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
    let before = jobs.len();
    jobs.retain(|j| j.name != job_name);

    if jobs.len() == before {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "job not found", "job_id": job_id })),
        )
            .into_response();
    }

    let path = ws.join("cron_jobs.json");
    match serde_json::to_string_pretty(&jobs) {
        Ok(json) => match tokio::fs::write(&path, json).await {
            Ok(()) => (
                StatusCode::OK,
                Json(serde_json::json!({ "deleted": true, "job_id": job_id })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("write failed: {e}") })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("serialize failed: {e}") })),
        )
            .into_response(),
    }
}

/// Request body for PUT /api/cron/jobs/:job_id
#[derive(serde::Deserialize)]
pub(crate) struct UpdateCronJobRequest {
    #[serde(default)]
    schedule: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    one_shot: Option<bool>,
    #[serde(default)]
    depends_on: Option<Vec<String>>,
    #[serde(default)]
    max_retries: Option<u32>,
    #[serde(default)]
    retry_delay_secs: Option<u64>,
}

/// `PUT /api/cron/jobs/:job_id` — update a cron job's fields.
pub(crate) async fn api_cron_jobs_update(
    Path(job_id): Path<String>,
    Json(body): Json<UpdateCronJobRequest>,
) -> impl IntoResponse {
    let (job_name, agent_id) = if let Some(pos) = job_id.rfind('@') {
        (&job_id[..pos], &job_id[pos + 1..])
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "invalid job_id format, expected name@agent_id"
            })),
        )
            .into_response();
    };
    if let Err(e) = validate_path_segment(agent_id) {
        return e.into_response();
    }

    let ws = crate::utils::agent_root(agent_id);
    if !ws.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "agent_id": agent_id })),
        )
            .into_response();
    }

    let mut jobs = crate::scheduler::load_persisted_cron_jobs(&ws).await;
    let job = jobs
        .iter_mut()
        .find(|j| j.name == job_name && j.agent_id == agent_id);

    match job {
        Some(job) => {
            if let Some(schedule) = body.schedule {
                job.schedule = schedule;
            }
            if let Some(message) = body.message {
                job.message = Some(message);
            }
            if let Some(one_shot) = body.one_shot {
                job.kind = if one_shot {
                    crate::scheduler::JobKind::OneShot
                } else {
                    crate::scheduler::JobKind::Recurring
                };
            }
            if body.depends_on.is_some() {
                job.depends_on = body.depends_on;
            }
            if body.max_retries.is_some() {
                job.max_retries = body.max_retries;
            }
            if body.retry_delay_secs.is_some() {
                job.retry_delay_secs = body.retry_delay_secs;
            }

            let path = ws.join("cron_jobs.json");
            match serde_json::to_string_pretty(&jobs) {
                Ok(json) => match tokio::fs::write(&path, json).await {
                    Ok(()) => (
                        StatusCode::OK,
                        Json(cron_job_to_json(
                            agent_id,
                            jobs.iter()
                                .find(|j| j.name == job_name && j.agent_id == agent_id)
                                .unwrap(),
                        )),
                    )
                        .into_response(),
                    Err(e) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": format!("write: {e}") })),
                    )
                        .into_response(),
                },
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("serialize: {e}") })),
                )
                    .into_response(),
            }
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "job not found", "job_id": job_id })),
        )
            .into_response(),
    }
}

pub(crate) fn cron_job_to_json(agent_id: &str, job: &crate::scheduler::PersistedCronJob) -> serde_json::Value {
    let job_id = format!("{}@{}", job.name, agent_id);
    let kind = match &job.kind {
        crate::scheduler::JobKind::Recurring => "Recurring",
        crate::scheduler::JobKind::OneShot => "OneShot",
    };
    serde_json::json!({
        "id": job_id,
        "agent_id": agent_id,
        "name": job.name,
        "schedule": job.schedule,
        "message": job.message,
        "kind": kind,
        "depends_on": job.depends_on,
        "max_retries": job.max_retries,
        "retry_delay_secs": job.retry_delay_secs,
        "retry_count": job.retry_count,
        "last_status": job.last_status,
    })
}

pub(crate) fn cron_run_to_json(run: &crate::scheduler::JobRun) -> serde_json::Value {
    let status = match &run.status {
        crate::scheduler::JobStatus::PENDING => "PENDING".to_string(),
        crate::scheduler::JobStatus::RUNNING => "RUNNING".to_string(),
        crate::scheduler::JobStatus::SUCCESS => "SUCCESS".to_string(),
        crate::scheduler::JobStatus::FAILED(e) => format!("FAILED: {e}"),
    };
    serde_json::json!({
        "id": run.id,
        "job_id": run.job_id,
        "scheduled_at": run.scheduled_at,
        "executed_at": run.executed_at,
        "completed_at": run.completed_at,
        "status": status,
        "output_preview": run.output_preview,
        "error": run.error,
        "duration_ms": run.duration_ms,
    })
}
