//! Consolidated SQLite store for machine-generated data.
//!
//! Replaces: JSONL session files, receipts JSONL, `index.jsonl`,
//! `CURRENT_SESSION`, `cron_jobs.json`, `cron_events/*.json`,
//! `heartbeat_status.json`.
//!
//! Storage: `<pinchy_home>/pinchy.db`
//!
//! Tables:
//!   sessions        — session index (replaces index.jsonl + CURRENT_SESSION)
//!   exchanges       — per-message log (replaces *.jsonl session files)
//!   receipts        — turn receipts (replaces *.receipts.jsonl)
//!   cron_jobs       — persisted cron jobs (replaces cron_jobs.json)
//!   cron_events     — job run records (replaces cron_events/*.json)
//!   heartbeat_status — latest heartbeat per agent (replaces heartbeat_status.json)

use std::path::Path;
use std::sync::{Arc, Mutex};

use anyhow::{Context as _, Result};
use rusqlite::{params, Connection, OptionalExtension};
use tracing::debug;

// -- Global accessor (OnceLock) -------------------------------------------

static GLOBAL_DB: std::sync::OnceLock<PinchyDb> = std::sync::OnceLock::new();

/// Store the PinchyDb globally (call once at startup).
pub fn set_global_db(db: PinchyDb) {
    let _ = GLOBAL_DB.set(db);
}

/// Retrieve the global PinchyDb instance, if set.
pub fn global_db() -> Option<&'static PinchyDb> {
    GLOBAL_DB.get()
}

use crate::agent::types::{TokenUsageSummary, TurnReceipt};
use crate::scheduler::{HeartbeatStatus, JobRun, PersistedCronJob};
use crate::session::{index::IndexEntry, Exchange};

/// Aggregated usage row keyed by (day, agent, model) — returned by `aggregate_usage`.
#[derive(Debug, serde::Serialize)]
pub struct UsageBucket {
    pub day: String,
    pub agent: String,
    pub model: String,
    pub turns: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    pub total_tokens: u64,
    pub estimated_cost_usd: f64,
}

// ---------------------------------------------------------------------------
// PinchyDb
// ---------------------------------------------------------------------------

/// Consolidated SQLite store for all machine-generated data.
#[derive(Clone)]
pub struct PinchyDb {
    conn: Arc<Mutex<Connection>>,
}

impl PinchyDb {
    /// Open (or create) the database at `<pinchy_home>/pinchy.db`.
    pub fn open(pinchy_home: &Path) -> Result<Self> {
        let db_path = pinchy_home.join("pinchy.db");
        Self::open_path(&db_path)
    }

    /// Open a database at an explicit path (useful for tests).
    pub fn open_path(db_path: &Path) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;\
             PRAGMA synchronous=NORMAL;\
             PRAGMA foreign_keys=ON;",
        )?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate()?;
        Ok(db)
    }

    /// In-memory database for tests.
    #[cfg(test)]
    pub fn open_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate()?;
        Ok(db)
    }

    // -- schema migrations ------------------------------------------------

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                session_id  TEXT PRIMARY KEY,
                agent_id    TEXT NOT NULL,
                created_at  INTEGER NOT NULL,
                title       TEXT,
                is_current  INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_agent
                ON sessions(agent_id);

            CREATE TABLE IF NOT EXISTS exchanges (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id   TEXT NOT NULL,
                timestamp    INTEGER NOT NULL,
                role         TEXT NOT NULL,
                content      TEXT NOT NULL,
                metadata     TEXT,
                tool_calls   TEXT,
                tool_call_id TEXT,
                images       TEXT NOT NULL DEFAULT '[]',
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            );

            CREATE INDEX IF NOT EXISTS idx_exchanges_session
                ON exchanges(session_id, id);

            CREATE TABLE IF NOT EXISTS receipts (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id         TEXT,
                agent_id           TEXT NOT NULL,
                started_at         INTEGER NOT NULL,
                duration_ms        INTEGER NOT NULL,
                user_prompt        TEXT NOT NULL,
                tool_calls_json    TEXT NOT NULL DEFAULT '[]',
                prompt_tokens      INTEGER NOT NULL DEFAULT 0,
                completion_tokens  INTEGER NOT NULL DEFAULT 0,
                total_tokens       INTEGER NOT NULL DEFAULT 0,
                cached_tokens      INTEGER NOT NULL DEFAULT 0,
                reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
                model_calls        INTEGER NOT NULL DEFAULT 0,
                reply_summary      TEXT NOT NULL DEFAULT '',
                model_id           TEXT NOT NULL DEFAULT '',
                estimated_cost_usd REAL,
                call_details_json  TEXT NOT NULL DEFAULT '[]'
            );

            CREATE INDEX IF NOT EXISTS idx_receipts_session
                ON receipts(session_id);
            CREATE INDEX IF NOT EXISTS idx_receipts_agent
                ON receipts(agent_id);

            CREATE TABLE IF NOT EXISTS cron_jobs (
                agent_id        TEXT NOT NULL,
                name            TEXT NOT NULL,
                schedule        TEXT NOT NULL,
                message         TEXT,
                kind            TEXT NOT NULL DEFAULT 'Message',
                depends_on      TEXT,
                max_retries     INTEGER,
                retry_delay_secs INTEGER,
                condition       TEXT,
                retry_count     INTEGER NOT NULL DEFAULT 0,
                last_status     TEXT,
                PRIMARY KEY (agent_id, name)
            );

            CREATE TABLE IF NOT EXISTS cron_events (
                id              TEXT PRIMARY KEY,
                job_id          TEXT NOT NULL,
                scheduled_at    INTEGER NOT NULL,
                executed_at     INTEGER,
                completed_at    INTEGER,
                status          TEXT NOT NULL DEFAULT 'Pending',
                output_preview  TEXT,
                error           TEXT,
                duration_ms     INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_cron_events_job
                ON cron_events(job_id, scheduled_at);

            CREATE TABLE IF NOT EXISTS heartbeat_status (
                agent_id         TEXT PRIMARY KEY,
                enabled          INTEGER NOT NULL DEFAULT 1,
                health           TEXT NOT NULL DEFAULT 'OK',
                last_tick        INTEGER,
                next_tick        INTEGER,
                interval_secs    INTEGER,
                message_preview  TEXT,
                latest_session   TEXT
            );",
        )
        .context("PinchyDb schema migration")?;
        Ok(())
    }

    // =====================================================================
    // Sessions
    // =====================================================================

    /// Insert a new session into the index.
    pub fn insert_session(&self, entry: &IndexEntry) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO sessions (session_id, agent_id, created_at, title)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                entry.session_id,
                entry.agent_id,
                entry.created_at as i64,
                entry.title
            ],
        )?;
        debug!(session = %entry.session_id, agent = %entry.agent_id, "session inserted");
        Ok(())
    }

    /// Mark a session as the current one for its agent (clears previous).
    pub fn set_current_session(&self, agent_id: &str, session_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET is_current = 0 WHERE agent_id = ?1 AND is_current = 1",
            params![agent_id],
        )?;
        conn.execute(
            "UPDATE sessions SET is_current = 1 WHERE session_id = ?1",
            params![session_id],
        )?;
        debug!(agent = %agent_id, session = %session_id, "current session set");
        Ok(())
    }

    /// Get the current session id for an agent (if any).
    pub fn current_session(&self, agent_id: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let id: Option<String> = conn
            .query_row(
                "SELECT session_id FROM sessions WHERE agent_id = ?1 AND is_current = 1",
                params![agent_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(id)
    }

    /// Clear the current session for an agent.
    pub fn clear_current_session(&self, agent_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET is_current = 0 WHERE agent_id = ?1",
            params![agent_id],
        )?;
        Ok(())
    }

    /// Delete a session and all its exchanges and receipts.
    pub fn delete_session(&self, session_id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        // Delete exchanges first (child rows).
        conn.execute(
            "DELETE FROM exchanges WHERE session_id = ?1",
            params![session_id],
        )?;
        // Delete receipts.
        conn.execute(
            "DELETE FROM receipts WHERE session_id = ?1",
            params![session_id],
        )?;
        // Delete session row.
        let changed = conn.execute(
            "DELETE FROM sessions WHERE session_id = ?1",
            params![session_id],
        )?;
        if changed > 0 {
            debug!(session_id, "session deleted from db");
        }
        Ok(changed > 0)
    }

    /// Load all session index entries, newest first.
    pub fn list_sessions(&self) -> Result<Vec<IndexEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT session_id, agent_id, created_at, title FROM sessions ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(IndexEntry {
                session_id: row.get(0)?,
                agent_id: row.get(1)?,
                created_at: row.get::<_, i64>(2)? as u64,
                title: row.get(3)?,
            })
        })?;
        let mut entries = Vec::new();
        for r in rows {
            entries.push(r?);
        }
        Ok(entries)
    }

    /// List sessions for a specific agent, newest first.
    pub fn list_sessions_for_agent(&self, agent_id: &str) -> Result<Vec<IndexEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT session_id, agent_id, created_at, title FROM sessions WHERE agent_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![agent_id], |row| {
            Ok(IndexEntry {
                session_id: row.get(0)?,
                agent_id: row.get(1)?,
                created_at: row.get::<_, i64>(2)? as u64,
                title: row.get(3)?,
            })
        })?;
        let mut entries = Vec::new();
        for r in rows {
            entries.push(r?);
        }
        Ok(entries)
    }

    /// Update session title.
    pub fn update_session_title(&self, session_id: &str, title: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET title = ?1 WHERE session_id = ?2",
            params![title, session_id],
        )?;
        Ok(())
    }

    // =====================================================================
    // Exchanges (per-message session log)
    // =====================================================================

    /// Append a single exchange to a session.
    pub fn append_exchange(&self, session_id: &str, exchange: &Exchange) -> Result<()> {
        self.append_exchanges(session_id, std::slice::from_ref(exchange))
    }

    /// Append multiple exchanges in a single transaction.
    pub fn append_exchanges(&self, session_id: &str, exchanges: &[Exchange]) -> Result<()> {
        if exchanges.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO exchanges (session_id, timestamp, role, content, metadata, tool_calls, tool_call_id, images)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for ex in exchanges {
                let metadata = ex
                    .metadata
                    .as_ref()
                    .map(|v| serde_json::to_string(v).unwrap_or_default());
                let tool_calls = ex
                    .tool_calls
                    .as_ref()
                    .map(|v| serde_json::to_string(v).unwrap_or_default());
                let images = if ex.images.is_empty() {
                    "[]".to_string()
                } else {
                    serde_json::to_string(&ex.images).unwrap_or_else(|_| "[]".into())
                };
                stmt.execute(params![
                    session_id,
                    ex.timestamp as i64,
                    ex.role,
                    ex.content,
                    metadata,
                    tool_calls,
                    ex.tool_call_id,
                    images,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Replace all exchanges in a session with the given list.
    /// Used by the PUT session API to overwrite session content.
    pub fn replace_exchanges(&self, session_id: &str, exchanges: &[Exchange]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM exchanges WHERE session_id = ?1",
            params![session_id],
        )?;
        let mut stmt = conn.prepare(
            "INSERT INTO exchanges (session_id, timestamp, role, content, metadata, tool_calls, tool_call_id, images)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for ex in exchanges {
            let metadata = ex.metadata.as_ref().map(|v| v.to_string());
            let tool_calls = ex
                .tool_calls
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".into()));
            let images = serde_json::to_string(&ex.images).unwrap_or_else(|_| "[]".into());
            stmt.execute(params![
                session_id,
                ex.timestamp as i64,
                ex.role,
                ex.content,
                metadata,
                tool_calls,
                ex.tool_call_id,
                images,
            ])?;
        }
        Ok(())
    }

    /// Load the last `limit` exchanges for a session (in chronological order).
    pub fn load_history(&self, session_id: &str, limit: usize) -> Result<Vec<Exchange>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT timestamp, role, content, metadata, tool_calls, tool_call_id, images
             FROM (
                 SELECT * FROM exchanges
                 WHERE session_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2
             ) sub ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id, limit as i64], |row| {
            let metadata_str: Option<String> = row.get(3)?;
            let tool_calls_str: Option<String> = row.get(4)?;
            let images_str: String = row.get(6)?;
            Ok(Exchange {
                timestamp: row.get::<_, i64>(0)? as u64,
                role: row.get(1)?,
                content: row.get(2)?,
                metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_calls: tool_calls_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_call_id: row.get(5)?,
                images: serde_json::from_str(&images_str).unwrap_or_default(),
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Load ALL exchanges for a session (chronological order).
    pub fn load_full_history(&self, session_id: &str) -> Result<Vec<Exchange>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT timestamp, role, content, metadata, tool_calls, tool_call_id, images
             FROM exchanges WHERE session_id = ?1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let metadata_str: Option<String> = row.get(3)?;
            let tool_calls_str: Option<String> = row.get(4)?;
            let images_str: String = row.get(6)?;
            Ok(Exchange {
                timestamp: row.get::<_, i64>(0)? as u64,
                role: row.get(1)?,
                content: row.get(2)?,
                metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_calls: tool_calls_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_call_id: row.get(5)?,
                images: serde_json::from_str(&images_str).unwrap_or_default(),
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Count exchanges in a session.
    pub fn exchange_count(&self, session_id: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM exchanges WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }

    // =====================================================================
    // Receipts
    // =====================================================================

    /// Persist a turn receipt.
    pub fn insert_receipt(&self, receipt: &TurnReceipt) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tool_calls_json =
            serde_json::to_string(&receipt.tool_calls).unwrap_or_else(|_| "[]".into());
        let call_details_json =
            serde_json::to_string(&receipt.call_details).unwrap_or_else(|_| "[]".into());
        conn.execute(
            "INSERT INTO receipts (
                session_id, agent_id, started_at, duration_ms, user_prompt,
                tool_calls_json, prompt_tokens, completion_tokens, total_tokens,
                cached_tokens, reasoning_tokens, model_calls, reply_summary,
                model_id, estimated_cost_usd, call_details_json
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
            params![
                receipt.session,
                receipt.agent,
                receipt.started_at as i64,
                receipt.duration_ms as i64,
                receipt.user_prompt,
                tool_calls_json,
                receipt.tokens.prompt_tokens as i64,
                receipt.tokens.completion_tokens as i64,
                receipt.tokens.total_tokens as i64,
                receipt.tokens.cached_tokens as i64,
                receipt.tokens.reasoning_tokens as i64,
                receipt.model_calls,
                receipt.reply_summary,
                receipt.model_id,
                receipt.estimated_cost_usd,
                call_details_json,
            ],
        )?;
        debug!(agent = %receipt.agent, "receipt persisted");
        Ok(())
    }

    /// Load receipts for a session (newest first).
    pub fn list_receipts_for_session(&self, session_id: &str) -> Result<Vec<TurnReceipt>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT session_id, agent_id, started_at, duration_ms, user_prompt,
                    tool_calls_json, prompt_tokens, completion_tokens, total_tokens,
                    cached_tokens, reasoning_tokens, model_calls, reply_summary,
                    model_id, estimated_cost_usd, call_details_json
             FROM receipts WHERE session_id = ?1 ORDER BY id DESC",
        )?;
        let rows = stmt.query_map(params![session_id], Self::row_to_receipt)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    fn row_to_receipt(row: &rusqlite::Row<'_>) -> rusqlite::Result<TurnReceipt> {
        let tool_calls_json: String = row.get(5)?;
        let call_details_json: String = row.get(15)?;
        Ok(TurnReceipt {
            session: row.get(0)?,
            agent: row.get(1)?,
            started_at: row.get::<_, i64>(2)? as u64,
            duration_ms: row.get::<_, i64>(3)? as u64,
            user_prompt: row.get(4)?,
            tool_calls: serde_json::from_str(&tool_calls_json).unwrap_or_default(),
            tokens: TokenUsageSummary {
                prompt_tokens: row.get::<_, i64>(6)? as u64,
                completion_tokens: row.get::<_, i64>(7)? as u64,
                total_tokens: row.get::<_, i64>(8)? as u64,
                cached_tokens: row.get::<_, i64>(9)? as u64,
                reasoning_tokens: row.get::<_, i64>(10)? as u64,
            },
            model_calls: row.get(11)?,
            reply_summary: row.get(12)?,
            model_id: row.get(13)?,
            estimated_cost_usd: row.get(14)?,
            call_details: serde_json::from_str(&call_details_json).unwrap_or_default(),
        })
    }

    /// Aggregate usage buckets grouped by (day, agent, model) with optional filters.
    /// This runs a single SQL query and returns pre-aggregated rows for the usage dashboard.
    pub fn aggregate_usage(
        &self,
        agent_filter: Option<&str>,
        model_filter: Option<&str>,
        from_date: Option<&str>,
        to_date: Option<&str>,
    ) -> Result<Vec<UsageBucket>> {
        let conn = self.conn.lock().unwrap();
        // Build dynamic WHERE clauses.
        let mut conditions = Vec::new();
        let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(agent) = agent_filter {
            conditions.push(format!("agent_id = ?{}", bind_values.len() + 1));
            bind_values.push(Box::new(agent.to_string()));
        }
        if let Some(model) = model_filter {
            conditions.push(format!("model_id LIKE ?{}", bind_values.len() + 1));
            bind_values.push(Box::new(format!("%{model}%")));
        }
        if let Some(from) = from_date {
            conditions.push(format!(
                "DATE(started_at, 'unixepoch') >= ?{}",
                bind_values.len() + 1
            ));
            bind_values.push(Box::new(from.to_string()));
        }
        if let Some(to) = to_date {
            conditions.push(format!(
                "DATE(started_at, 'unixepoch') <= ?{}",
                bind_values.len() + 1
            ));
            bind_values.push(Box::new(to.to_string()));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!(
            "SELECT DATE(started_at, 'unixepoch') AS day,
                    agent_id,
                    model_id,
                    COUNT(*) AS turns,
                    SUM(prompt_tokens) AS prompt_tokens,
                    SUM(completion_tokens) AS completion_tokens,
                    SUM(cached_tokens) AS cached_tokens,
                    SUM(reasoning_tokens) AS reasoning_tokens,
                    SUM(total_tokens) AS total_tokens,
                    SUM(COALESCE(estimated_cost_usd, 0.0)) AS estimated_cost_usd
             FROM receipts
             {where_clause}
             GROUP BY day, agent_id, model_id
             ORDER BY day, agent_id, model_id"
        );

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            bind_values.iter().map(|b| b.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(UsageBucket {
                day: row.get(0)?,
                agent: row.get(1)?,
                model: row.get(2)?,
                turns: row.get::<_, i64>(3)? as u64,
                prompt_tokens: row.get::<_, i64>(4)? as u64,
                completion_tokens: row.get::<_, i64>(5)? as u64,
                cached_tokens: row.get::<_, i64>(6)? as u64,
                reasoning_tokens: row.get::<_, i64>(7)? as u64,
                total_tokens: row.get::<_, i64>(8)? as u64,
                estimated_cost_usd: row.get(9)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Count sessions for an agent (used by agent detail endpoint).
    pub fn session_count_for_agent(&self, agent_id: &str) -> Result<u32> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sessions WHERE agent_id = ?1",
            params![agent_id],
            |row| row.get(0),
        )?;
        Ok(count as u32)
    }

    // =====================================================================
    // Cron jobs
    // =====================================================================

    /// Upsert a cron job.
    pub fn upsert_cron_job(&self, job: &PersistedCronJob) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let depends_on = job
            .depends_on
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "null".into()));
        let kind_str = serde_json::to_string(&job.kind).unwrap_or_else(|_| "\"Message\"".into());
        let retry_delay_secs = job.retry_delay_secs.map(|v| v as i64);
        conn.execute(
            "INSERT INTO cron_jobs (agent_id, name, schedule, message, kind, depends_on, max_retries, retry_delay_secs, condition, retry_count, last_status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
             ON CONFLICT(agent_id, name) DO UPDATE SET
                schedule=excluded.schedule, message=excluded.message, kind=excluded.kind,
                depends_on=excluded.depends_on, max_retries=excluded.max_retries,
                retry_delay_secs=excluded.retry_delay_secs, condition=excluded.condition,
                retry_count=excluded.retry_count, last_status=excluded.last_status",
            params![
                job.agent_id,
                job.name,
                job.schedule,
                job.message,
                kind_str,
                depends_on,
                job.max_retries,
                retry_delay_secs,
                job.condition,
                job.retry_count,
                job.last_status,
            ],
        )?;
        debug!(agent = %job.agent_id, name = %job.name, "cron job upserted");
        Ok(())
    }

    /// Remove a cron job by agent + name.
    pub fn remove_cron_job(&self, agent_id: &str, name: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "DELETE FROM cron_jobs WHERE agent_id = ?1 AND name = ?2",
            params![agent_id, name],
        )?;
        Ok(changed > 0)
    }

    /// Load all persisted cron jobs for an agent.
    pub fn list_cron_jobs(&self, agent_id: &str) -> Result<Vec<PersistedCronJob>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT agent_id, name, schedule, message, kind, depends_on, max_retries, retry_delay_secs, condition, retry_count, last_status
             FROM cron_jobs WHERE agent_id = ?1",
        )?;
        let rows = stmt.query_map(params![agent_id], |row| {
            let kind_str: String = row.get(4)?;
            let depends_on_str: Option<String> = row.get(5)?;
            Ok(PersistedCronJob {
                agent_id: row.get(0)?,
                name: row.get(1)?,
                schedule: row.get(2)?,
                message: row.get(3)?,
                kind: serde_json::from_str(&kind_str).unwrap_or_default(),
                depends_on: depends_on_str.and_then(|s| serde_json::from_str(&s).ok()),
                max_retries: row.get(6)?,
                retry_delay_secs: row.get::<_, Option<i64>>(7)?.map(|v| v as u64),
                condition: row.get(8)?,
                retry_count: row.get(9)?,
                last_status: row.get(10)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Load all cron jobs across all agents.
    pub fn list_all_cron_jobs(&self) -> Result<Vec<PersistedCronJob>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT agent_id, name, schedule, message, kind, depends_on, max_retries, retry_delay_secs, condition, retry_count, last_status
             FROM cron_jobs",
        )?;
        let rows = stmt.query_map([], |row| {
            let kind_str: String = row.get(4)?;
            let depends_on_str: Option<String> = row.get(5)?;
            Ok(PersistedCronJob {
                agent_id: row.get(0)?,
                name: row.get(1)?,
                schedule: row.get(2)?,
                message: row.get(3)?,
                kind: serde_json::from_str(&kind_str).unwrap_or_default(),
                depends_on: depends_on_str.and_then(|s| serde_json::from_str(&s).ok()),
                max_retries: row.get(6)?,
                retry_delay_secs: row.get::<_, Option<i64>>(7)?.map(|v| v as u64),
                condition: row.get(8)?,
                retry_count: row.get(9)?,
                last_status: row.get(10)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    // =====================================================================
    // Cron events (job run records)
    // =====================================================================

    /// Insert a cron event (job run record).
    pub fn insert_cron_event(&self, event: &JobRun) -> Result<()> {
        let status_str =
            serde_json::to_string(&event.status).unwrap_or_else(|_| "\"Pending\"".into());
        let conn = self.conn.lock().unwrap();
        let executed_at = event.executed_at.map(|v| v as i64);
        let completed_at = event.completed_at.map(|v| v as i64);
        let duration_ms = event.duration_ms.map(|v| v as i64);
        conn.execute(
            "INSERT OR REPLACE INTO cron_events (id, job_id, scheduled_at, executed_at, completed_at, status, output_preview, error, duration_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                event.id,
                event.job_id,
                event.scheduled_at as i64,
                executed_at,
                completed_at,
                status_str,
                event.output_preview,
                event.error,
                duration_ms,
            ],
        )?;
        Ok(())
    }

    /// Load recent cron events for a job, newest first.
    pub fn list_cron_events(&self, job_id: &str, limit: usize) -> Result<Vec<JobRun>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, job_id, scheduled_at, executed_at, completed_at, status, output_preview, error, duration_ms
             FROM cron_events WHERE job_id = ?1 ORDER BY scheduled_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![job_id, limit as i64], |row| {
            let status_str: String = row.get(5)?;
            Ok(JobRun {
                id: row.get(0)?,
                job_id: row.get(1)?,
                scheduled_at: row.get::<_, i64>(2)? as u64,
                executed_at: row.get::<_, Option<i64>>(3)?.map(|v| v as u64),
                completed_at: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                status: serde_json::from_str(&status_str)
                    .unwrap_or(crate::scheduler::JobStatus::PENDING),
                output_preview: row.get(6)?,
                error: row.get(7)?,
                duration_ms: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Cleanup old cron events, keeping the most recent `keep` per job.
    pub fn cleanup_cron_events(&self, keep: usize) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let deleted = conn.execute(
            "DELETE FROM cron_events WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY scheduled_at DESC) AS rn
                    FROM cron_events
                ) WHERE rn <= ?1
            )",
            params![keep as i64],
        )?;
        if deleted > 0 {
            debug!(deleted, keep, "cleaned up old cron events");
        }
        Ok(deleted)
    }

    /// Load all cron events whose `job_id` ends with `@<agent_id>`.
    /// Returns runs in ascending `scheduled_at` order (oldest first),
    /// matching the behaviour of the old file-based `load_cron_runs`.
    pub fn list_cron_events_for_agent(&self, agent_id: &str) -> Result<Vec<JobRun>> {
        let suffix = format!("@{agent_id}");
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, job_id, scheduled_at, executed_at, completed_at, status, output_preview, error, duration_ms
             FROM cron_events WHERE job_id LIKE '%' || ?1 ORDER BY scheduled_at ASC",
        )?;
        let rows = stmt.query_map(params![suffix], |row| {
            let status_str: String = row.get(5)?;
            Ok(crate::scheduler::JobRun {
                id: row.get(0)?,
                job_id: row.get(1)?,
                scheduled_at: row.get::<_, i64>(2)? as u64,
                executed_at: row.get::<_, Option<i64>>(3)?.map(|v| v as u64),
                completed_at: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                status: serde_json::from_str(&status_str)
                    .unwrap_or(crate::scheduler::JobStatus::PENDING),
                output_preview: row.get(6)?,
                error: row.get(7)?,
                duration_ms: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Update just the `last_status` column of a cron job identified by
    /// its composite `job_id` (`name@agent_id`).
    pub fn update_cron_job_status(&self, job_id: &str, status: &str) -> Result<bool> {
        // Split "name@agent_id"
        let (name, agent_id) = match job_id.rsplit_once('@') {
            Some(pair) => pair,
            None => return Ok(false),
        };
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE cron_jobs SET last_status = ?1 WHERE agent_id = ?2 AND name = ?3",
            params![status, agent_id, name],
        )?;
        Ok(changed > 0)
    }

    // =====================================================================
    // Heartbeat status
    // =====================================================================

    /// Upsert heartbeat status for an agent.
    pub fn upsert_heartbeat_status(&self, status: &HeartbeatStatus) -> Result<()> {
        let health_str = serde_json::to_string(&status.health).unwrap_or_else(|_| "\"OK\"".into());
        let conn = self.conn.lock().unwrap();
        let last_tick = status.last_tick.map(|v| v as i64);
        let next_tick = status.next_tick.map(|v| v as i64);
        let interval_secs = status.interval_secs.map(|v| v as i64);
        conn.execute(
            "INSERT INTO heartbeat_status (agent_id, enabled, health, last_tick, next_tick, interval_secs, message_preview, latest_session)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(agent_id) DO UPDATE SET
                enabled=excluded.enabled, health=excluded.health,
                last_tick=excluded.last_tick, next_tick=excluded.next_tick,
                interval_secs=excluded.interval_secs, message_preview=excluded.message_preview,
                latest_session=excluded.latest_session",
            params![
                status.agent_id,
                status.enabled,
                health_str,
                last_tick,
                next_tick,
                interval_secs,
                status.message_preview,
                status.latest_session,
            ],
        )?;
        Ok(())
    }

    /// Load heartbeat status for an agent.
    pub fn load_heartbeat_status(&self, agent_id: &str) -> Result<Option<HeartbeatStatus>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT agent_id, enabled, health, last_tick, next_tick, interval_secs, message_preview, latest_session
             FROM heartbeat_status WHERE agent_id = ?1",
            params![agent_id],
            |row| {
                let health_str: String = row.get(2)?;
                Ok(HeartbeatStatus {
                    agent_id: row.get(0)?,
                    enabled: row.get(1)?,
                    health: serde_json::from_str(&health_str).unwrap_or(crate::scheduler::HeartbeatHealth::OK),
                    last_tick: row.get::<_, Option<i64>>(3)?.map(|v| v as u64),
                    next_tick: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                    interval_secs: row.get::<_, Option<i64>>(5)?.map(|v| v as u64),
                    message_preview: row.get(6)?,
                    latest_session: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_and_query_session() {
        let db = PinchyDb::open_memory().unwrap();
        let entry = IndexEntry {
            session_id: "s1".into(),
            agent_id: "agent-a".into(),
            created_at: 1000,
            title: Some("Test".into()),
        };
        db.insert_session(&entry).unwrap();
        db.set_current_session("agent-a", "s1").unwrap();

        assert_eq!(db.current_session("agent-a").unwrap(), Some("s1".into()));

        let all = db.list_sessions().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].session_id, "s1");
    }

    #[test]
    fn append_and_load_exchanges() {
        let db = PinchyDb::open_memory().unwrap();
        db.insert_session(&IndexEntry {
            session_id: "s1".into(),
            agent_id: "a".into(),
            created_at: 1,
            title: None,
        })
        .unwrap();

        let exchanges: Vec<Exchange> = (0..5)
            .map(|i| Exchange {
                timestamp: i as u64,
                role: "user".into(),
                content: format!("msg {i}"),
                metadata: None,
                tool_calls: None,
                tool_call_id: None,
                images: vec![],
            })
            .collect();
        db.append_exchanges("s1", &exchanges).unwrap();

        let last3 = db.load_history("s1", 3).unwrap();
        assert_eq!(last3.len(), 3);
        assert_eq!(last3[0].content, "msg 2");
        assert_eq!(last3[2].content, "msg 4");

        assert_eq!(db.exchange_count("s1").unwrap(), 5);
    }

    #[test]
    fn insert_and_list_receipts() {
        let db = PinchyDb::open_memory().unwrap();
        let receipt = TurnReceipt {
            agent: "a".into(),
            session: Some("s1".into()),
            started_at: 100,
            duration_ms: 50,
            user_prompt: "hello".into(),
            tool_calls: vec![],
            tokens: TokenUsageSummary::default(),
            model_calls: 1,
            reply_summary: "hi".into(),
            model_id: "gpt-4o".into(),
            estimated_cost_usd: Some(0.001),
            call_details: vec![],
        };
        db.insert_receipt(&receipt).unwrap();

        let list = db.list_receipts_for_session("s1").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].model_id, "gpt-4o");
    }

    #[test]
    fn cron_job_upsert_and_remove() {
        let db = PinchyDb::open_memory().unwrap();
        let job = PersistedCronJob {
            agent_id: "a".into(),
            name: "daily".into(),
            schedule: "0 9 * * *".into(),
            message: Some("good morning".into()),
            kind: Default::default(),
            depends_on: None,
            max_retries: None,
            retry_delay_secs: None,
            condition: None,
            retry_count: 0,
            last_status: None,
        };
        db.upsert_cron_job(&job).unwrap();

        let jobs = db.list_cron_jobs("a").unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].schedule, "0 9 * * *");

        db.remove_cron_job("a", "daily").unwrap();
        assert_eq!(db.list_cron_jobs("a").unwrap().len(), 0);
    }

    #[test]
    fn heartbeat_upsert_and_load() {
        let db = PinchyDb::open_memory().unwrap();
        let status = HeartbeatStatus {
            agent_id: "a".into(),
            enabled: true,
            health: crate::scheduler::HeartbeatHealth::OK,
            last_tick: Some(500),
            next_tick: Some(600),
            interval_secs: Some(60),
            message_preview: None,
            latest_session: None,
        };
        db.upsert_heartbeat_status(&status).unwrap();

        let loaded = db.load_heartbeat_status("a").unwrap().unwrap();
        assert_eq!(loaded.last_tick, Some(500));
    }
}
