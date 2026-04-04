use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use super::super::auth::validate_path_segment;
use super::super::types::*;

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
            let jobs = crate::scheduler::load_persisted_cron_jobs(&agent_id).await;
            for job in jobs {
                all_jobs.push(cron_job_to_item(&agent_id, &job));
            }
        }
    }

    Json(CronJobsListResponse { jobs: all_jobs })
}

/// `GET /api/cron/jobs/:agent_id` — list cron jobs for a specific agent.
pub(crate) async fn api_cron_jobs_by_agent(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let agent_root = crate::utils::agent_root(&agent_id);
    if !agent_root.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let jobs = crate::scheduler::load_persisted_cron_jobs(&agent_id).await;
    let jobs_items: Vec<_> = jobs
        .iter()
        .map(|j| cron_job_to_item(&agent_id, j))
        .collect();

    (
        StatusCode::OK,
        Json(CronJobsListResponse { jobs: jobs_items }),
    )
        .into_response()
}

/// `GET /api/cron/jobs/:job_id/runs` — list runs for a specific job.
pub(crate) async fn api_cron_job_runs(Path(job_id): Path<String>) -> impl IntoResponse {
    // job_id format: name@agent_id
    let (job_name, agent_id) = if let Some(pos) = job_id.rfind('@') {
        (&job_id[..pos], &job_id[pos + 1..])
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "invalid job_id format, expected name@agent_id".to_string(),
                id: Some(job_id),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };
    if let Err(e) = validate_path_segment(agent_id) {
        return e.into_response();
    }

    let agent_root = crate::utils::agent_root(agent_id);
    if !agent_root.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id.to_string()),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let all_runs = crate::scheduler::load_cron_runs(agent_id).await;
    let full_job_id = format!("{}@{}", job_name, agent_id);
    let mut runs: Vec<CronRunItem> = all_runs
        .iter()
        .filter(|r| r.job_id == full_job_id)
        .map(cron_run_to_item)
        .collect();
    runs.reverse(); // newest first

    (StatusCode::OK, Json(CronRunsListResponse { runs })).into_response()
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
pub(crate) async fn api_cron_jobs_create(
    Json(body): Json<CreateCronJobRequest>,
) -> impl IntoResponse {
    let agent_root = crate::utils::agent_root(&body.agent_id);
    if !agent_root.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(body.agent_id.clone()),
                filename: None,
                allowed: None,
            }),
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

    let schedule = crate::scheduler::normalize_cron_schedule(&body.schedule);

    let entry = crate::scheduler::PersistedCronJob {
        agent_id: body.agent_id.clone(),
        name: name.clone(),
        schedule,
        message: Some(body.message.clone()),
        kind,
        depends_on: body.depends_on.clone(),
        max_retries: body.max_retries,
        retry_delay_secs: body.retry_delay_secs,
        condition: None,
        retry_count: 0,
        last_status: None,
        enabled: true,
    };

    // Try to register via scheduler handle
    // If scheduler is not running, try to start it lazily
    if crate::scheduler::scheduler_handle_ref().is_none() {
        if let Err(e) = crate::scheduler::ensure_scheduler_running().await {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: format!("scheduler not running and could not be started: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    }

    // Now scheduler should be running - get the handle and register the job
    match crate::scheduler::scheduler_handle_ref() {
        Some(handle) => match handle.register_job(entry).await {
            Ok(()) => {
                let job_id = format!("{}@{}", name, body.agent_id);
                (
                    StatusCode::CREATED,
                    Json(CronJobCreateResponse {
                        job_id,
                        name,
                        agent_id: body.agent_id,
                        schedule: body.schedule,
                        message: body.message,
                        created_at: crate::scheduler::now_secs(),
                    }),
                )
                    .into_response()
            }
            Err(e) => (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("{e:#}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response(),
        },
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "scheduler failed to start".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
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
            Json(ErrorResponse {
                error: "invalid job_id format, expected name@agent_id".to_string(),
                id: Some(job_id.clone()),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };
    if let Err(e) = validate_path_segment(agent_id) {
        return e.into_response();
    }

    let agent_root = crate::utils::agent_root(agent_id);
    if !agent_root.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id.to_string()),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Remove from DB.
    let db = match crate::store::global_db() {
        Some(db) => db,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database not initialised".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    match db.remove_cron_job(agent_id, job_name) {
        Ok(true) => {
            // Remove from live scheduler + in-memory list.
            if let Some(handle) = crate::scheduler::scheduler_handle_ref() {
                handle.remove_job(job_name, agent_id).await;
            }
            (
                StatusCode::OK,
                Json(CronJobDeleteResponse {
                    deleted: true,
                    job_id: job_id.clone(),
                }),
            )
                .into_response()
        }
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "job not found".to_string(),
                id: Some(job_id),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("db delete failed: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
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
    #[serde(default)]
    enabled: Option<bool>,
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
            Json(ErrorResponse {
                error: "invalid job_id format, expected name@agent_id".to_string(),
                id: Some(job_id.clone()),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };
    if let Err(e) = validate_path_segment(agent_id) {
        return e.into_response();
    }

    let agent_root = crate::utils::agent_root(agent_id);
    if !agent_root.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id.to_string()),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let mut jobs = crate::scheduler::load_persisted_cron_jobs(agent_id).await;
    let job = jobs
        .iter_mut()
        .find(|j| j.name == job_name && j.agent_id == agent_id);

    match job {
        Some(job) => {
            if let Some(schedule) = body.schedule {
                job.schedule = crate::scheduler::normalize_cron_schedule(&schedule);
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
            if let Some(enabled) = body.enabled {
                job.enabled = enabled;
            }

            // Persist to DB instead of cron_jobs.json.
            let db = match crate::store::global_db() {
                Some(db) => db,
                None => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "database not initialised".to_string(),
                            id: None,
                            agent_id: None,
                            filename: None,
                            allowed: None,
                        }),
                    )
                        .into_response();
                }
            };
            match db.upsert_cron_job(job) {
                Ok(()) => {
                    let item = cron_job_to_item(agent_id, job);
                    (StatusCode::OK, Json(item)).into_response()
                }
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("db update failed: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response(),
            }
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "job not found".to_string(),
                id: Some(job_id),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

pub(crate) fn cron_job_to_item(
    agent_id: &str,
    job: &crate::scheduler::PersistedCronJob,
) -> CronJobItem {
    let job_id = format!("{}@{}", job.name, agent_id);
    let kind = match &job.kind {
        crate::scheduler::JobKind::Recurring => "Recurring",
        crate::scheduler::JobKind::OneShot => "OneShot",
    };
    CronJobItem {
        id: job_id,
        agent_id: agent_id.to_string(),
        name: job.name.clone(),
        schedule: job.schedule.clone(),
        message: job.message.clone(),
        kind: kind.to_string(),
        depends_on: job.depends_on.clone(),
        max_retries: job.max_retries,
        retry_delay_secs: job.retry_delay_secs,
        retry_count: job.retry_count,
        last_status: job.last_status.clone(),
        enabled: job.enabled,
    }
}

pub(crate) fn cron_run_to_item(run: &crate::scheduler::JobRun) -> CronRunItem {
    let status = match &run.status {
        crate::scheduler::JobStatus::PENDING => "PENDING".to_string(),
        crate::scheduler::JobStatus::RUNNING => "RUNNING".to_string(),
        crate::scheduler::JobStatus::SUCCESS => "SUCCESS".to_string(),
        crate::scheduler::JobStatus::FAILED(e) => format!("FAILED: {e}"),
    };
    CronRunItem {
        id: run.id.clone(),
        job_id: run.job_id.clone(),
        scheduled_at: run.scheduled_at,
        executed_at: run.executed_at,
        completed_at: run.completed_at,
        status,
        output_preview: run.output_preview.clone(),
        error: run.error.clone(),
        duration_ms: run.duration_ms,
    }
}

/// `POST /api/cron/jobs/:job_id/trigger` — manually trigger a cron job immediately.
pub(crate) async fn api_cron_job_trigger(Path(job_id): Path<String>) -> impl IntoResponse {
    let (job_name, agent_id) = if let Some(pos) = job_id.rfind('@') {
        (&job_id[..pos], &job_id[pos + 1..])
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "invalid job_id format, expected name@agent_id".to_string(),
                id: Some(job_id.clone()),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };
    if let Err(e) = validate_path_segment(agent_id) {
        return e.into_response();
    }

    let agent_root = crate::utils::agent_root(agent_id);
    if !agent_root.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id.to_string()),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let jobs = crate::scheduler::load_persisted_cron_jobs(agent_id).await;
    let job = jobs
        .iter()
        .find(|j| j.name == job_name && j.agent_id == agent_id);

    match job {
        Some(job) => {
            crate::scheduler::run_persisted_job_tick(job).await;
            (
                StatusCode::OK,
                Json(CronJobTriggerResponse {
                    triggered: true,
                    job_id: job_id.clone(),
                    job_name: job_name.to_string(),
                    agent_id: agent_id.to_string(),
                }),
            )
                .into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "job not found".to_string(),
                id: Some(job_id),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

/// `POST /api/ai/enhance-prompt` — use the configured model to enhance a cron prompt.
pub(crate) async fn api_ai_enhance_prompt(
    Json(body): Json<EnhancePromptRequest>,
) -> impl IntoResponse {
    let prompt = body.prompt;

    if prompt.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "prompt is required".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let system = "You are an AI assistant that improves cron job prompts. \
        The user will give you a short description of what a scheduled task should do. \
        Rewrite it into a clear, detailed, actionable prompt that an AI agent will execute. \
        Keep it concise but specific. Include any relevant details about format, sources, or output. \
        Return ONLY the improved prompt text, nothing else.";

    let messages = vec![
        crate::models::ChatMessage::system(system),
        crate::models::ChatMessage::user(&prompt),
    ];

    match crate::models::send_chat_messages(&messages).await {
        Ok(enhanced) => Json(CronEnhanceResponse {
            original: prompt,
            enhanced: enhanced.trim().to_string(),
        })
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("AI enhancement failed: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}
