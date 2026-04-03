//! Log API handlers — persistent logs with recent in-memory backlog.
//!
//! - GET /api/logs/recent — in-memory ring buffer (fast, lost on restart)
//! - GET /api/logs — persisted logs from SQLite with filters/pagination
//!
//! The UI combines both: loads persisted history first, then subscribes
//! to WebSocket for real-time updates and fetches recent as fallback.

use axum::{extract::Query, response::Json};
use serde::{Deserialize, Serialize};

/// Query parameters for the recent logs endpoint.
#[derive(Deserialize)]
pub(crate) struct RecentLogsQuery {
    /// Maximum number of log lines to return (default: 200, max: 500).
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize {
    200
}

/// A single log entry as returned by the API.
#[derive(Serialize)]
pub(crate) struct LogEntry {
    #[serde(rename = "type")]
    kind: String,
    level: String,
    target: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    fields: Option<serde_json::Map<String, serde_json::Value>>,
    ts: String,
}

/// Response shape for the recent logs endpoint.
#[derive(Serialize)]
pub(crate) struct RecentLogsResponse {
    /// The recent log entries (from oldest to newest).
    logs: Vec<LogEntry>,
    /// Whether more logs exist in the buffer than returned.
    has_more: bool,
    /// Total capacity of the in-memory ring buffer.
    buffer_capacity: usize,
    /// Hint that these logs are from memory only.
    retention: &'static str,
}

/// GET /api/logs/recent — return recent log lines from the in-memory ring buffer.
pub(crate) async fn api_logs_recent(
    Query(query): Query<RecentLogsQuery>,
) -> Json<RecentLogsResponse> {
    let limit = query.limit.min(500);
    let lines = crate::logs::recent_lines();

    let total_available = lines.len();
    let has_more = total_available > limit;

    // Take the most recent `limit` lines (lines are already in chronological order)
    let to_return: Vec<String> = lines
        .into_iter()
        .rev() // Reverse to get newest first for trimming
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev() // Back to chronological order
        .collect();

    let mut entries = Vec::with_capacity(to_return.len());
    for line in to_return {
        // Parse the JSON line to extract fields
        let entry = parse_log_line(&line);
        entries.push(entry);
    }

    Json(RecentLogsResponse {
        logs: entries,
        has_more,
        buffer_capacity: 200,
        retention: "in_memory_only",
    })
}

/// Query parameters for the persisted logs endpoint.
#[derive(Deserialize)]
pub(crate) struct PersistedLogsQuery {
    /// Filter by log level (ERROR, WARN, INFO, DEBUG, TRACE)
    level: Option<String>,
    /// Search query (matches message or target)
    search: Option<String>,
    /// From timestamp (RFC3339 or unix timestamp)
    from: Option<String>,
    /// To timestamp (RFC3339 or unix timestamp)
    to: Option<String>,
    /// Maximum number of logs to return (default: 100, max: 1000)
    #[serde(default = "default_persisted_limit")]
    limit: usize,
    /// Offset for pagination (default: 0)
    #[serde(default)]
    offset: usize,
}

fn default_persisted_limit() -> usize {
    100
}

/// A persisted log entry from the database.
#[derive(Serialize)]
pub(crate) struct PersistedLogEntry {
    id: i64,
    #[serde(rename = "type")]
    kind: &'static str,
    level: String,
    target: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    fields: Option<serde_json::Map<String, serde_json::Value>>,
    ts: String,
    timestamp: u64,
}

/// Response shape for the persisted logs endpoint.
#[derive(Serialize)]
pub(crate) struct PersistedLogsResponse {
    /// The log entries (newest first).
    logs: Vec<PersistedLogEntry>,
    /// Total count matching the filters.
    total: usize,
    /// Whether there are more results.
    has_more: bool,
    /// Pagination offset for next request.
    next_offset: usize,
    /// Retention info.
    retention: &'static str,
}

/// GET /api/logs — query persisted logs from SQLite with filters/pagination.
pub(crate) async fn api_logs(
    Query(query): Query<PersistedLogsQuery>,
) -> Json<PersistedLogsResponse> {
    let limit = query.limit.clamp(1, 1000);
    let offset = query.offset;

    // Parse timestamp filters
    let from_ts = query.from.as_ref().and_then(|s| parse_timestamp(s));
    let to_ts = query.to.as_ref().and_then(|s| parse_timestamp(s));

    // Query database
    let (logs, total) = if let Some(db) = crate::store::global_db() {
        let level_filter = query.level.as_deref().filter(|l| !l.is_empty());
        let search_filter = query.search.as_deref().filter(|s| !s.is_empty());

        let entries = db
            .query_system_logs(level_filter, search_filter, from_ts, to_ts, limit, offset)
            .unwrap_or_default();

        let total = db
            .count_system_logs(level_filter, search_filter, from_ts, to_ts)
            .unwrap_or(0);

        let logs: Vec<PersistedLogEntry> = entries
            .into_iter()
            .map(|e| PersistedLogEntry {
                id: e.id,
                kind: "log",
                level: e.level,
                target: e.target,
                message: e.message,
                fields: e.fields_json.as_ref().and_then(|f| {
                    serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(f).ok()
                }),
                ts: e.ts_rfc3339,
                timestamp: e.timestamp,
            })
            .collect();

        (logs, total)
    } else {
        (Vec::new(), 0)
    };

    let has_more = offset + logs.len() < total;
    let next_offset = if has_more {
        offset + logs.len()
    } else {
        offset
    };

    Json(PersistedLogsResponse {
        logs,
        total,
        has_more,
        next_offset,
        retention: "persistent_with_retention",
    })
}

/// Parse a timestamp string (RFC3339 or unix timestamp).
fn parse_timestamp(s: &str) -> Option<i64> {
    // Try RFC3339 first
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp());
    }
    // Try as unix timestamp (seconds)
    if let Ok(ts) = s.parse::<i64>() {
        return Some(ts);
    }
    None
}

/// Parse a JSON log line into a LogEntry.
fn parse_log_line(line: &str) -> LogEntry {
    // Try to parse as JSON; fallback to plain text if malformed
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
        LogEntry {
            kind: json
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("log")
                .to_string(),
            level: json
                .get("level")
                .and_then(|v| v.as_str())
                .unwrap_or("INFO")
                .to_string(),
            target: json
                .get("target")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            message: json
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or(line)
                .to_string(),
            fields: json.get("fields").and_then(|v| v.as_object()).cloned(),
            ts: json
                .get("ts")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        }
    } else {
        // Fallback for non-JSON lines
        LogEntry {
            kind: "log".to_string(),
            level: "INFO".to_string(),
            target: "unknown".to_string(),
            message: line.to_string(),
            fields: None,
            ts: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// Request body for log cleanup.
#[derive(Deserialize)]
pub(crate) struct CleanupLogsRequest {
    /// Retention days (default: 7)
    #[serde(default = "default_retention_days")]
    retention_days: i64,
    /// Max rows to keep (default: 10000)
    #[serde(default = "default_max_rows")]
    max_rows: i64,
}

fn default_retention_days() -> i64 {
    7
}

fn default_max_rows() -> i64 {
    10000
}

/// Response for log cleanup.
#[derive(Serialize)]
pub(crate) struct CleanupLogsResponse {
    deleted: usize,
    retention_days: i64,
    max_rows: i64,
}

/// POST /api/logs/cleanup — trigger retention cleanup.
pub(crate) async fn api_logs_cleanup(
    axum::extract::Json(body): axum::extract::Json<CleanupLogsRequest>,
) -> Json<CleanupLogsResponse> {
    let deleted = if let Some(db) = crate::store::global_db() {
        db.cleanup_system_logs(body.retention_days, body.max_rows)
            .unwrap_or(0)
    } else {
        0
    };

    Json(CleanupLogsResponse {
        deleted,
        retention_days: body.retention_days,
        max_rows: body.max_rows,
    })
}
