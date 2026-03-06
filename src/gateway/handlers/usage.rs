use axum::{extract::Query, http::StatusCode, response::IntoResponse, Json};

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

/// `GET /api/usage` — aggregate cost & token usage across all agents.
///
/// Queries the `receipts` table in SQLite, grouping results by (day, agent, model).
pub(crate) async fn api_usage(Query(q): Query<UsageQuery>) -> impl IntoResponse {
    let db = match crate::store::global_db() {
        Some(db) => db,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "database not initialised" })),
            )
                .into_response();
        }
    };

    match db.aggregate_usage(
        q.agent.as_deref(),
        q.model.as_deref(),
        q.from.as_deref(),
        q.to.as_deref(),
    ) {
        Ok(rows) => {
            let total_cost: f64 = rows.iter().map(|r| r.estimated_cost_usd).sum();
            let total_turns: u64 = rows.iter().map(|r| r.turns).sum();

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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("query failed: {e}") })),
        )
            .into_response(),
    }
}
