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

use crate::agent::types::{ModelCallTrace, PromptSnapshot, TokenUsageSummary, TurnReceipt};
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
                assistant_exchange_id INTEGER,
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
                 call_details_json  TEXT NOT NULL DEFAULT '[]',
                 prompt_snapshot_json TEXT,
                 reasoning_text     TEXT,
                 reasoning_text_status TEXT
              );

            CREATE INDEX IF NOT EXISTS idx_receipts_session
                ON receipts(session_id);
            CREATE INDEX IF NOT EXISTS idx_receipts_agent
                ON receipts(agent_id);

            CREATE TABLE IF NOT EXISTS receipt_model_calls (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_id              INTEGER NOT NULL,
                session_id              TEXT,
                call_index              INTEGER NOT NULL,
                provider                TEXT NOT NULL,
                model_id                TEXT NOT NULL,
                api_surface             TEXT,
                request_kind            TEXT,
                started_at              INTEGER NOT NULL,
                latency_ms              INTEGER NOT NULL,
                normalized_messages_json TEXT NOT NULL DEFAULT '[]',
                normalized_tools_json   TEXT NOT NULL DEFAULT '[]',
                reasoning_effort        TEXT,
                function_call_mode      TEXT,
                prompt_tokens           INTEGER NOT NULL DEFAULT 0,
                completion_tokens       INTEGER NOT NULL DEFAULT 0,
                cached_tokens           INTEGER NOT NULL DEFAULT 0,
                reasoning_tokens        INTEGER NOT NULL DEFAULT 0,
                cost_usd                REAL,
                reasoning_text          TEXT,
                reasoning_text_status   TEXT NOT NULL DEFAULT 'provider_did_not_expose',
                FOREIGN KEY (receipt_id) REFERENCES receipts(id)
            );

            CREATE INDEX IF NOT EXISTS idx_receipt_model_calls_receipt
                ON receipt_model_calls(receipt_id, call_index);
            CREATE INDEX IF NOT EXISTS idx_receipt_model_calls_session
                ON receipt_model_calls(session_id, receipt_id, call_index);

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
                enabled         INTEGER NOT NULL DEFAULT 1,
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
        ensure_column(&conn, "receipts", "assistant_exchange_id", "INTEGER")?;
        ensure_column(&conn, "receipts", "prompt_snapshot_json", "TEXT")?;
        ensure_column(&conn, "receipts", "reasoning_text", "TEXT")?;
        ensure_column(&conn, "receipts", "reasoning_text_status", "TEXT")?;
        Ok(())
    }

    // =====================================================================
    // Sessions
    // =====================================================================

    /// Insert a new session into the index.
    pub fn insert_session(&self, entry: &IndexEntry) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        self.execute(
            "UPDATE sessions SET is_current = 0 WHERE agent_id = ?1",
            params![agent_id],
        )?;
        debug!(agent = %agent_id, "current session cleared");
        Ok(())
    }

    /// Delete a session and all its exchanges and receipts.
    pub fn delete_session(&self, session_id: &str) -> Result<bool> {
        let changed = self.transaction(|tx| {
            tx.execute(
                "DELETE FROM receipt_model_calls WHERE session_id = ?1",
                params![session_id],
            )?;
            // Delete exchanges first (child rows).
            tx.execute(
                "DELETE FROM exchanges WHERE session_id = ?1",
                params![session_id],
            )?;
            // Delete receipts.
            tx.execute(
                "DELETE FROM receipts WHERE session_id = ?1",
                params![session_id],
            )?;
            // Delete session row.
            let changed = tx.execute(
                "DELETE FROM sessions WHERE session_id = ?1",
                params![session_id],
            )?;
            Ok(changed)
        })?;
        if changed > 0 {
            debug!(session_id, "session deleted from db");
        }
        Ok(changed > 0)
    }

    /// Load all session index entries, newest first.
    pub fn list_sessions(&self) -> Result<Vec<IndexEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        self.execute(
            "UPDATE sessions SET title = ?1 WHERE session_id = ?2",
            params![title, session_id],
        )?;
        debug!(session_id, "session title updated");
        Ok(())
    }

    // =====================================================================
    // Exchanges (per-message session log)
    // =====================================================================

    /// Append a single exchange to a session.
    pub fn append_exchange(&self, session_id: &str, exchange: &Exchange) -> Result<i64> {
        self.append_exchanges(session_id, std::slice::from_ref(exchange))?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("append_exchange did not return an inserted row id"))
    }

    /// Append multiple exchanges in a single transaction.
    pub fn append_exchanges(&self, session_id: &str, exchanges: &[Exchange]) -> Result<Vec<i64>> {
        if exchanges.is_empty() {
            return Ok(Vec::new());
        }
        let inserted_ids = self.transaction(|tx| {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO exchanges (session_id, timestamp, role, content, metadata, tool_calls, tool_call_id, images)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            let mut inserted_ids = Vec::with_capacity(exchanges.len());
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
                inserted_ids.push(tx.last_insert_rowid());
            }
            Ok(inserted_ids)
        })?;
        debug!(session_id, count = exchanges.len(), "exchanges appended");
        Ok(inserted_ids)
    }

    /// Replace all exchanges in a session with the given list.
    /// Used by the PUT session API to overwrite session content.
    pub fn replace_exchanges(&self, session_id: &str, exchanges: &[Exchange]) -> Result<()> {
        self.transaction(|tx| {
            tx.execute(
                "DELETE FROM exchanges WHERE session_id = ?1",
                params![session_id],
            )?;
            let mut stmt = tx.prepare(
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
        })?;
        debug!(session_id, count = exchanges.len(), "exchanges replaced");
        Ok(())
    }

    /// Load the last `limit` exchanges for a session (in chronological order).
    pub fn load_history(&self, session_id: &str, limit: usize) -> Result<Vec<Exchange>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, role, content, metadata, tool_calls, tool_call_id, images
             FROM (
                  SELECT * FROM exchanges
                  WHERE session_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2
             ) sub ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id, limit as i64], |row| {
            let metadata_str: Option<String> = row.get(4)?;
            let tool_calls_str: Option<String> = row.get(5)?;
            let images_str: String = row.get(7)?;
            Ok(Exchange {
                exchange_id: Some(row.get::<_, i64>(0)?),
                timestamp: row.get::<_, i64>(1)? as u64,
                role: row.get(2)?,
                content: row.get(3)?,
                metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_calls: tool_calls_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_call_id: row.get(6)?,
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, role, content, metadata, tool_calls, tool_call_id, images
             FROM exchanges WHERE session_id = ?1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let metadata_str: Option<String> = row.get(4)?;
            let tool_calls_str: Option<String> = row.get(5)?;
            let images_str: String = row.get(7)?;
            Ok(Exchange {
                exchange_id: Some(row.get::<_, i64>(0)?),
                timestamp: row.get::<_, i64>(1)? as u64,
                role: row.get(2)?,
                content: row.get(3)?,
                metadata: metadata_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_calls: tool_calls_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_call_id: row.get(6)?,
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
    pub fn insert_receipt(&self, receipt: &TurnReceipt) -> Result<i64> {
        let tool_calls_json =
            serde_json::to_string(&receipt.tool_calls).unwrap_or_else(|_| "[]".into());
        let call_details_json =
            serde_json::to_string(&receipt.call_details).unwrap_or_else(|_| "[]".into());
        let prompt_snapshot_json = receipt
            .prompt_snapshot
            .as_ref()
            .and_then(|snapshot| serde_json::to_string(snapshot).ok());
        let reasoning_text_status_json = receipt
            .reasoning_text_status
            .as_ref()
            .and_then(|status| serde_json::to_string(status).ok());
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        conn.execute(
            "INSERT INTO receipts (
                session_id, agent_id, assistant_exchange_id, started_at, duration_ms, user_prompt,
                tool_calls_json, prompt_tokens, completion_tokens, total_tokens,
                cached_tokens, reasoning_tokens, model_calls, reply_summary,
                model_id, estimated_cost_usd, call_details_json, prompt_snapshot_json,
                reasoning_text, reasoning_text_status
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
            params![
                receipt.session,
                receipt.agent,
                receipt.assistant_exchange_id,
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
                prompt_snapshot_json,
                receipt.reasoning_text,
                reasoning_text_status_json,
            ],
        )?;
        let receipt_id = conn.last_insert_rowid();
        debug!(agent = %receipt.agent, "receipt persisted");
        Ok(receipt_id)
    }

    pub fn insert_receipt_model_calls(
        &self,
        receipt_id: i64,
        session_id: Option<&str>,
        calls: &[ModelCallTrace],
    ) -> Result<()> {
        if calls.is_empty() {
            return Ok(());
        }

        self.transaction(|tx| {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO receipt_model_calls (
                    receipt_id, session_id, call_index, provider, model_id, api_surface,
                    request_kind, started_at, latency_ms, normalized_messages_json,
                    normalized_tools_json, reasoning_effort, function_call_mode,
                    prompt_tokens, completion_tokens, cached_tokens, reasoning_tokens,
                    cost_usd, reasoning_text, reasoning_text_status
                 ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
            )?;

            for call in calls {
                let messages_json = serde_json::to_string(&call.normalized_messages)
                    .unwrap_or_else(|_| "[]".into());
                let tools_json =
                    serde_json::to_string(&call.normalized_tools).unwrap_or_else(|_| "[]".into());
                stmt.execute(params![
                    receipt_id,
                    session_id,
                    call.call_index,
                    call.provider,
                    call.model_id,
                    call.api_surface,
                    call.request_kind,
                    call.started_at as i64,
                    call.latency_ms as i64,
                    messages_json,
                    tools_json,
                    call.reasoning_effort,
                    call.function_call_mode,
                    call.prompt_tokens as i64,
                    call.completion_tokens as i64,
                    call.cached_tokens as i64,
                    call.reasoning_tokens as i64,
                    call.cost_usd,
                    call.reasoning_text,
                    serde_json::to_string(&call.reasoning_text_status)
                        .unwrap_or_else(|_| "\"provider_did_not_expose\"".into()),
                ])?;
            }
            Ok(())
        })?;

        Ok(())
    }

    /// Load receipts for a session (newest first).
    pub fn list_receipts_for_session(&self, session_id: &str) -> Result<Vec<TurnReceipt>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, session_id, agent_id, assistant_exchange_id, started_at, duration_ms, user_prompt,
                    tool_calls_json, prompt_tokens, completion_tokens, total_tokens,
                    cached_tokens, reasoning_tokens, model_calls, reply_summary,
                    model_id, estimated_cost_usd, call_details_json, prompt_snapshot_json,
                    reasoning_text, reasoning_text_status
             FROM receipts WHERE session_id = ?1 ORDER BY id DESC",
        )?;
        let rows = stmt.query_map(params![session_id], Self::row_to_receipt)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn list_receipt_model_calls_for_session(
        &self,
        session_id: &str,
    ) -> Result<std::collections::HashMap<i64, Vec<ModelCallTrace>>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT r.id,
                    c.call_index, c.provider, c.model_id, c.api_surface, c.request_kind,
                    c.started_at, c.latency_ms, c.normalized_messages_json,
                    c.normalized_tools_json, c.reasoning_effort, c.function_call_mode,
                    c.prompt_tokens, c.completion_tokens, c.cached_tokens, c.reasoning_tokens,
                    c.cost_usd, c.reasoning_text, c.reasoning_text_status
             FROM receipt_model_calls c
             INNER JOIN receipts r ON r.id = c.receipt_id
             WHERE c.session_id = ?1
             ORDER BY r.id DESC, c.call_index ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let receipt_id = row.get::<_, i64>(0)?;
            Ok((receipt_id, Self::row_to_model_call_trace(row, 1)?))
        })?;

        let mut out = std::collections::HashMap::new();
        for row in rows {
            let (receipt_id, trace) = row?;
            out.entry(receipt_id).or_insert_with(Vec::new).push(trace);
        }
        Ok(out)
    }

    pub fn get_receipt_model_calls(
        &self,
        session_id: &str,
        receipt_id: i64,
    ) -> Result<Vec<ModelCallTrace>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT c.call_index, c.provider, c.model_id, c.api_surface, c.request_kind,
                    c.started_at, c.latency_ms, c.normalized_messages_json,
                    c.normalized_tools_json, c.reasoning_effort, c.function_call_mode,
                    c.prompt_tokens, c.completion_tokens, c.cached_tokens, c.reasoning_tokens,
                    c.cost_usd, c.reasoning_text, c.reasoning_text_status
              FROM receipt_model_calls c
              INNER JOIN receipts r ON r.id = c.receipt_id
              WHERE c.session_id = ?1 AND r.id = ?2
              ORDER BY c.call_index ASC",
        )?;
        let rows = stmt.query_map(params![session_id, receipt_id], |row| {
            Self::row_to_model_call_trace(row, 0)
        })?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn row_to_receipt(row: &rusqlite::Row<'_>) -> rusqlite::Result<TurnReceipt> {
        let tool_calls_json: String = row.get(7)?;
        let call_details_json: String = row.get(17)?;
        let prompt_snapshot_json: Option<String> = row.get(18)?;
        let reasoning_text_status_json: Option<String> = row.get(20)?;
        Ok(TurnReceipt {
            receipt_id: Some(row.get::<_, i64>(0)?),
            session: row.get(1)?,
            agent: row.get(2)?,
            assistant_exchange_id: row.get(3)?,
            started_at: row.get::<_, i64>(4)? as u64,
            duration_ms: row.get::<_, i64>(5)? as u64,
            user_prompt: row.get(6)?,
            tool_calls: serde_json::from_str(&tool_calls_json).unwrap_or_default(),
            tokens: TokenUsageSummary {
                prompt_tokens: row.get::<_, i64>(8)? as u64,
                completion_tokens: row.get::<_, i64>(9)? as u64,
                total_tokens: row.get::<_, i64>(10)? as u64,
                cached_tokens: row.get::<_, i64>(11)? as u64,
                reasoning_tokens: row.get::<_, i64>(12)? as u64,
            },
            model_calls: row.get(13)?,
            reply_summary: row.get(14)?,
            model_id: row.get(15)?,
            estimated_cost_usd: row.get(16)?,
            call_details: serde_json::from_str(&call_details_json).unwrap_or_default(),
            prompt_snapshot: prompt_snapshot_json
                .and_then(|json| serde_json::from_str::<PromptSnapshot>(&json).ok()),
            reasoning_text: row.get(19)?,
            reasoning_text_status: reasoning_text_status_json.and_then(|json| {
                serde_json::from_str::<crate::models::ReasoningTextStatus>(&json).ok()
            }),
        })
    }

    fn row_to_model_call_trace(
        row: &rusqlite::Row<'_>,
        offset: usize,
    ) -> rusqlite::Result<ModelCallTrace> {
        let messages_json: String = row.get(offset + 7)?;
        let tools_json: String = row.get(offset + 8)?;
        let reasoning_text_status_json: String = row.get(offset + 17)?;
        Ok(ModelCallTrace {
            call_index: row.get(offset)?,
            provider: row.get(offset + 1)?,
            model_id: row.get(offset + 2)?,
            api_surface: row.get(offset + 3)?,
            request_kind: row.get(offset + 4)?,
            started_at: row.get::<_, i64>(offset + 5)? as u64,
            latency_ms: row.get::<_, i64>(offset + 6)? as u64,
            normalized_messages: serde_json::from_str(&messages_json).unwrap_or_default(),
            normalized_tools: serde_json::from_str(&tools_json).unwrap_or_default(),
            reasoning_effort: row.get(offset + 9)?,
            function_call_mode: row.get(offset + 10)?,
            prompt_tokens: row.get::<_, i64>(offset + 11)? as u64,
            completion_tokens: row.get::<_, i64>(offset + 12)? as u64,
            cached_tokens: row.get::<_, i64>(offset + 13)? as u64,
            reasoning_tokens: row.get::<_, i64>(offset + 14)? as u64,
            cost_usd: row.get(offset + 15)?,
            reasoning_text: row.get(offset + 16)?,
            reasoning_text_status: serde_json::from_str(&reasoning_text_status_json)
                .unwrap_or(crate::models::ReasoningTextStatus::ProviderDidNotExpose),
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        let depends_on = job
            .depends_on
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "null".into()));
        let kind_str = serde_json::to_string(&job.kind).unwrap_or_else(|_| "\"Message\"".into());
        let retry_delay_secs = job.retry_delay_secs.map(|v| v as i64);
        let enabled = if job.enabled { 1i64 } else { 0i64 };
        self.execute(
            "INSERT INTO cron_jobs (agent_id, name, schedule, message, kind, depends_on, max_retries, retry_delay_secs, condition, retry_count, last_status, enabled)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(agent_id, name) DO UPDATE SET
                schedule=excluded.schedule, message=excluded.message, kind=excluded.kind,
                depends_on=excluded.depends_on, max_retries=excluded.max_retries,
                retry_delay_secs=excluded.retry_delay_secs, condition=excluded.condition,
                retry_count=excluded.retry_count, last_status=excluded.last_status,
                enabled=excluded.enabled",
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
                enabled,
            ],
        )?;
        debug!(agent = %job.agent_id, name = %job.name, "cron job upserted");
        Ok(())
    }

    /// Remove a cron job by agent + name.
    pub fn remove_cron_job(&self, agent_id: &str, name: &str) -> Result<bool> {
        let changed = self.execute(
            "DELETE FROM cron_jobs WHERE agent_id = ?1 AND name = ?2",
            params![agent_id, name],
        )?;
        if changed > 0 {
            debug!(agent = %agent_id, name = %name, "cron job removed");
        }
        Ok(changed > 0)
    }

    /// Load all persisted cron jobs for an agent.
    pub fn list_cron_jobs(&self, agent_id: &str) -> Result<Vec<PersistedCronJob>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT agent_id, name, schedule, message, kind, depends_on, max_retries, retry_delay_secs, condition, retry_count, last_status, enabled
             FROM cron_jobs WHERE agent_id = ?1",
        )?;
        let rows = stmt.query_map(params![agent_id], |row| {
            let kind_str: String = row.get(4)?;
            let depends_on_str: Option<String> = row.get(5)?;
            let enabled_i64: i64 = row.get(11)?;
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
                enabled: enabled_i64 != 0,
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
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT agent_id, name, schedule, message, kind, depends_on, max_retries, retry_delay_secs, condition, retry_count, last_status, enabled
             FROM cron_jobs",
        )?;
        let rows = stmt.query_map([], |row| {
            let kind_str: String = row.get(4)?;
            let depends_on_str: Option<String> = row.get(5)?;
            let enabled_i64: i64 = row.get(11)?;
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
                enabled: enabled_i64 != 0,
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
        let executed_at = event.executed_at.map(|v| v as i64);
        let completed_at = event.completed_at.map(|v| v as i64);
        let duration_ms = event.duration_ms.map(|v| v as i64);
        self.execute(
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
        debug!(event_id = %event.id, "cron event inserted");
        Ok(())
    }

    /// Load recent cron events for a job, newest first.
    pub fn list_cron_events(&self, job_id: &str, limit: usize) -> Result<Vec<JobRun>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        let deleted = self.execute(
            "DELETE FROM cron_events WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY scheduled_at DESC) AS rn
                    FROM cron_events
                ) WHERE rn <= ?1
            )",
            params![keep as i64],
        )?;
        if deleted > 0 {
            debug!(deleted, keep, "old cron events cleaned up");
        }
        Ok(deleted)
    }

    /// Load all cron events whose `job_id` ends with `@<agent_id>`.
    /// Returns runs in ascending `scheduled_at` order (oldest first),
    /// matching the behaviour of the old file-based `load_cron_runs`.
    pub fn list_cron_events_for_agent(&self, agent_id: &str) -> Result<Vec<JobRun>> {
        let suffix = format!("@{agent_id}");
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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
        let changed = self.execute(
            "UPDATE cron_jobs SET last_status = ?1 WHERE agent_id = ?2 AND name = ?3",
            params![status, agent_id, name],
        )?;
        if changed > 0 {
            debug!(job_id, status, "cron job status updated");
        }
        Ok(changed > 0)
    }

    // =====================================================================
    // Heartbeat status
    // =====================================================================

    /// Upsert heartbeat status for an agent.
    pub fn upsert_heartbeat_status(&self, status: &HeartbeatStatus) -> Result<()> {
        let health_str = serde_json::to_string(&status.health).unwrap_or_else(|_| "\"OK\"".into());
        let last_tick = status.last_tick.map(|v| v as i64);
        let next_tick = status.next_tick.map(|v| v as i64);
        let interval_secs = status.interval_secs.map(|v| v as i64);
        self.execute(
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
        debug!(agent = %status.agent_id, "heartbeat status upserted");
        Ok(())
    }

    /// Load heartbeat status for an agent.
    pub fn load_heartbeat_status(&self, agent_id: &str) -> Result<Option<HeartbeatStatus>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
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

    /// Force a WAL checkpoint to ensure all data is persisted to the main database file.
    /// Call this during graceful shutdown or after critical writes.
    pub fn checkpoint(&self) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let _: (i32, i32, i32) = conn
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .context("WAL checkpoint")?;
        debug!("WAL checkpoint completed");
        Ok(())
    }

    /// Execute SQL without checkpointing (checkpoints handled automatically by SQLite or during shutdown)
    pub fn execute(&self, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let rows = conn.execute(sql, params)?;
        Ok(rows)
    }

    /// Execute a transaction without automatic checkpoint (checkpoints handled automatically by SQLite or during shutdown)
    pub fn transaction<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(&rusqlite::Transaction) -> Result<R>,
    {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        let tx = conn.transaction()?;
        let result = f(&tx)?;
        tx.commit()?;
        Ok(result)
    }

    /// Execute SQL and immediately checkpoint WAL (for critical writes only)
    #[deprecated(
        note = "Use execute() instead and let SQLite handle checkpointing, or call checkpoint() explicitly during shutdown"
    )]
    pub fn execute_with_checkpoint(
        &self,
        sql: &str,
        params: &[&dyn rusqlite::ToSql],
    ) -> Result<usize> {
        let rows = self.execute(sql, params)?;
        Ok(rows)
    }

    /// Execute a transaction with automatic checkpoint on commit (for critical writes only)
    #[deprecated(
        note = "Use transaction() instead and let SQLite handle checkpointing, or call checkpoint() explicitly during shutdown"
    )]
    pub fn transaction_with_checkpoint<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(&rusqlite::Transaction) -> Result<R>,
    {
        self.transaction(f)
    }

    // =====================================================================
    // System logs (persistent)
    // =====================================================================

    /// Insert a system log entry.
    pub fn insert_system_log(
        &self,
        timestamp: i64,
        level: &str,
        target: &str,
        message: &str,
        fields_json: Option<&str>,
    ) -> Result<i64> {
        let ts_rfc3339 = chrono::DateTime::from_timestamp(timestamp, 0)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| timestamp.to_string());

        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;
        conn.execute(
            "INSERT INTO system_logs (timestamp, ts_rfc3339, level, target, message, fields_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![timestamp, ts_rfc3339, level, target, message, fields_json],
        )?;
        let id = conn.last_insert_rowid();
        debug!(id, target, level, "system log inserted");
        Ok(id)
    }

    /// Query system logs with optional filters.
    pub fn query_system_logs(
        &self,
        level_filter: Option<&str>,
        search_filter: Option<&str>,
        from_ts: Option<i64>,
        to_ts: Option<i64>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<SystemLogEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        // Build dynamic WHERE clause
        let mut conditions = Vec::new();
        let mut params_list: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(level) = level_filter {
            conditions.push(format!("level = ?{}", params_list.len() + 1));
            params_list.push(Box::new(level.to_string()));
        }
        if let Some(search) = search_filter {
            let pattern = format!("%{}%", search);
            conditions.push(format!(
                "(message LIKE ?{} OR target LIKE ?{})",
                params_list.len() + 1,
                params_list.len() + 2
            ));
            params_list.push(Box::new(pattern.clone()));
            params_list.push(Box::new(pattern));
        }
        if let Some(from) = from_ts {
            conditions.push(format!("timestamp >= ?{}", params_list.len() + 1));
            params_list.push(Box::new(from));
        }
        if let Some(to) = to_ts {
            conditions.push(format!("timestamp <= ?{}", params_list.len() + 1));
            params_list.push(Box::new(to));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!(
            "SELECT id, timestamp, ts_rfc3339, level, target, message, fields_json
             FROM system_logs
             {}
             ORDER BY timestamp DESC, id DESC
             LIMIT ?{} OFFSET ?{}",
            where_clause,
            params_list.len() + 1,
            params_list.len() + 2
        );

        params_list.push(Box::new(limit as i64));
        params_list.push(Box::new(offset as i64));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_list.iter().map(|b| b.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(SystemLogEntry {
                id: row.get(0)?,
                timestamp: row.get::<_, i64>(1)? as u64,
                ts_rfc3339: row.get(2)?,
                level: row.get(3)?,
                target: row.get(4)?,
                message: row.get(5)?,
                fields_json: row.get(6)?,
            })
        })?;

        let mut entries = Vec::new();
        for r in rows {
            entries.push(r?);
        }
        Ok(entries)
    }

    /// Count system logs matching filters (for pagination).
    pub fn count_system_logs(
        &self,
        level_filter: Option<&str>,
        search_filter: Option<&str>,
        from_ts: Option<i64>,
        to_ts: Option<i64>,
    ) -> Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        // Build dynamic WHERE clause
        let mut conditions = Vec::new();
        let mut params_list: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(level) = level_filter {
            conditions.push(format!("level = ?{}", params_list.len() + 1));
            params_list.push(Box::new(level.to_string()));
        }
        if let Some(search) = search_filter {
            let pattern = format!("%{}%", search);
            conditions.push(format!(
                "(message LIKE ?{} OR target LIKE ?{})",
                params_list.len() + 1,
                params_list.len() + 2
            ));
            params_list.push(Box::new(pattern.clone()));
            params_list.push(Box::new(pattern));
        }
        if let Some(from) = from_ts {
            conditions.push(format!("timestamp >= ?{}", params_list.len() + 1));
            params_list.push(Box::new(from));
        }
        if let Some(to) = to_ts {
            conditions.push(format!("timestamp <= ?{}", params_list.len() + 1));
            params_list.push(Box::new(to));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!("SELECT COUNT(*) FROM system_logs {}", where_clause);

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_list.iter().map(|b| b.as_ref()).collect();

        let count: i64 = conn.query_row(&sql, params_refs.as_slice(), |row| row.get(0))?;
        Ok(count as usize)
    }

    /// Clean up old system logs based on retention policy.
    pub fn cleanup_system_logs(&self, retention_days: i64, max_rows: i64) -> Result<usize> {
        let cutoff_ts = chrono::Utc::now().timestamp() - (retention_days * 24 * 60 * 60);

        // First, delete logs older than retention period
        let deleted_old = self.execute(
            "DELETE FROM system_logs WHERE timestamp < ?1",
            params![cutoff_ts],
        )?;

        // Then, if still over max_rows, delete oldest entries
        let count = self.count_system_logs(None, None, None, None)?;
        let mut deleted_excess = 0;

        if count > max_rows as usize {
            let to_delete = count - max_rows as usize;
            deleted_excess = self.execute(
                "DELETE FROM system_logs WHERE id IN (
                    SELECT id FROM system_logs ORDER BY timestamp ASC LIMIT ?1
                )",
                params![to_delete as i64],
            )?;
        }

        let total_deleted = deleted_old + deleted_excess;
        if total_deleted > 0 {
            debug!(
                deleted = total_deleted,
                retention_days, max_rows, "system logs cleaned up"
            );
        }
        Ok(total_deleted)
    }
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = conn.prepare(&pragma)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut exists = false;
    for row in rows {
        if row? == column {
            exists = true;
            break;
        }
    }

    if !exists {
        let alter = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
        conn.execute(&alter, [])?;
    }

    Ok(())
}

/// System log entry for persisted logs.
#[derive(Debug)]
pub struct SystemLogEntry {
    pub id: i64,
    pub timestamp: u64,
    pub ts_rfc3339: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub fields_json: Option<String>,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::ModelCallTrace;
    use crate::models::ReasoningTextStatus;

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
                exchange_id: None,
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
            receipt_id: None,
            agent: "a".into(),
            session: Some("s1".into()),
            assistant_exchange_id: Some(42),
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
            prompt_snapshot: None,
            reasoning_text: Some("Captured provider reasoning".into()),
            reasoning_text_status: Some(ReasoningTextStatus::Captured),
        };
        let receipt_id = db.insert_receipt(&receipt).unwrap();
        db.insert_receipt_model_calls(
            receipt_id,
            receipt.session.as_deref(),
            &[ModelCallTrace {
                call_index: 1,
                provider: "openai".into(),
                model_id: "gpt-4o".into(),
                api_surface: Some("chat_completions".into()),
                request_kind: Some("chat_with_tools".into()),
                started_at: 100,
                latency_ms: 50,
                normalized_messages: vec![serde_json::json!({"role": "user", "content": "hello"})],
                normalized_tools: vec![serde_json::json!({"name": "read_file"})],
                reasoning_effort: Some("medium".into()),
                function_call_mode: Some("auto".into()),
                prompt_tokens: 10,
                completion_tokens: 5,
                cached_tokens: 0,
                reasoning_tokens: 2,
                cost_usd: Some(0.001),
                reasoning_text: None,
                reasoning_text_status: ReasoningTextStatus::ProviderDidNotExpose,
            }],
        )
        .unwrap();

        let list = db.list_receipts_for_session("s1").unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].receipt_id.is_some());
        assert_eq!(list[0].assistant_exchange_id, Some(42));
        assert_eq!(list[0].model_id, "gpt-4o");
        assert_eq!(
            list[0].reasoning_text.as_deref(),
            Some("Captured provider reasoning")
        );
        assert_eq!(
            list[0].reasoning_text_status,
            Some(ReasoningTextStatus::Captured)
        );
        let traces = db.get_receipt_model_calls("s1", receipt_id).unwrap();
        assert_eq!(traces.len(), 1);
        assert_eq!(traces[0].provider, "openai");
        assert_eq!(traces[0].normalized_tools.len(), 1);
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
            enabled: true,
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
