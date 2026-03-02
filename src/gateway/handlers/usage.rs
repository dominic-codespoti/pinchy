use axum::{extract::Query, http::StatusCode, response::IntoResponse, Json};
use std::collections::HashMap;

/// Query parameters for `GET /api/usage`.
#[derive(Debug, serde::Deserialize)]
pub(crate) struct UsageQuery {
    /// Filter by agent id.
    pub agent: Option<String>,
    /// Filter by model name (substring match).
    pub model: Option<String>,
    /// Only include days on or after this date (YYYY-MM-DD).
    pub from: Option<String>,
    /// Only include days on or before this date (YYYY-MM-DD).
    pub to: Option<String>,
}

/// Aggregated usage row keyed by (day, agent, model).
#[derive(Debug, Default, serde::Serialize)]
struct UsageBucket {
    day: String,
    agent: String,
    model: String,
    turns: u64,
    prompt_tokens: u64,
    completion_tokens: u64,
    cached_tokens: u64,
    reasoning_tokens: u64,
    total_tokens: u64,
    estimated_cost_usd: f64,
}

/// `GET /api/usage` — aggregate cost & token usage across all agents.
///
/// Reads every `*.receipts.jsonl` file under `$PINCHY_HOME/agents/*/workspace/sessions/`
/// and groups the results by (day, agent, model).
pub(crate) async fn api_usage(Query(q): Query<UsageQuery>) -> impl IntoResponse {
    let home = crate::pinchy_home();
    let agents_dir = home.join("agents");

    let mut buckets: HashMap<(String, String, String), UsageBucket> = HashMap::new();
    let mut total_cost: f64 = 0.0;
    let mut total_turns: u64 = 0;

    let mut agent_dirs = match tokio::fs::read_dir(&agents_dir).await {
        Ok(rd) => rd,
        Err(_) => {
            return (
                StatusCode::OK,
                Json(serde_json::json!({ "usage": [], "total_cost_usd": 0.0, "total_turns": 0 })),
            )
                .into_response();
        }
    };

    while let Ok(Some(agent_entry)) = agent_dirs.next_entry().await {
        let agent_id = agent_entry.file_name().to_string_lossy().to_string();
        if let Some(ref filter) = q.agent {
            if &agent_id != filter {
                continue;
            }
        }

        let sessions_dir = agent_entry.path().join("workspace").join("sessions");
        let mut session_dir = match tokio::fs::read_dir(&sessions_dir).await {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        while let Ok(Some(file_entry)) = session_dir.next_entry().await {
            let fname = file_entry.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".receipts.jsonl") {
                continue;
            }

            let content = match tokio::fs::read_to_string(file_entry.path()).await {
                Ok(c) => c,
                Err(_) => continue,
            };

            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let receipt: serde_json::Value = match serde_json::from_str(line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                // Extract day from started_at (epoch seconds).
                let started_at = receipt["started_at"].as_u64().unwrap_or(0);
                let day = epoch_to_date(started_at);

                if let Some(ref from) = q.from {
                    if day.as_str() < from.as_str() {
                        continue;
                    }
                }
                if let Some(ref to) = q.to {
                    if day.as_str() > to.as_str() {
                        continue;
                    }
                }

                let model = receipt["model_id"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string();

                if let Some(ref mfilter) = q.model {
                    if !model.contains(mfilter.as_str()) {
                        continue;
                    }
                }

                let cost = receipt["estimated_cost_usd"].as_f64().unwrap_or(0.0);
                let tokens = &receipt["tokens"];

                let key = (day.clone(), agent_id.clone(), model.clone());
                let bucket = buckets.entry(key).or_insert_with(|| UsageBucket {
                    day: day.clone(),
                    agent: agent_id.clone(),
                    model: model.clone(),
                    ..Default::default()
                });

                bucket.turns += 1;
                bucket.prompt_tokens += tokens["prompt_tokens"].as_u64().unwrap_or(0);
                bucket.completion_tokens += tokens["completion_tokens"].as_u64().unwrap_or(0);
                bucket.cached_tokens += tokens["cached_tokens"].as_u64().unwrap_or(0);
                bucket.reasoning_tokens += tokens["reasoning_tokens"].as_u64().unwrap_or(0);
                bucket.total_tokens += tokens["total_tokens"].as_u64().unwrap_or(0);
                bucket.estimated_cost_usd += cost;
                total_cost += cost;
                total_turns += 1;
            }
        }
    }

    let mut rows: Vec<UsageBucket> = buckets.into_values().collect();
    rows.sort_by(|a, b| {
        a.day
            .cmp(&b.day)
            .then_with(|| a.agent.cmp(&b.agent))
            .then_with(|| a.model.cmp(&b.model))
    });

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "usage": rows,
            "total_cost_usd": (total_cost * 1_000_000.0).round() / 1_000_000.0,
            "total_turns": total_turns,
        })),
    )
        .into_response()
}

fn epoch_to_date(secs: u64) -> String {
    let d = chrono::DateTime::from_timestamp(secs as i64, 0).unwrap_or_default();
    d.format("%Y-%m-%d").to_string()
}
