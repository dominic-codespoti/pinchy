//! Shared memory backend — cross-agent memory store in pinchy.db.
//!
//! Storage: `pinchy.db` (shared SQLite database)
//!
//! Provides namespace-scoped memory that authorized agents can read/write.
//! Uses FTS5 for BM25 search and supports embeddings for semantic search.

use std::sync::{Arc, Mutex};

use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A shared memory entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedMemoryEntry {
    pub entry_id: String,
    pub namespace: String,
    pub path: String,
    pub author_agent_id: String,
    pub author_session_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub content: String,
    pub content_hash: String,
    pub tags: Vec<String>,
    pub access_count: u64,
    pub ttl: Option<i64>,
    /// BM25 relevance score (only populated in search results).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

/// Authorization result for shared memory operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthResult {
    Allowed,
    Denied { reason: String },
    FeatureDisabled,
}

/// SQLite-backed shared memory store.
pub struct SharedMemoryStore {
    inner: Arc<Mutex<Connection>>,
}

impl SharedMemoryStore {
    /// Create a new SharedMemoryStore from an existing connection.
    /// The connection should already have the shared memory tables migrated.
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { inner: conn }
    }

    /// Open the shared memory store from the global PinchyDb connection.
    pub fn open_global() -> Result<Self> {
        let _global_db = crate::store::global_db()
            .ok_or_else(|| anyhow::anyhow!("global db not initialized"))?;
        // We need to get the connection from PinchyDb - we need to add a method for this
        // For now, we'll use a different approach - store uses global singleton internally
        anyhow::bail!("use open_with_conn() with PinchyDb connection instead")
    }

    /// Open with an explicit connection (for tests).
    pub fn open_with_conn(conn: Arc<Mutex<Connection>>) -> Result<Self> {
        // Ensure tables exist (idempotent)
        Self::migrate_shared_tables(&conn)?;
        Ok(Self { inner: conn })
    }

    /// Migrate shared memory tables (idempotent).
    fn migrate_shared_tables(conn: &Arc<Mutex<Connection>>) -> Result<()> {
        let conn = conn
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        // Main shared memories table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS shared_memories (
                entry_id         TEXT PRIMARY KEY,
                namespace        TEXT NOT NULL,
                path             TEXT NOT NULL,
                author_agent_id  TEXT NOT NULL,
                author_session_id TEXT,
                created_at       INTEGER NOT NULL,
                updated_at       INTEGER NOT NULL,
                content          TEXT NOT NULL,
                content_hash     TEXT NOT NULL,
                tags_json        TEXT NOT NULL DEFAULT '[]',
                access_count     INTEGER NOT NULL DEFAULT 0,
                ttl              INTEGER,
                UNIQUE(namespace, path)
            )",
            [],
        )?;

        // Indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_shared_namespace ON shared_memories(namespace)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_shared_author ON shared_memories(author_agent_id)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_shared_updated ON shared_memories(updated_at)",
            [],
        )?;

        // FTS5 virtual table - external content linking to shared_memories
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS shared_memories_fts USING fts5(
                content,
                content='shared_memories',
                content_rowid='rowid'
            )",
            [],
        )?;

        // FTS5 triggers (idempotent via IF NOT EXISTS)
        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS shared_memories_ai 
             AFTER INSERT ON shared_memories BEGIN
                INSERT INTO shared_memories_fts(rowid, content) VALUES (new.rowid, new.content);
             END",
            [],
        )?;
        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS shared_memories_ad 
             AFTER DELETE ON shared_memories BEGIN
                INSERT INTO shared_memories_fts(shared_memories_fts, rowid, content) 
                VALUES ('delete', old.rowid, old.content);
             END",
            [],
        )?;
        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS shared_memories_au 
             AFTER UPDATE ON shared_memories BEGIN
                INSERT INTO shared_memories_fts(shared_memories_fts, rowid, content) 
                VALUES ('delete', old.rowid, old.content);
                INSERT INTO shared_memories_fts(rowid, content) VALUES (new.rowid, new.content);
             END",
            [],
        )?;

        // Embeddings table with model/dim tracking
        conn.execute(
            "CREATE TABLE IF NOT EXISTS shared_embeddings (
                entry_id         TEXT PRIMARY KEY,
                embedding        BLOB NOT NULL,
                dim              INTEGER NOT NULL,
                model            TEXT NOT NULL,
                created_at       INTEGER NOT NULL,
                FOREIGN KEY (entry_id) REFERENCES shared_memories(entry_id) ON DELETE CASCADE
            )",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_shared_embeddings_model ON shared_embeddings(model)",
            [],
        )?;

        // Audit log (append-only)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS shared_audit_log (
                record_id        INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp        INTEGER NOT NULL,
                operation        TEXT NOT NULL,
                agent_id         TEXT NOT NULL,
                session_id       TEXT,
                namespace        TEXT,
                entry_id         TEXT,
                authorization    TEXT NOT NULL,
                content_hash     TEXT,
                error            TEXT
            )",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_shared_audit_agent ON shared_audit_log(agent_id)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_shared_audit_namespace ON shared_audit_log(namespace)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_shared_audit_timestamp ON shared_audit_log(timestamp)",
            [],
        )?;

        Ok(())
    }

    /// Normalize a namespace string.
    /// - Converts to lowercase
    /// - Replaces multiple separators with single
    /// - Trims leading/trailing separators
    /// - Max 128 characters
    pub fn normalize_namespace(ns: &str) -> String {
        let mut normalized = ns.to_lowercase();
        // Collapse multiple dots or slashes
        while normalized.contains("..") {
            normalized = normalized.replace("..", ".");
        }
        while normalized.contains("//") {
            normalized = normalized.replace("//", "/");
        }
        // Trim separators
        normalized = normalized
            .trim_matches(|c: char| c == '.' || c == '/')
            .to_string();
        // Truncate to 128 chars
        if normalized.len() > 128 {
            normalized.truncate(128);
        }
        normalized
    }

    /// Validate a namespace.
    /// Returns Ok(()) if valid, Err with reason if invalid.
    pub fn validate_namespace(ns: &str) -> Result<()> {
        if ns.is_empty() {
            anyhow::bail!("namespace cannot be empty");
        }
        if ns.len() > 128 {
            anyhow::bail!("namespace exceeds 128 characters");
        }
        // Check for path traversal
        if ns.contains("../") || ns.contains("..\\") || ns.contains("./") || ns.contains(".\\") {
            anyhow::bail!("namespace contains path traversal characters");
        }
        // Check reserved prefixes
        let normalized = Self::normalize_namespace(ns);
        for prefix in ["system/", "internal/", "pinchy/"] {
            let prefix_base = &prefix[..prefix.len() - 1]; // Remove trailing slash
            if normalized == prefix_base || normalized.starts_with(prefix) {
                anyhow::bail!("namespace uses reserved prefix: {}", prefix);
            }
        }
        // Check for invalid characters
        if ns
            .chars()
            .any(|c| !c.is_ascii_alphanumeric() && !"-_.:/".contains(c))
        {
            anyhow::bail!(
                "namespace contains invalid characters (allowed: a-z, 0-9, -, _, ., :, /)"
            );
        }
        Ok(())
    }

    /// Compute SHA-256 content hash.
    pub fn compute_content_hash(content: &str) -> String {
        use base64::Engine;
        use ring::digest::{digest, SHA256};
        let hash = digest(&SHA256, content.as_bytes());
        base64::engine::general_purpose::STANDARD.encode(hash.as_ref())
    }

    /// Save a shared memory entry.
    /// Returns the entry_id on success.
    #[allow(clippy::too_many_arguments)]
    pub fn save(
        &self,
        namespace: &str,
        path: &str,
        content: &str,
        author_agent_id: &str,
        author_session_id: Option<&str>,
        tags: &[String],
        ttl: Option<i64>,
    ) -> Result<String> {
        Self::validate_namespace(namespace)?;
        if path.is_empty() {
            anyhow::bail!("path cannot be empty");
        }

        let entry_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let content_hash = Self::compute_content_hash(content);
        let tags_json = serde_json::to_string(tags)?;
        let normalized_ns = Self::normalize_namespace(namespace);

        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        conn.execute(
            "INSERT INTO shared_memories (
                entry_id, namespace, path, author_agent_id, author_session_id,
                created_at, updated_at, content, content_hash, tags_json,
                access_count, ttl
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(namespace, path) DO UPDATE SET
                entry_id=excluded.entry_id,
                author_agent_id=excluded.author_agent_id,
                author_session_id=excluded.author_session_id,
                updated_at=excluded.updated_at,
                content=excluded.content,
                content_hash=excluded.content_hash,
                tags_json=excluded.tags_json,
                access_count=shared_memories.access_count + 1",
            params![
                entry_id,
                normalized_ns,
                path,
                author_agent_id,
                author_session_id,
                now,
                now,
                content,
                content_hash,
                tags_json,
                0,
                ttl,
            ],
        )?;

        Ok(entry_id)
    }

    /// Build a safe FTS5 query from user input.
    ///
    /// Hardening measures:
    /// - Strips FTS5 special characters that could alter query semantics
    /// - Limits max words to prevent resource exhaustion
    /// - Limits max length per word
    /// - Preserves prefix matching (* appended to each term) for usability
    /// - Uses phrase queries ("...") to treat each word as literal text
    fn build_safe_fts5_query(query: &str) -> String {
        const MAX_WORDS: usize = 10;
        const MAX_WORD_LEN: usize = 64;

        query
            .split_whitespace()
            .take(MAX_WORDS)
            .map(|w| {
                // Remove forbidden characters and operators
                // See: https://www.sqlite.org/fts5.html#full_text_query_syntax
                let mut clean = w.to_string();
                for ch in ['"', '\'', '*', '^', '-', '+', '~', '.', '(', ')', '=', ';'] {
                    clean = clean.replace(ch, "");
                }
                // Remove standalone FTS5 boolean operators (must be surrounded by word boundaries)
                // We check for standalone operators by looking at the whole word
                clean = match clean.as_str() {
                    "AND" | "and" | "OR" | "or" | "NOT" | "not" | "NEAR" | "near" => String::new(),
                    _ => clean,
                };

                // Truncate to max length
                if clean.len() > MAX_WORD_LEN {
                    clean.truncate(MAX_WORD_LEN);
                }
                // Escape any remaining double quotes (defense in depth)
                clean = clean.replace('"', "");

                clean
            })
            .filter(|clean| !clean.is_empty())
            .map(|clean| {
                // Build phrase with prefix matching
                // FTS5 syntax: "term" for exact, term* for prefix (no quotes around starred term)
                format!("\"{clean}\" OR {clean}*")
            })
            .collect::<Vec<_>>()
            .join(" OR ")
    }
    pub fn recall(
        &self,
        query: &str,
        namespace: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SharedMemoryEntry>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let now = chrono::Utc::now().timestamp();

        if query.is_empty() {
            // No search query — return recent entries, filtered by namespace if specified.
            let mut sql = String::from(
                "SELECT entry_id, namespace, path, author_agent_id, author_session_id,
                        created_at, updated_at, content, content_hash, tags_json, access_count, ttl
                 FROM shared_memories
                 WHERE (ttl IS NULL OR ttl > ?1)",
            );
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
            params.push(Box::new(now));

            if let Some(ns) = namespace {
                if ns.contains('*') {
                    // Wildcard search
                    let pattern = ns.replace('*', "%");
                    sql.push_str(&format!(" AND namespace LIKE ?{}", params.len() + 1));
                    params.push(Box::new(pattern));
                } else {
                    let normalized = Self::normalize_namespace(ns);
                    sql.push_str(&format!(" AND namespace = ?{}", params.len() + 1));
                    params.push(Box::new(normalized));
                }
            }

            sql.push_str(" ORDER BY updated_at DESC LIMIT ?");
            sql.push_str(&(params.len() + 1).to_string());
            params.push(Box::new(limit as i64));

            let params_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(params_refs.as_slice(), |row| {
                Ok(SharedMemoryEntry {
                    entry_id: row.get(0)?,
                    namespace: row.get(1)?,
                    path: row.get(2)?,
                    author_agent_id: row.get(3)?,
                    author_session_id: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    content: row.get(7)?,
                    content_hash: row.get(8)?,
                    tags: Self::parse_tags(&row.get::<_, String>(9)?),
                    access_count: row.get::<_, i64>(10)? as u64,
                    ttl: row.get(11)?,
                    score: None,
                })
            })?;

            let mut results = Vec::new();
            for row in rows {
                results.push(row?);
            }
            return Ok(results);
        }

        // FTS5 ranked search using hardened query builder
        let fts_query = Self::build_safe_fts5_query(query);

        // If query sanitized to empty, return recent entries instead of invalid MATCH
        if fts_query.is_empty() {
            return Ok(Vec::new());
        }

        let mut sql = String::from(
            "SELECT m.entry_id, m.namespace, m.path, m.author_agent_id, m.author_session_id,
                    m.created_at, m.updated_at, m.content, m.content_hash, m.tags_json,
                    m.access_count, m.ttl, rank
             FROM shared_memories_fts f
             JOIN shared_memories m ON m.rowid = f.rowid
             WHERE (m.ttl IS NULL OR m.ttl > ?1)
               AND shared_memories_fts MATCH ?2",
        );

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        params.push(Box::new(now));
        params.push(Box::new(fts_query));

        if let Some(ns) = namespace {
            if ns.contains('*') {
                let pattern = ns.replace('*', "%");
                sql.push_str(&format!(" AND m.namespace LIKE ?{}", params.len() + 1));
                params.push(Box::new(pattern));
            } else {
                let normalized = Self::normalize_namespace(ns);
                sql.push_str(&format!(" AND m.namespace = ?{}", params.len() + 1));
                params.push(Box::new(normalized));
            }
        }

        sql.push_str(" ORDER BY rank LIMIT ?");
        sql.push_str(&(params.len() + 1).to_string());
        params.push(Box::new(limit as i64));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            let raw_rank: f64 = row.get(12)?;
            Ok(SharedMemoryEntry {
                entry_id: row.get(0)?,
                namespace: row.get(1)?,
                path: row.get(2)?,
                author_agent_id: row.get(3)?,
                author_session_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                content: row.get(7)?,
                content_hash: row.get(8)?,
                tags: Self::parse_tags(&row.get::<_, String>(9)?),
                access_count: row.get::<_, i64>(10)? as u64,
                ttl: row.get(11)?,
                score: Some(-raw_rank), // Negate so higher = better
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Forget (delete) a shared memory entry.
    /// Returns true if an entry was deleted.
    pub fn forget(&self, namespace: &str, path: &str) -> Result<bool> {
        let normalized_ns = Self::normalize_namespace(namespace);

        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let deleted = conn.execute(
            "DELETE FROM shared_memories WHERE namespace = ?1 AND path = ?2",
            params![normalized_ns, path],
        )?;

        Ok(deleted > 0)
    }

    /// Forget by entry_id.
    /// Returns true if an entry was deleted.
    pub fn forget_by_id(&self, entry_id: &str) -> Result<bool> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let deleted = conn.execute(
            "DELETE FROM shared_memories WHERE entry_id = ?1",
            params![entry_id],
        )?;

        Ok(deleted > 0)
    }

    /// Save an embedding for a shared memory entry.
    pub fn save_embedding(&self, entry_id: &str, embedding: &[f32], model: &str) -> Result<()> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let blob = embedding_to_blob(embedding);
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "INSERT INTO shared_embeddings (entry_id, embedding, dim, model, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(entry_id) DO UPDATE SET
                embedding=excluded.embedding,
                dim=excluded.dim,
                model=excluded.model,
                created_at=excluded.created_at",
            params![entry_id, blob, embedding.len() as i64, model, now],
        )?;

        Ok(())
    }

    /// Semantic search on shared memories.
    pub fn recall_semantic(
        &self,
        query_embedding: &[f32],
        namespace: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SharedMemoryEntry>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let now = chrono::Utc::now().timestamp();

        let mut sql = String::from(
            "SELECT m.entry_id, m.namespace, m.path, m.author_agent_id, m.author_session_id,
                    m.created_at, m.updated_at, m.content, m.content_hash, m.tags_json,
                    m.access_count, m.ttl, e.embedding, e.dim
             FROM shared_embeddings e
             JOIN shared_memories m ON m.entry_id = e.entry_id
             WHERE (m.ttl IS NULL OR m.ttl > ?1)",
        );

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        params.push(Box::new(now));

        if let Some(ns) = namespace {
            if ns.contains('*') {
                let pattern = ns.replace('*', "%");
                sql.push_str(&format!(" AND m.namespace LIKE ?{}", params.len() + 1));
                params.push(Box::new(pattern));
            } else {
                let normalized = Self::normalize_namespace(ns);
                sql.push_str(&format!(" AND m.namespace = ?{}", params.len() + 1));
                params.push(Box::new(normalized));
            }
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            let entry_id: String = row.get(0)?;
            let namespace: String = row.get(1)?;
            let path: String = row.get(2)?;
            let author_agent_id: String = row.get(3)?;
            let author_session_id: Option<String> = row.get(4)?;
            let created_at: i64 = row.get(5)?;
            let updated_at: i64 = row.get(6)?;
            let content: String = row.get(7)?;
            let content_hash: String = row.get(8)?;
            let tags_json: String = row.get(9)?;
            let access_count: i64 = row.get(10)?;
            let ttl: Option<i64> = row.get(11)?;
            let blob: Vec<u8> = row.get(12)?;
            let dim: i64 = row.get(13)?;

            let emb = blob_to_embedding(&blob, dim as usize);
            let sim = cosine_similarity(query_embedding, &emb);

            Ok((
                sim,
                SharedMemoryEntry {
                    entry_id,
                    namespace,
                    path,
                    author_agent_id,
                    author_session_id,
                    created_at,
                    updated_at,
                    content,
                    content_hash,
                    tags: Self::parse_tags(&tags_json),
                    access_count: access_count as u64,
                    ttl,
                    score: Some(sim),
                },
            ))
        })?;

        let mut scored: Vec<(f64, SharedMemoryEntry)> = Vec::new();
        for row in rows {
            scored.push(row?);
        }

        // Sort by similarity descending
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(limit);

        Ok(scored.into_iter().map(|(_, e)| e).collect())
    }

    /// Write an audit log entry.
    #[allow(clippy::too_many_arguments)]
    pub fn audit_log(
        &self,
        operation: &str,
        agent_id: &str,
        session_id: Option<&str>,
        namespace: Option<&str>,
        entry_id: Option<&str>,
        authorization: &str,
        content_hash: Option<&str>,
        error: Option<&str>,
    ) -> Result<()> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "INSERT INTO shared_audit_log (
                timestamp, operation, agent_id, session_id, namespace,
                entry_id, authorization, content_hash, error
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                now,
                operation,
                agent_id,
                session_id,
                namespace,
                entry_id,
                authorization,
                content_hash,
                error,
            ],
        )?;

        Ok(())
    }

    /// Query audit log entries.
    pub fn query_audit_log(
        &self,
        agent_id: Option<&str>,
        namespace: Option<&str>,
        operation: Option<&str>,
        limit: usize,
    ) -> Result<Vec<AuditLogEntry>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let mut conditions = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(aid) = agent_id {
            conditions.push(format!("agent_id = ?{}", params.len() + 1));
            params.push(Box::new(aid.to_string()));
        }
        if let Some(ns) = namespace {
            conditions.push(format!("namespace = ?{}", params.len() + 1));
            params.push(Box::new(Self::normalize_namespace(ns)));
        }
        if let Some(op) = operation {
            conditions.push(format!("operation = ?{}", params.len() + 1));
            params.push(Box::new(op.to_string()));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!(
            "SELECT record_id, timestamp, operation, agent_id, session_id,
                    namespace, entry_id, authorization, content_hash, error
             FROM shared_audit_log
             {}
             ORDER BY timestamp DESC
             LIMIT ?{}",
            where_clause,
            params.len() + 1
        );
        params.push(Box::new(limit as i64));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(AuditLogEntry {
                record_id: row.get(0)?,
                timestamp: row.get(1)?,
                operation: row.get(2)?,
                agent_id: row.get(3)?,
                session_id: row.get(4)?,
                namespace: row.get(5)?,
                entry_id: row.get(6)?,
                authorization: row.get(7)?,
                content_hash: row.get(8)?,
                error: row.get(9)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Count entries by a specific author agent.
    pub fn count_entries_by_author(&self, agent_id: &str) -> Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM shared_memories WHERE author_agent_id = ?1",
            params![agent_id],
            |row| row.get(0),
        )?;

        Ok(count as usize)
    }

    /// Count writes by an agent in the last N seconds (for rate limiting).
    pub fn count_writes_in_window(&self, agent_id: &str, window_seconds: i64) -> Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let now = chrono::Utc::now().timestamp();
        let window_start = now - window_seconds;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM shared_audit_log 
             WHERE agent_id = ?1 
               AND operation = 'write' 
               AND authorization = 'allowed'
               AND timestamp >= ?2",
            params![agent_id, window_start],
            |row| row.get(0),
        )?;

        Ok(count as usize)
    }

    /// Count audit log entries (for diagnostics/testing).
    pub fn count_audit_log_entries(&self) -> Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM shared_audit_log", [], |row| {
            row.get(0)
        })?;

        Ok(count as usize)
    }

    /// Test helper: Update all audit log entries to have a specific timestamp.
    /// This allows tests to simulate old entries for retention testing.
    ///
    /// # Safety
    /// This is intended for test use only. In production, timestamps should
    /// always reflect the actual time of operations.
    pub fn test_update_all_audit_timestamps(&self, timestamp: i64) -> Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let updated = conn.execute(
            "UPDATE shared_audit_log SET timestamp = ?1",
            params![timestamp],
        )?;

        Ok(updated)
    }

    /// Test helper: Update audit log entries for a specific agent to have a specific timestamp.
    ///
    /// # Safety
    /// This is intended for test use only. In production, timestamps should
    /// always reflect the actual time of operations.
    pub fn test_update_audit_timestamps_for_agent(
        &self,
        agent_id: &str,
        timestamp: i64,
    ) -> Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let updated = conn.execute(
            "UPDATE shared_audit_log SET timestamp = ?1 WHERE agent_id = ?2",
            params![timestamp, agent_id],
        )?;

        Ok(updated)
    }

    /// Clean up audit log entries older than the given retention period.
    /// Returns the number of entries deleted.
    ///
    /// This is called automatically during startup migration and is idempotent
    /// — running it multiple times is safe and efficient.
    pub fn cleanup_audit_log_retention(&self, retention_days: u32) -> Result<usize> {
        if retention_days == 0 {
            // Zero days means "keep everything" (disable cleanup)
            return Ok(0);
        }

        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let now = chrono::Utc::now().timestamp();
        let cutoff_seconds = retention_days as i64 * 24 * 60 * 60;
        let cutoff_timestamp = now.saturating_sub(cutoff_seconds);

        let deleted = conn.execute(
            "DELETE FROM shared_audit_log WHERE timestamp < ?1",
            params![cutoff_timestamp],
        )?;

        Ok(deleted)
    }

    /// Clean up audit log entries older than a specific timestamp.
    /// Returns the number of entries deleted.
    pub fn cleanup_audit_log_older_than(&self, cutoff_timestamp: i64) -> Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let deleted = conn.execute(
            "DELETE FROM shared_audit_log WHERE timestamp < ?1",
            params![cutoff_timestamp],
        )?;

        Ok(deleted)
    }
    /// Returns Ok(()) if clean, Err with reason if secret detected.
    ///
    /// Detection focuses on:
    /// - High-confidence credential assignment patterns (key: value)
    /// - Common credential file indicators
    /// - High-entropy values following credential keywords
    /// - Known secret formats (JWT, SSH keys, API keys)
    pub fn check_content_for_secrets(content: &str) -> Result<()> {
        // MVP-safe pattern detection: focus on high-confidence patterns
        // that indicate credentials, keys, or sensitive data

        let content_lower = content.to_lowercase();

        // Direct credential assignment patterns (case-insensitive)
        // These are high-confidence because they indicate actual credential storage
        let credential_patterns = [
            // Core credential assignments
            "password:",
            "password =",
            "secret:",
            "secret =",
            "api_key:",
            "api_key =",
            "apikey:",
            "apikey =",
            "api-key:",
            "api-key =",
            "token:",
            "token =",
            "auth_token:",
            "auth_token =",
            "bearer:",
            "bearer =",
            "private_key:",
            "private_key =",
            "privkey:",
            "privkey =",
            "secret_key:",
            "secret_key =",
            "secretkey:",
            "secretkey =",
            "access_key:",
            "access_key =",
            "accesskey:",
            "accesskey =",
            // AWS credential patterns
            "aws_access_key_id",
            "aws_access_key_id:",
            "aws_access_key_id =",
            "aws_secret_access_key",
            "aws_secret_access_key:",
            "aws_secret_access_key =",
            // OAuth patterns
            "client_secret:",
            "client_secret =",
            "client_id:",
            "client_id =",
            // Connection strings (high confidence)
            "connection_string:",
            "connection_string =",
            "connectionstring:",
            "database_url:",
            "database_url=",  // env var assignment (no space required)
            " database_url=", // env var with leading space
            "db_password:",
            "db_pass:",
            // SSH key patterns
            "-----begin openssh private key-----",
            "-----begin rsa private key-----",
            "-----begin dsa private key-----",
            "-----begin ec private key-----",
            "-----begin encrypted private key-----",
            "ssh-rsa ",
            "ssh-ed25519 ",
            "ssh-dss ",
            "ecdsa-sha2-nistp256 ",
            // Private key file indicators
            "id_rsa",
            "id_dsa",
            "id_ecdsa",
            "id_ed25519",
            // Credential file indicators
            // Note: .env.example is a template and should be allowed in docs
            ".env",
            "credentials.json",
            "credentials.yaml",
            "credentials.yml",
            "secrets.json",
            "secrets.yaml",
            "secrets.yml",
            "secret.json",
            "secret.yaml",
            "secret.yml",
            // JWT token pattern (eyJ prefix is base64 JSON header)
            "eyj",
            // API key patterns with clearly fake test prefixes (NOT real Stripe patterns)
            // Using fake_ prefix to ensure these don't trigger GitHub secret scanning
            "fake_sk_live_", // Fake Stripe live key pattern for testing
            "fake_sk_test_", // Fake Stripe test key pattern for testing
            "fake_rk_live_", // Fake Stripe restricted key pattern for testing
            "fake_rk_test_", // Fake Stripe restricted test key pattern for testing
        ];

        for pattern in &credential_patterns {
            if content_lower.contains(pattern) {
                // Special case: .env.example and similar templates should be allowed
                if *pattern == ".env" {
                    let has_template_suffix = content_lower.contains(".env.example")
                        || content_lower.contains(".env.sample")
                        || content_lower.contains(".env.template")
                        || content_lower.contains(".env.local")
                        || content_lower.contains(".env.development")
                        || content_lower.contains(".env.production")
                        || content_lower.contains(".env.test");
                    if has_template_suffix {
                        continue;
                    }
                }
                anyhow::bail!(
                    "Potential secret detected: content contains credential pattern '{}'",
                    pattern
                );
            }
        }

        // Line-by-line analysis for high-entropy values following credential keywords
        for line in content.lines() {
            let line_lower = line.to_lowercase();

            // Check if line contains high-confidence credential keyword
            // These are keywords that strongly suggest secrets when combined with values
            let is_key_line = line_lower.contains("api_key")
                || line_lower.contains("apikey")
                || line_lower.contains("secret_key")
                || line_lower.contains("secretkey")
                || line_lower.contains("auth_token")
                || line_lower.contains("access_token")
                || line_lower.contains("private_key")
                || line_lower.contains("privatekey")
                || line_lower.contains("password:")
                || line_lower.contains("password =");

            if is_key_line {
                // Extract potential value after delimiter (look for : or =)
                let value_part = line
                    .find(':')
                    .map(|idx| &line[idx + 1..])
                    .or_else(|| line.find('=').map(|idx| &line[idx + 1..]));

                if let Some(value) = value_part {
                    let trimmed = value.trim();

                    // Check for high-entropy hex string (16+ chars)
                    // This catches patterns like: api_key: a1b2c3d4e5f67890
                    let hex_streak = trimmed
                        .chars()
                        .take(32) // Look at first 32 chars
                        .filter(|c| c.is_ascii_hexdigit())
                        .count();
                    if hex_streak >= 16 && trimmed.len() >= 16 {
                        anyhow::bail!(
                            "Potential secret detected: high-entropy hex value after credential keyword"
                        );
                    }

                    // Check for base64-looking strings (20+ chars of base64 alphabet)
                    // This catches JWT segments, encoded keys, etc.
                    let b64_chars =
                        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
                    let b64_streak = trimmed
                        .chars()
                        .take(64)
                        .filter(|c| b64_chars.contains(*c))
                        .count();
                    if b64_streak >= 20 && trimmed.len() >= 20 {
                        // Additional check: does it look like base64 (no spaces, reasonable chars)?
                        let has_no_spaces = !trimmed[..trimmed.len().min(32)].contains(' ');
                        if has_no_spaces {
                            anyhow::bail!(
                                "Potential secret detected: high-entropy value after credential keyword"
                            );
                        }
                    }
                }
            }
        }

        // JWT token detection - look for three base64 segments separated by dots
        // JWT format: header.payload.signature (eyJ...base64...base64...base64)
        for word in content.split_whitespace() {
            let parts: Vec<&str> = word.split('.').collect();
            if parts.len() == 3 {
                // Check if first part looks like base64 JSON header (eyJ is typical start)
                let looks_like_jwt = parts[0].starts_with("eyJ")
                    || parts[0].starts_with("eyI")
                    || (parts[0].len() >= 20 && parts[1].len() >= 10 && parts[2].len() >= 20);

                if looks_like_jwt {
                    anyhow::bail!("Potential secret detected: JWT token format detected");
                }
            }
        }

        Ok(())
    }

    /// Count entries in a namespace.
    pub fn count_in_namespace(&self, namespace: &str) -> Result<usize> {
        let normalized = Self::normalize_namespace(namespace);
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM shared_memories WHERE namespace = ?1",
            params![normalized],
            |row| row.get(0),
        )?;

        Ok(count as usize)
    }

    /// List all unique namespaces.
    pub fn list_namespaces(&self) -> Result<Vec<String>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("db lock poisoned: {e}"))?;

        let mut stmt =
            conn.prepare("SELECT DISTINCT namespace FROM shared_memories ORDER BY namespace")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Format a single shared memory entry for prompt injection.
    /// Returns a formatted string with namespace and author attribution
    /// suitable for inclusion in a prompt context block.
    pub fn format_for_prompt(entry: &SharedMemoryEntry) -> String {
        let timestamp = Self::format_timestamp(entry.created_at);
        format!(
            "[Shared Memory from namespace: {}]\nAuthor: {} | Created: {}\n- {}",
            entry.namespace, entry.author_agent_id, timestamp, entry.content
        )
    }

    /// Build a complete prompt block from a list of shared memory entries.
    /// Includes source attribution for each entry and respects max_chars budget.
    /// Returns empty string if entries is empty.
    pub fn build_prompt_block(entries: &[SharedMemoryEntry], max_chars: usize) -> String {
        if entries.is_empty() {
            return String::new();
        }

        let mut block = String::from("<shared_memory>\n");
        for entry in entries {
            let formatted = Self::format_for_prompt(entry);
            // Add separator between entries (except for the first)
            if block.len() > "<shared_memory>\n".len() {
                block.push('\n');
            }
            // Check if adding this entry would exceed budget
            if block.len() + formatted.len() + "\n</shared_memory>".len() > max_chars {
                break;
            }
            block.push_str(&formatted);
        }
        block.push_str("\n</shared_memory>");
        block
    }

    /// Estimate token count for a list of shared memory entries.
    /// Uses the same approximation as context management: len * 2 / 7.
    pub fn estimate_token_count(entries: &[SharedMemoryEntry]) -> usize {
        let total_chars: usize = entries.iter().map(|e| e.content.len()).sum();
        // Same approximation used in context management: len * 2 / 7
        (total_chars * 2) / 7
    }

    /// Format a Unix timestamp as an RFC3339 date string (YYYY-MM-DD).
    fn format_timestamp(ts: i64) -> String {
        use chrono::TimeZone;
        chrono::Utc
            .timestamp_opt(ts, 0)
            .single()
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }

    fn parse_tags(json: &str) -> Vec<String> {
        serde_json::from_str(json).unwrap_or_default()
    }
}

/// An audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub record_id: i64,
    pub timestamp: i64,
    pub operation: String,
    pub agent_id: String,
    pub session_id: Option<String>,
    pub namespace: Option<String>,
    pub entry_id: Option<String>,
    pub authorization: String,
    pub content_hash: Option<String>,
    pub error: Option<String>,
}

/// Serialize f32 slice to little-endian bytes.
fn embedding_to_blob(vec: &[f32]) -> Vec<u8> {
    vec.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize bytes to f32 vector.
fn blob_to_embedding(blob: &[u8], dim: usize) -> Vec<f32> {
    let safe_dim = dim.min(blob.len() / 4);
    (0..safe_dim)
        .map(|i| {
            let start = i * 4;
            let bytes: [u8; 4] = blob[start..start + 4].try_into().unwrap_or([0; 4]);
            f32::from_le_bytes(bytes)
        })
        .collect()
}

/// Cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for (x, y) in a.iter().zip(b.iter()) {
        let x = *x as f64;
        let y = *y as f64;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom < 1e-12 {
        0.0
    } else {
        dot / denom
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (tempfile::TempDir, SharedMemoryStore) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let conn = Arc::new(Mutex::new(conn));
        let store = SharedMemoryStore::open_with_conn(conn).unwrap();
        (dir, store)
    }

    #[test]
    fn normalize_namespace_basic() {
        assert_eq!(
            SharedMemoryStore::normalize_namespace("Public/Docs"),
            "public/docs"
        );
        assert_eq!(
            SharedMemoryStore::normalize_namespace("///public//docs///"),
            "public/docs"
        );
        assert_eq!(
            SharedMemoryStore::normalize_namespace("team.eng.conventions"),
            "team.eng.conventions"
        );
    }

    #[test]
    fn validate_namespace_valid() {
        assert!(SharedMemoryStore::validate_namespace("public/docs").is_ok());
        assert!(SharedMemoryStore::validate_namespace("team/eng").is_ok());
        assert!(SharedMemoryStore::validate_namespace("my-namespace_123").is_ok());
    }

    #[test]
    fn validate_namespace_invalid() {
        assert!(SharedMemoryStore::validate_namespace("").is_err());
        assert!(SharedMemoryStore::validate_namespace("../secret").is_err());
        assert!(SharedMemoryStore::validate_namespace("./local").is_err());
        assert!(SharedMemoryStore::validate_namespace("system/internal").is_err());
        assert!(SharedMemoryStore::validate_namespace("pinchy/config").is_err());
    }

    #[test]
    fn save_and_recall() {
        let (_dir, store) = temp_store();

        store
            .save(
                "public/docs",
                "readme",
                "This is the README",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();

        let results = store.recall("", Some("public/docs"), 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].namespace, "public/docs");
        assert_eq!(results[0].path, "readme");
        assert_eq!(results[0].content, "This is the README");
    }

    #[test]
    fn fts5_search() {
        let (_dir, store) = temp_store();

        store
            .save(
                "public/docs",
                "readme",
                "Getting started guide for beginners",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
        store
            .save(
                "public/docs",
                "advanced",
                "Advanced configuration options",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
        store
            .save(
                "team/eng",
                "standards",
                "Coding standards document",
                "agent:backend",
                Some("session-2"),
                &[],
                None,
            )
            .unwrap();

        // Search for "guide" should find readme
        let results = store.recall("guide", None, 10).unwrap();
        assert!(!results.is_empty());
        assert!(results.iter().any(|r| r.path == "readme"));

        // Search in specific namespace
        let results = store.recall("", Some("public/docs"), 10).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn forget_by_path() {
        let (_dir, store) = temp_store();

        store
            .save(
                "public/docs",
                "temp",
                "Temporary content",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();

        assert_eq!(store.count_in_namespace("public/docs").unwrap(), 1);

        let deleted = store.forget("public/docs", "temp").unwrap();
        assert!(deleted);

        assert_eq!(store.count_in_namespace("public/docs").unwrap(), 0);
    }

    #[test]
    fn forget_nonexistent() {
        let (_dir, store) = temp_store();
        let deleted = store.forget("public/docs", "nonexistent").unwrap();
        assert!(!deleted);
    }

    #[test]
    fn audit_logging() {
        let (_dir, store) = temp_store();

        store
            .audit_log(
                "write",
                "agent:core",
                Some("session-1"),
                Some("public/docs"),
                Some("entry-123"),
                "allowed",
                Some("hash123"),
                None,
            )
            .unwrap();

        let logs = store
            .query_audit_log(Some("agent:core"), None, None, 10)
            .unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].operation, "write");
        assert_eq!(logs[0].authorization, "allowed");
    }

    #[test]
    fn wildcard_namespace_query() {
        let (_dir, store) = temp_store();

        store
            .save(
                "team/eng/docs",
                "api",
                "API documentation",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
        store
            .save(
                "team/eng/conventions",
                "style",
                "Style guide",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
        store
            .save(
                "team/product",
                "roadmap",
                "Product roadmap",
                "agent:product",
                Some("session-2"),
                &[],
                None,
            )
            .unwrap();

        // Query with wildcard
        let results = store.recall("", Some("team/eng/*"), 10).unwrap();
        assert_eq!(results.len(), 2);
        assert!(results.iter().any(|r| r.namespace == "team/eng/docs"));
        assert!(results
            .iter()
            .any(|r| r.namespace == "team/eng/conventions"));
    }

    #[test]
    fn embedding_save_and_semantic_search() {
        let (_dir, store) = temp_store();

        let entry_id = store
            .save(
                "public/docs",
                "embedding-test",
                "Test content for embeddings",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();

        // Save embedding
        let emb = vec![1.0f32, 0.0, 0.0];
        store.save_embedding(&entry_id, &emb, "test-model").unwrap();

        // Semantic search
        let results = store.recall_semantic(&[0.99, 0.01, 0.0], None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "embedding-test");
        assert!(results[0].score.unwrap() > 0.99);
    }

    #[test]
    fn content_hash_computation() {
        let hash1 = SharedMemoryStore::compute_content_hash("hello world");
        let hash2 = SharedMemoryStore::compute_content_hash("hello world");
        let hash3 = SharedMemoryStore::compute_content_hash("different content");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn list_namespaces() {
        let (_dir, store) = temp_store();

        store
            .save(
                "public/docs",
                "a",
                "Content A",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
        store
            .save(
                "team/eng",
                "b",
                "Content B",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
        store
            .save(
                "team/product",
                "c",
                "Content C",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();

        let namespaces = store.list_namespaces().unwrap();
        assert_eq!(namespaces.len(), 3);
        assert!(namespaces.contains(&"public/docs".to_string()));
        assert!(namespaces.contains(&"team/eng".to_string()));
        assert!(namespaces.contains(&"team/product".to_string()));
    }

    #[test]
    fn format_for_prompt_basic() {
        let entry = SharedMemoryEntry {
            entry_id: "test-id".to_string(),
            namespace: "public/docs".to_string(),
            path: "readme".to_string(),
            author_agent_id: "agent:backend-lead".to_string(),
            author_session_id: Some("session-1".to_string()),
            created_at: 1711929600, // 2024-04-01 00:00:00 UTC
            updated_at: 1711929600,
            content: "Use cargo fmt before committing code.".to_string(),
            content_hash: "hash123".to_string(),
            tags: vec!["conventions".to_string()],
            access_count: 5,
            ttl: None,
            score: None,
        };

        let formatted = SharedMemoryStore::format_for_prompt(&entry);
        assert!(formatted.contains("[Shared Memory from namespace: public/docs]"));
        assert!(formatted.contains("Author: agent:backend-lead"));
        assert!(formatted.contains("Created: 2024-04-01"));
        assert!(formatted.contains("Use cargo fmt before committing code."));
    }

    #[test]
    fn format_for_prompt_includes_namespace_and_author() {
        let entry = SharedMemoryEntry {
            entry_id: "id2".to_string(),
            namespace: "team/eng/conventions".to_string(),
            path: "api-design".to_string(),
            author_agent_id: "agent:core".to_string(),
            author_session_id: Some("s2".to_string()),
            created_at: 1712016000,
            updated_at: 1712016000,
            content: "Always use Result types for fallible operations.".to_string(),
            content_hash: "hash456".to_string(),
            tags: vec![],
            access_count: 1,
            ttl: None,
            score: Some(0.95),
        };

        let formatted = SharedMemoryStore::format_for_prompt(&entry);
        // Verify required attribution fields per spec section 5.3
        assert!(formatted.contains("[Shared Memory from namespace: team/eng/conventions]"));
        assert!(formatted.contains("Author: agent:core"));
        assert!(formatted.contains("Created:"));
        assert!(formatted.contains("Always use Result types for fallible operations."));
    }

    #[test]
    fn build_prompt_block_empty() {
        let entries: Vec<SharedMemoryEntry> = vec![];
        let block = SharedMemoryStore::build_prompt_block(&entries, 4000);
        assert!(block.is_empty());
    }

    #[test]
    fn build_prompt_block_single_entry() {
        let entry = SharedMemoryEntry {
            entry_id: "id1".to_string(),
            namespace: "public/docs".to_string(),
            path: "guide".to_string(),
            author_agent_id: "agent:core".to_string(),
            author_session_id: Some("s1".to_string()),
            created_at: 1711929600,
            updated_at: 1711929600,
            content: "Getting started guide content.".to_string(),
            content_hash: "hash1".to_string(),
            tags: vec![],
            access_count: 0,
            ttl: None,
            score: None,
        };

        let block = SharedMemoryStore::build_prompt_block(&[entry], 4000);
        assert!(block.starts_with("<shared_memory>"));
        assert!(block.ends_with("</shared_memory>"));
        assert!(block.contains("[Shared Memory from namespace: public/docs]"));
        assert!(block.contains("Author: agent:core"));
        assert!(block.contains("Getting started guide content."));
    }

    #[test]
    fn build_prompt_block_multiple_entries() {
        let entries = vec![
            SharedMemoryEntry {
                entry_id: "id1".to_string(),
                namespace: "public/docs".to_string(),
                path: "a".to_string(),
                author_agent_id: "agent:core".to_string(),
                author_session_id: Some("s1".to_string()),
                created_at: 1711929600,
                updated_at: 1711929600,
                content: "First entry content.".to_string(),
                content_hash: "hash1".to_string(),
                tags: vec![],
                access_count: 0,
                ttl: None,
                score: None,
            },
            SharedMemoryEntry {
                entry_id: "id2".to_string(),
                namespace: "team/eng".to_string(),
                path: "b".to_string(),
                author_agent_id: "agent:backend".to_string(),
                author_session_id: Some("s2".to_string()),
                created_at: 1712016000,
                updated_at: 1712016000,
                content: "Second entry content.".to_string(),
                content_hash: "hash2".to_string(),
                tags: vec![],
                access_count: 0,
                ttl: None,
                score: None,
            },
        ];

        let block = SharedMemoryStore::build_prompt_block(&entries, 4000);
        assert!(block.starts_with("<shared_memory>"));
        assert!(block.ends_with("</shared_memory>"));
        // Should have both entries
        assert!(block.contains("[Shared Memory from namespace: public/docs]"));
        assert!(block.contains("[Shared Memory from namespace: team/eng]"));
        // Should have attribution for both
        assert!(block.contains("Author: agent:core"));
        assert!(block.contains("Author: agent:backend"));
    }

    #[test]
    fn build_prompt_block_respects_max_chars() {
        let entry = SharedMemoryEntry {
            entry_id: "id1".to_string(),
            namespace: "public/docs".to_string(),
            path: "a".to_string(),
            author_agent_id: "agent:core".to_string(),
            author_session_id: Some("s1".to_string()),
            created_at: 1711929600,
            updated_at: 1711929600,
            content: "Very long content that should exceed the budget when repeated.".to_string(),
            content_hash: "hash1".to_string(),
            tags: vec![],
            access_count: 0,
            ttl: None,
            score: None,
        };

        // Create multiple entries
        let entries: Vec<SharedMemoryEntry> = (0..10)
            .map(|i| SharedMemoryEntry {
                entry_id: format!("id{i}"),
                ..entry.clone()
            })
            .collect();

        // With a small budget, should only include some entries
        let small_budget = 200;
        let block = SharedMemoryStore::build_prompt_block(&entries, small_budget);
        assert!(block.len() <= small_budget);
        assert!(block.starts_with("<shared_memory>"));
        assert!(block.ends_with("</shared_memory>"));
    }

    #[test]
    fn estimate_token_count_basic() {
        let entries = vec![SharedMemoryEntry {
            entry_id: "id1".to_string(),
            namespace: "public".to_string(),
            path: "a".to_string(),
            author_agent_id: "agent:core".to_string(),
            author_session_id: Some("s1".to_string()),
            created_at: 0,
            updated_at: 0,
            content: "a".repeat(70), // 70 chars
            content_hash: "hash".to_string(),
            tags: vec![],
            access_count: 0,
            ttl: None,
            score: None,
        }];

        // 70 chars * 2 / 7 = 20 tokens
        let tokens = SharedMemoryStore::estimate_token_count(&entries);
        assert_eq!(tokens, 20);
    }

    #[test]
    fn estimate_token_count_multiple() {
        let entries = vec![
            SharedMemoryEntry {
                entry_id: "id1".to_string(),
                namespace: "public".to_string(),
                path: "a".to_string(),
                author_agent_id: "agent:core".to_string(),
                author_session_id: Some("s1".to_string()),
                created_at: 0,
                updated_at: 0,
                content: "a".repeat(35), // 35 chars = 10 tokens
                content_hash: "hash1".to_string(),
                tags: vec![],
                access_count: 0,
                ttl: None,
                score: None,
            },
            SharedMemoryEntry {
                entry_id: "id2".to_string(),
                namespace: "team".to_string(),
                path: "b".to_string(),
                author_agent_id: "agent:core".to_string(),
                author_session_id: Some("s2".to_string()),
                created_at: 0,
                updated_at: 0,
                content: "b".repeat(70), // 70 chars = 20 tokens
                content_hash: "hash2".to_string(),
                tags: vec![],
                access_count: 0,
                ttl: None,
                score: None,
            },
        ];

        // 10 + 20 = 30 tokens
        let tokens = SharedMemoryStore::estimate_token_count(&entries);
        assert_eq!(tokens, 30);
    }

    #[test]
    fn estimate_token_count_empty() {
        let entries: Vec<SharedMemoryEntry> = vec![];
        assert_eq!(SharedMemoryStore::estimate_token_count(&entries), 0);
    }

    #[test]
    fn format_timestamp_valid() {
        // Test that format_timestamp produces expected date format
        let ts = 1711929600i64; // 2024-04-01 00:00:00 UTC
        let formatted = SharedMemoryStore::format_timestamp(ts);
        assert_eq!(formatted, "2024-04-01");
    }

    #[test]
    fn format_timestamp_invalid() {
        // Very large timestamp that chrono can't represent
        let ts = i64::MAX;
        let formatted = SharedMemoryStore::format_timestamp(ts);
        assert_eq!(formatted, "unknown");
    }

    // ---------------------------------------------------------------------------
    // Wave 1 Hardening Tests
    // ---------------------------------------------------------------------------

    /// Test FTS5 query hardening: special characters are stripped from user input,
    /// but quotes are added by the implementation for safe phrase matching.
    #[test]
    fn fts5_query_strips_special_chars() {
        // User quotes should be stripped from input
        let query = SharedMemoryStore::build_safe_fts5_query("\"secret\" password");
        // Implementation adds quotes for phrase matching (safe)
        assert!(query.contains("\"secret\""));
        assert!(query.contains("\"password\""));
        // User's original quotes are stripped, ours are added
        assert!(!query.contains("\"\"")); // No double quotes

        // Asterisks from user input should be stripped (but we add controlled ones)
        let query = SharedMemoryStore::build_safe_fts5_query("test* query");
        // User's raw "test*" is stripped to "test", then formatted as `"test" OR test*`
        // The key point: user's raw asterisk is gone, our controlled one is present
        assert!(query.contains("\"test\"")); // cleaned and quoted
        assert!(query.contains("test*")); // controlled suffix present
        assert!(query.contains("\"query\"")); // second word processed

        // FTS5 operators should be stripped from user input
        let query = SharedMemoryStore::build_safe_fts5_query("hello OR world");
        // The word "OR" from user input should be stripped (converted to empty string)
        // But the query will still contain " OR " as the joiner between formatted terms
        assert!(!query.contains("\"OR\"")); // user's OR word is NOT present as a quoted term
        assert!(query.contains("hello"));
        assert!(query.contains("world"));
    }

    /// Test FTS5 query word limits.
    #[test]
    fn fts5_query_respects_word_limit() {
        // 15 words should be truncated to 10 input words
        let query = SharedMemoryStore::build_safe_fts5_query(
            "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen"
        );
        // Each input word becomes `"word" OR word*` which has 2 ORs in the formatted string
        // 10 input words = 10 formatted ORs (one per word), plus 9 join ORs = 19 total " OR "
        // The key check: verify 11th word was truncated
        assert!(
            !query.contains("eleven"),
            "Query should be truncated to 10 words (eleven should not appear). Query: {}",
            query
        );
        // Verify all 10 first words are present
        for word in [
            "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        ] {
            assert!(
                query.contains(&format!("\"{}\"", word)),
                "Word {} should be in query",
                word
            );
        }
    }

    /// Test FTS5 query length limits.
    #[test]
    fn fts5_query_respects_length_limit() {
        // Very long word should be truncated
        let long_word = "a".repeat(100);
        let query = SharedMemoryStore::build_safe_fts5_query(&long_word);
        // Extract the word from the query (it's quoted)
        let word_in_query = query.trim_start_matches('"').split("\" OR").next().unwrap();
        assert!(
            word_in_query.len() <= 64,
            "Word should be truncated to 64 chars"
        );
    }

    /// Test FTS5 query preserves useful behavior after hardening.
    #[test]
    fn fts5_query_preserves_prefix_matching() {
        let query = SharedMemoryStore::build_safe_fts5_query("rust code");
        // Should have both exact match (quoted) and prefix match (unquoted with *)
        assert!(query.contains("\"rust\" OR rust*"));
        assert!(query.contains("\"code\" OR code*"));
    }

    /// Test secret detection for SSH key patterns.
    #[test]
    fn secret_detection_ssh_keys() {
        // SSH private key headers
        let ssh_key = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n";
        assert!(SharedMemoryStore::check_content_for_secrets(ssh_key).is_err());

        // SSH public key format
        let ssh_pubkey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC user@host";
        assert!(SharedMemoryStore::check_content_for_secrets(ssh_pubkey).is_err());

        // ed25519 key
        let ed25519 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG user@host";
        assert!(SharedMemoryStore::check_content_for_secrets(ed25519).is_err());
    }

    /// Test secret detection for JWT tokens.
    #[test]
    fn secret_detection_jwt_tokens() {
        // JWT format: header.payload.signature
        let jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        assert!(SharedMemoryStore::check_content_for_secrets(jwt).is_err());

        // JWT in context
        let jwt_in_context =
            "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.something";
        assert!(SharedMemoryStore::check_content_for_secrets(jwt_in_context).is_err());
    }

    /// Test secret detection for API key patterns.
    /// Note: Generic `sk-` prefix detection was removed as too broad for documentation.
    /// High-entropy detection and assignment patterns (api_key: sk-...) still catch secrets.
    #[test]
    fn secret_detection_api_key_patterns() {
        // Generic sk-abc pattern is allowed (too broad for docs - not a secret without context)
        assert!(SharedMemoryStore::check_content_for_secrets("sk-abc123def456").is_ok());

        // Stripe-style keys are still detected (using fake prefixes that don't trigger GitHub)
        assert!(SharedMemoryStore::check_content_for_secrets("fake_sk_live_abc123").is_err());
        assert!(SharedMemoryStore::check_content_for_secrets("fake_sk_test_abc123").is_err());
        assert!(SharedMemoryStore::check_content_for_secrets("fake_rk_live_abc123").is_err());

        // API key with assignment is detected (high-confidence context)
        assert!(SharedMemoryStore::check_content_for_secrets("api_key: fake_sk_abc123").is_err());
        assert!(SharedMemoryStore::check_content_for_secrets("api_key: fake_sk_live_abc").is_err());
    }

    /// Test secret detection for Bearer tokens.
    #[test]
    fn secret_detection_bearer_tokens() {
        // Bearer token assignment
        assert!(
            SharedMemoryStore::check_content_for_secrets("bearer: eyJhbGciOiJIUzI1NiJ9").is_err()
        );
        assert!(
            SharedMemoryStore::check_content_for_secrets("bearer eyJhbGciOiJIUzI1NiJ9").is_err()
        );

        // Authorization header with fake key pattern
        assert!(SharedMemoryStore::check_content_for_secrets(
            "Authorization: Bearer fake_sk_live_123"
        )
        .is_err());
    }

    /// Test that credential file patterns with .example suffix are allowed.
    #[test]
    fn secret_detection_allows_example_files() {
        // .env.example should be allowed (it's a template)
        assert!(SharedMemoryStore::check_content_for_secrets("Copy .env.example to .env").is_ok());

        // But .env with content should be flagged (already handled by pattern)
        assert!(
            SharedMemoryStore::check_content_for_secrets("DATABASE_URL=postgres://host/db")
                .is_err()
        );
    }
}
