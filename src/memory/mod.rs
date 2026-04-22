//! Persistent memory backend — SQLite with FTS5 full-text search.
//!
//! Storage: `agents/<id>/workspace/memory.db`
//!
//! Provides ranked keyword search via FTS5/BM25 instead of substring
//! matching, plus efficient upsert and tag filtering.

pub mod curated;

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub mod shared;

/// A single memory entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub timestamp: String,
    /// BM25 relevance score (only populated in search results).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

/// SQLite-backed memory store with FTS5 search.
pub struct MemoryStore {
    inner: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveMemoryKind {
    ActiveTask,
    RelevantFacts,
}

#[derive(Debug, Clone)]
struct ActiveMemoryEntry {
    entry: MemoryEntry,
    score: f64,
    kind: ActiveMemoryKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QueryIntent {
    Preference,
    WorkContext,
    FileLookup,
}

impl MemoryStore {
    /// Open (or create) the memory database at `workspace/memory.db`.
    pub fn open(workspace: &Path) -> anyhow::Result<Self> {
        let db_path = workspace.join("memory.db");
        Self::open_path(&db_path)
    }

    /// Open a database at an explicit path (useful for tests).
    pub fn open_path(db_path: &Path) -> anyhow::Result<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;

        // Main table.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS memories (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                tags  TEXT NOT NULL DEFAULT '[]',
                ts    TEXT NOT NULL
            );",
        )?;

        // FTS5 virtual table for ranked search.
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                key, value, tags,
                content='memories',
                content_rowid='rowid'
            );",
        )?;

        // Triggers to keep FTS in sync.
        conn.execute_batch(
            "CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
                INSERT INTO memories_fts(rowid, key, value, tags)
                VALUES (new.rowid, new.key, new.value, new.tags);
            END;
            CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, key, value, tags)
                VALUES ('delete', old.rowid, old.key, old.value, old.tags);
            END;
            CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, key, value, tags)
                VALUES ('delete', old.rowid, old.key, old.value, old.tags);
                INSERT INTO memories_fts(rowid, key, value, tags)
                VALUES (new.rowid, new.key, new.value, new.tags);
            END;",
        )?;

        // Embedding cache table for semantic search.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS memory_embeddings (
                key       TEXT PRIMARY KEY,
                embedding BLOB NOT NULL,
                dim       INTEGER NOT NULL,
                model     TEXT NOT NULL DEFAULT ''
            );",
        )?;

        // Add model column if upgrading from older schema.
        let has_model: bool = conn
            .prepare("PRAGMA table_info(memory_embeddings)")
            .and_then(|mut stmt| {
                let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
                let cols: Vec<String> = rows.filter_map(|r| r.ok()).collect();
                Ok(cols.iter().any(|c| c == "model"))
            })
            .unwrap_or(true);
        if !has_model {
            let _ = conn.execute_batch(
                "ALTER TABLE memory_embeddings ADD COLUMN model TEXT NOT NULL DEFAULT ''",
            );
        }

        Ok(Self {
            inner: Arc::new(Mutex::new(conn)),
        })
    }

    /// Migrate entries from a legacy `memory.jsonl` file into SQLite.
    ///
    /// Skips keys that already exist. Returns the number imported.
    pub fn migrate_from_jsonl(&self, workspace: &Path) -> anyhow::Result<usize> {
        let jsonl_path = workspace.join("memory.jsonl");
        let content = match std::fs::read_to_string(&jsonl_path) {
            Ok(c) => c,
            Err(_) => return Ok(0),
        };

        let count = self.transaction_with_checkpoint(|tx| {
            let mut count = 0usize;
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                #[derive(Deserialize)]
                struct Legacy {
                    key: String,
                    value: String,
                    #[serde(default)]
                    tags: Vec<String>,
                    timestamp: String,
                }
                if let Ok(entry) = serde_json::from_str::<Legacy>(line) {
                    let tags_json = serde_json::to_string(&entry.tags).unwrap_or_else(|_| "[]".into());
                    let inserted = tx.execute(
                        "INSERT OR IGNORE INTO memories (key, value, tags, ts) VALUES (?1, ?2, ?3, ?4)",
                        params![entry.key, entry.value, tags_json, entry.timestamp],
                    )?;
                    count += inserted;
                }
            }
            Ok(count)
        })?;

        if count > 0 {
            // Rename old file so we don't re-import.
            let bak = workspace.join("memory.jsonl.migrated");
            let _ = std::fs::rename(&jsonl_path, &bak);
            tracing::info!(
                count,
                "migrated legacy memory.jsonl → memory.db and checkpointed"
            );
        }

        Ok(count)
    }

    /// Upsert a memory entry by key.
    pub fn save(&self, key: &str, value: &str, tags: &[String]) -> anyhow::Result<()> {
        let tags_json = serde_json::to_string(tags)?;
        let ts = chrono::Utc::now().to_rfc3339();
        self.execute_with_checkpoint(
            "INSERT INTO memories (key, value, tags, ts)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET value=?2, tags=?3, ts=?4",
            params![key, value, tags_json, ts],
        )?;
        tracing::debug!(key, "memory saved and checkpointed");
        Ok(())
    }

    /// Upsert a memory entry and invalidate its cached embedding in a
    /// single lock acquisition.  This ensures the stale embedding is
    /// always cleared when the content changes (atomic w.r.t. the lock).
    pub fn save_and_invalidate_embedding(
        &self,
        key: &str,
        value: &str,
        tags: &[String],
    ) -> anyhow::Result<()> {
        let tags_json = serde_json::to_string(tags)?;
        let ts = chrono::Utc::now().to_rfc3339();
        self.transaction_with_checkpoint(|tx| {
            tx.execute(
                "INSERT INTO memories (key, value, tags, ts)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(key) DO UPDATE SET value=?2, tags=?3, ts=?4",
                params![key, value, tags_json, ts],
            )?;
            tx.execute("DELETE FROM memory_embeddings WHERE key = ?1", params![key])?;
            Ok(())
        })?;
        tracing::debug!(key, "memory saved, embedding invalidated, and checkpointed");
        Ok(())
    }

    /// Delete a memory entry by key. Returns true if a row was deleted.
    pub fn forget(&self, key: &str) -> anyhow::Result<bool> {
        let deleted =
            self.execute_with_checkpoint("DELETE FROM memories WHERE key = ?1", params![key])?;
        if deleted > 0 {
            tracing::debug!(key, "memory forgotten and checkpointed");
        }
        Ok(deleted > 0)
    }

    /// Fetch a single memory entry by exact key.
    pub fn get(&self, key: &str) -> anyhow::Result<Option<MemoryEntry>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
        let mut stmt = conn.prepare("SELECT key, value, tags, ts FROM memories WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        let Some(row) = rows.next()? else {
            return Ok(None);
        };
        Ok(Some(MemoryEntry {
            key: row.get(0)?,
            value: row.get(1)?,
            tags: parse_tags(&row.get::<_, String>(2)?),
            timestamp: row.get(3)?,
            score: None,
        }))
    }

    /// Search memories using FTS5 ranked search.
    ///
    /// When `query` is empty, returns all memories (optionally filtered by tag).
    /// When `query` is non-empty, uses FTS5 BM25 scoring for relevance ranking.
    pub fn search(
        &self,
        query: &str,
        tag: Option<&str>,
        limit: usize,
    ) -> anyhow::Result<Vec<MemoryEntry>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;

        if query.is_empty() {
            // No search query — return all, optionally filtered by tag.
            let mut stmt = conn
                .prepare("SELECT key, value, tags, ts FROM memories ORDER BY ts DESC LIMIT ?1")?;
            let rows = stmt.query_map(params![limit as i64], |row| {
                Ok(MemoryEntry {
                    key: row.get(0)?,
                    value: row.get(1)?,
                    tags: parse_tags(&row.get::<_, String>(2)?),
                    timestamp: row.get(3)?,
                    score: None,
                })
            })?;
            let mut results = Vec::new();
            for row in rows {
                let entry = row?;
                if let Some(t) = tag {
                    if !entry.tags.iter().any(|et| et.eq_ignore_ascii_case(t)) {
                        continue;
                    }
                }
                results.push(entry);
            }
            Ok(results)
        } else {
            // FTS5 ranked search.
            // Sanitize the query for FTS5: wrap each word in quotes
            // with prefix matching (*) for partial word matches.
            let fts_query = query
                .split_whitespace()
                .map(|w| {
                    let clean = w.replace('"', "");
                    format!("\"{clean}\" OR \"{clean}\"*")
                })
                .collect::<Vec<_>>()
                .join(" OR ");

            let sql = "SELECT m.key, m.value, m.tags, m.ts, rank
                        FROM memories_fts f
                        JOIN memories m ON m.rowid = f.rowid
                        WHERE memories_fts MATCH ?1
                        ORDER BY rank
                        LIMIT ?2";
            let mut stmt = conn.prepare(sql)?;
            let rows = stmt.query_map(params![fts_query, limit as i64], |row| {
                // FTS5 rank is negative (more negative = more relevant).
                // Negate it so score is positive and higher = better,
                // consistent with cosine similarity scores from vector search.
                let raw_rank: f64 = row.get(4)?;
                Ok(MemoryEntry {
                    key: row.get(0)?,
                    value: row.get(1)?,
                    tags: parse_tags(&row.get::<_, String>(2)?),
                    timestamp: row.get(3)?,
                    score: Some(-raw_rank),
                })
            })?;
            let mut results = Vec::new();
            for row in rows {
                let entry = row?;
                if let Some(t) = tag {
                    if !entry.tags.iter().any(|et| et.eq_ignore_ascii_case(t)) {
                        continue;
                    }
                }
                results.push(entry);
            }
            Ok(results)
        }
    }

    /// Get all memories for system prompt injection.
    ///
    /// When `query` is non-empty, uses hybrid search (BM25 + vector) for
    /// relevance.  Falls back to most-recent when empty or on error.
    /// Returns at most 50 entries, capped at `max_chars`.
    pub fn prompt_block(&self, max_chars: usize) -> String {
        self.prompt_block_token_budget("", max_chars_to_token_budget(max_chars))
    }

    /// Context-aware memory injection: selects the most relevant memories
    /// for the given query (last user message) using hybrid search.
    pub fn prompt_block_contextual(&self, query: &str, max_chars: usize) -> String {
        self.prompt_block_token_budget(query, max_chars_to_token_budget(max_chars))
    }

    pub fn prompt_block_token_budget(&self, query: &str, max_tokens: usize) -> String {
        if max_tokens == 0 {
            return String::new();
        }

        let active = self.select_active_memory(query, 8);
        if active.is_empty() {
            return String::new();
        }

        let mut block = String::from("<active_memory>\n");
        let mut used_tokens = estimate_tokens(&block);
        let mut wrote_section = false;

        for (kind, label) in [
            (ActiveMemoryKind::ActiveTask, "active_task"),
            (ActiveMemoryKind::RelevantFacts, "relevant_facts"),
        ] {
            let section_entries: Vec<&ActiveMemoryEntry> =
                active.iter().filter(|entry| entry.kind == kind).collect();
            if section_entries.is_empty() {
                continue;
            }

            let section_header = format!("<{label}>\n");
            let section_footer = format!("</{label}>\n");
            let closing = "</active_memory>";
            let section_overhead = estimate_tokens(&section_header)
                + estimate_tokens(&section_footer)
                + estimate_tokens(closing);
            if used_tokens + section_overhead > max_tokens {
                break;
            }

            let section_start = block.len();
            let section_start_tokens = used_tokens;
            block.push_str(&section_header);
            used_tokens += estimate_tokens(&section_header);
            let mut wrote_line = false;
            for active_entry in section_entries {
                let line = format_active_memory_line(&active_entry.entry);
                let line_tokens = estimate_tokens(&line);
                if used_tokens
                    + line_tokens
                    + estimate_tokens(&section_footer)
                    + estimate_tokens(closing)
                    > max_tokens
                {
                    break;
                }
                block.push_str(&line);
                used_tokens += line_tokens;
                wrote_line = true;
            }

            if wrote_line {
                block.push_str(&section_footer);
                used_tokens += estimate_tokens(&section_footer);
                wrote_section = true;
            } else {
                block.truncate(section_start);
                used_tokens = section_start_tokens;
            }
        }

        if !wrote_section {
            return String::new();
        }

        block.push_str("</active_memory>");
        block
    }

    fn select_active_memory(&self, query: &str, limit: usize) -> Vec<ActiveMemoryEntry> {
        let query_tokens = tokenize_for_match(query);
        let query_intents = detect_query_intents(query_tokens.as_slice(), query);
        let mut entries = if query.trim().is_empty() {
            self.search("", None, limit.max(8)).unwrap_or_default()
        } else {
            let mut lexical = self.search(query, None, limit.max(24)).unwrap_or_default();
            let mut exact = self.exact_match_candidates(query, query_tokens.as_slice());
            let mut recent = self.search("", None, limit.max(8)).unwrap_or_default();
            exact.append(&mut lexical);
            let mut lexical = exact;
            lexical.append(&mut recent);
            if lexical.is_empty() {
                self.search("", None, limit.max(8)).unwrap_or_default()
            } else {
                lexical
            }
        };

        if entries.is_empty() {
            return Vec::new();
        }

        let query_lower = query.to_ascii_lowercase();
        let query_phrase = if query_tokens.is_empty() {
            None
        } else {
            Some(query_tokens.join(" "))
        };

        let mut scored: Vec<ActiveMemoryEntry> = entries
            .drain(..)
            .map(|entry| {
                let score = active_memory_score(
                    &entry,
                    &query_lower,
                    query_tokens.as_slice(),
                    query_phrase.as_deref(),
                    query_intents.as_slice(),
                );
                let kind = classify_active_memory(&entry, query_tokens.as_slice());
                ActiveMemoryEntry { entry, score, kind }
            })
            .collect();

        scored.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.entry.timestamp.cmp(&a.entry.timestamp))
        });

        let mut seen = HashSet::new();
        let mut selected = Vec::new();
        let mut task_count = 0usize;
        let mut fact_count = 0usize;
        let task_cap = limit.min(3);
        let fact_cap = limit.max(4);

        for item in scored {
            if !seen.insert(item.entry.key.clone()) {
                continue;
            }

            match item.kind {
                ActiveMemoryKind::ActiveTask if task_count >= task_cap => continue,
                ActiveMemoryKind::RelevantFacts if fact_count >= fact_cap => continue,
                ActiveMemoryKind::ActiveTask => task_count += 1,
                ActiveMemoryKind::RelevantFacts => fact_count += 1,
            }

            selected.push(item);
            if selected.len() >= limit {
                break;
            }
        }

        selected
    }

    fn exact_match_candidates(&self, query: &str, query_tokens: &[String]) -> Vec<MemoryEntry> {
        if query.trim().is_empty() {
            return Vec::new();
        }

        let conn = match self.inner.lock() {
            Ok(conn) => conn,
            Err(_) => return Vec::new(),
        };

        let mut patterns = Vec::new();
        let normalized_query = query.trim().to_ascii_lowercase();
        patterns.push(normalized_query.clone());
        let compact = query_tokens.join("_");
        if !compact.is_empty() {
            patterns.push(compact.clone());
            patterns.push(compact.replace('_', "-"));
        }
        if query_tokens.len() > 1 {
            patterns.push(query_tokens.join("_"));
            patterns.push(query_tokens.join("-"));
        }
        patterns.extend(query_tokens.iter().cloned());
        patterns.sort();
        patterns.dedup();

        let mut results = Vec::new();
        for pattern in patterns {
            let mut stmt = match conn.prepare(
                "SELECT key, value, tags, ts
                 FROM memories
                 WHERE lower(key) = ?1 OR lower(key) LIKE ?2 OR lower(value) LIKE ?3
                 ORDER BY ts DESC
                 LIMIT 6",
            ) {
                Ok(stmt) => stmt,
                Err(_) => return results,
            };
            let rows = match stmt.query_map(
                params![pattern, format!("%{pattern}%"), format!("%{pattern}%"),],
                |row| {
                    let tags_json: String = row.get(2)?;
                    Ok(MemoryEntry {
                        key: row.get(0)?,
                        value: row.get(1)?,
                        tags: parse_tags(&tags_json),
                        timestamp: row.get(3)?,
                        score: Some(0.0),
                    })
                },
            ) {
                Ok(rows) => rows,
                Err(_) => continue,
            };
            for row in rows.flatten() {
                results.push(row);
            }
        }

        results
    }

    /// Return total number of memory entries.
    pub fn count(&self) -> anyhow::Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))?;
        Ok(count as usize)
    }

    // ── Embedding / semantic search ─────────────────────────

    /// Store an embedding vector for a memory key, tagged with the model name.
    pub fn save_embedding(&self, key: &str, embedding: &[f32]) -> anyhow::Result<()> {
        self.save_embedding_with_model(key, embedding, "")
    }

    /// Store an embedding vector for a memory key with the model name.
    pub fn save_embedding_with_model(
        &self,
        key: &str,
        embedding: &[f32],
        model: &str,
    ) -> anyhow::Result<()> {
        let blob = embedding_to_blob(embedding);
        self.execute_with_checkpoint(
            "INSERT INTO memory_embeddings (key, embedding, dim, model)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET embedding=?2, dim=?3, model=?4",
            params![key, blob, embedding.len() as i64, model],
        )?;
        tracing::debug!(key, model, "embedding saved and checkpointed");
        Ok(())
    }

    /// Delete a cached embedding for a key.
    pub fn delete_embedding(&self, key: &str) -> anyhow::Result<()> {
        self.execute_with_checkpoint("DELETE FROM memory_embeddings WHERE key = ?1", params![key])?;
        tracing::debug!(key, "embedding deleted and checkpointed");
        Ok(())
    }

    /// Return all keys that have no cached embedding yet.
    pub fn keys_without_embeddings(&self) -> anyhow::Result<Vec<String>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT m.key FROM memories m
             LEFT JOIN memory_embeddings e ON m.key = e.key
             WHERE e.key IS NULL",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut keys = Vec::new();
        for row in rows {
            keys.push(row?);
        }
        Ok(keys)
    }

    /// Semantic search: rank memories by cosine similarity to `query_embedding`.
    ///
    /// Only considers memories that have cached embeddings. Returns up to
    /// `limit` entries ordered by descending similarity.
    pub fn search_semantic(
        &self,
        query_embedding: &[f32],
        tag: Option<&str>,
        limit: usize,
    ) -> anyhow::Result<Vec<MemoryEntry>> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
        let mut stmt = conn.prepare(
            "SELECT m.key, m.value, m.tags, m.ts, e.embedding, e.dim
             FROM memory_embeddings e
             JOIN memories m ON m.key = e.key",
        )?;
        let rows = stmt.query_map([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            let tags_json: String = row.get(2)?;
            let ts: String = row.get(3)?;
            let blob: Vec<u8> = row.get(4)?;
            let dim: i64 = row.get(5)?;
            Ok((key, value, tags_json, ts, blob, dim as usize))
        })?;

        let mut scored: Vec<(f64, MemoryEntry)> = Vec::new();
        for row in rows {
            let (key, value, tags_json, ts, blob, dim) = row?;
            let tags = parse_tags(&tags_json);
            if let Some(t) = tag {
                if !tags.iter().any(|et| et.eq_ignore_ascii_case(t)) {
                    continue;
                }
            }
            let emb = blob_to_embedding(&blob, dim);
            let sim = cosine_similarity(query_embedding, &emb);
            scored.push((
                sim,
                MemoryEntry {
                    key,
                    value,
                    tags,
                    timestamp: ts,
                    score: Some(sim),
                },
            ));
        }

        // Sort by similarity descending.
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(limit);
        Ok(scored.into_iter().map(|(_, e)| e).collect())
    }

    /// Hybrid search: fuses BM25 keyword results with vector cosine similarity
    /// using Reciprocal Rank Fusion (RRF).
    ///
    /// Score = Σ 1/(k + rank) across both result lists, with k = 60.
    /// Falls back to BM25-only when no embeddings are available.
    pub fn search_hybrid(
        &self,
        query: &str,
        tag: Option<&str>,
        limit: usize,
    ) -> anyhow::Result<Vec<MemoryEntry>> {
        if query.is_empty() {
            return self.search("", tag, limit);
        }

        // Get BM25 results.
        let bm25_results = self.search(query, tag, limit.max(50))?;

        // Check if we have any embeddings at all.
        let has_embeddings = {
            let conn = self
                .inner
                .lock()
                .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
            let count: i64 =
                conn.query_row("SELECT COUNT(*) FROM memory_embeddings", [], |r| r.get(0))?;
            count > 0
        };

        if !has_embeddings {
            // No embeddings available — return BM25 results only.
            let mut results = bm25_results;
            results.truncate(limit);
            return Ok(results);
        }

        // We need a query embedding for the vector side.  If we can't get one,
        // fall back to BM25-only.
        let query_emb = match get_cached_query_embedding(query) {
            Some(emb) => emb,
            None => {
                let mut results = bm25_results;
                results.truncate(limit);
                return Ok(results);
            }
        };

        let vec_results = self.search_semantic(&query_emb, tag, limit.max(50))?;

        // Reciprocal Rank Fusion with k=60.
        let k = 60.0f64;
        let mut rrf_scores: std::collections::HashMap<String, (f64, MemoryEntry)> =
            std::collections::HashMap::new();

        for (rank, entry) in bm25_results.iter().enumerate() {
            let rrf = 1.0 / (k + rank as f64 + 1.0);
            rrf_scores
                .entry(entry.key.clone())
                .and_modify(|(score, _)| *score += rrf)
                .or_insert_with(|| (rrf, entry.clone()));
        }

        for (rank, entry) in vec_results.iter().enumerate() {
            let rrf = 1.0 / (k + rank as f64 + 1.0);
            rrf_scores
                .entry(entry.key.clone())
                .and_modify(|(score, _)| *score += rrf)
                .or_insert_with(|| (rrf, entry.clone()));
        }

        let mut fused: Vec<(f64, MemoryEntry)> = rrf_scores.into_values().collect();
        fused.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        fused.truncate(limit);
        Ok(fused
            .into_iter()
            .map(|(score, mut e)| {
                e.score = Some(score);
                e
            })
            .collect())
    }

    /// Force a WAL checkpoint to ensure all data is persisted to the main database file.
    pub fn checkpoint(&self) -> anyhow::Result<()> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;
        Ok(())
    }

    /// Execute SQL and immediately checkpoint WAL
    pub fn execute_with_checkpoint(
        &self,
        sql: &str,
        params: &[&dyn rusqlite::ToSql],
    ) -> anyhow::Result<usize> {
        let conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
        let rows = conn.execute(sql, params)?;
        // Force WAL checkpoint to ensure durability (use query_row since PRAGMA returns results)
        let _: (i32, i32, i32) = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        Ok(rows)
    }

    /// Execute a transaction with automatic checkpoint on commit
    pub fn transaction_with_checkpoint<F, R>(&self, f: F) -> anyhow::Result<R>
    where
        F: FnOnce(&rusqlite::Transaction) -> anyhow::Result<R>,
    {
        let mut conn = self
            .inner
            .lock()
            .map_err(|e| anyhow::anyhow!("memory db poisoned: {e}"))?;
        let tx = conn.transaction()?;
        let result = f(&tx)?;
        tx.commit()?;
        // Checkpoint after successful commit (use query_row since PRAGMA returns results)
        let _: (i32, i32, i32) = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        Ok(result)
    }
}

fn parse_tags(json: &str) -> Vec<String> {
    serde_json::from_str(json).unwrap_or_default()
}

fn estimate_tokens(text: &str) -> usize {
    crate::context::estimate_tokens(text)
}

fn max_chars_to_token_budget(max_chars: usize) -> usize {
    estimate_tokens(&"x".repeat(max_chars)).max(1)
}

fn tokenize_for_match(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            tokens.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn active_memory_score(
    entry: &MemoryEntry,
    query_lower: &str,
    query_tokens: &[String],
    query_phrase: Option<&str>,
    query_intents: &[QueryIntent],
) -> f64 {
    let mut score = entry.score.unwrap_or(0.0);
    let key_lower = entry.key.to_ascii_lowercase();
    let value_lower = entry.value.to_ascii_lowercase();
    let key_tokens = tokenize_for_match(&entry.key);
    let value_tokens = tokenize_for_match(&entry.value);
    let tags_lower: Vec<String> = entry
        .tags
        .iter()
        .map(|tag| tag.to_ascii_lowercase())
        .collect();
    let entry_path_like = looks_like_path(&entry.key) || looks_like_path(&entry.value);
    let entry_symbol_like = looks_like_symbol(&entry.key);

    if !query_lower.is_empty() && key_lower == query_lower.trim() {
        score += 8.0;
    }
    if let Some(phrase) = query_phrase {
        if !phrase.is_empty() {
            if key_lower.contains(phrase) {
                score += 4.0;
            }
            if value_lower.contains(phrase) {
                score += 2.0;
            }
        }
    }

    if !key_lower.is_empty() && query_lower.contains(&key_lower) {
        score += 2.5;
    }

    for token in query_tokens {
        if key_tokens.iter().any(|candidate| candidate == token) {
            score += 2.0;
        } else if key_lower.contains(token) {
            score += 0.75;
        }

        if value_tokens.iter().any(|candidate| candidate == token) {
            score += 0.75;
        }

        if tags_lower.iter().any(|tag| tag == token) {
            score += 1.5;
        }

        if entry_path_like && (token.contains('/') || token.contains('.') || token == "src") {
            score += 1.25;
        }

        if entry_symbol_like && key_lower.contains(token) {
            score += 1.5;
        }
    }

    if let Some(boost) = recency_boost(&entry.timestamp) {
        score += boost;
    }

    score += source_boost(entry);
    score += intent_boost(query_intents, &key_lower, &value_lower, &tags_lower);

    if is_task_memory(entry, query_tokens) {
        score += 1.0;
    }

    score
}

fn classify_active_memory(entry: &MemoryEntry, query_tokens: &[String]) -> ActiveMemoryKind {
    if is_task_memory(entry, query_tokens) {
        ActiveMemoryKind::ActiveTask
    } else {
        ActiveMemoryKind::RelevantFacts
    }
}

fn is_task_memory(entry: &MemoryEntry, query_tokens: &[String]) -> bool {
    if entry.key.starts_with("file:") {
        return true;
    }

    let task_tags = [
        "task",
        "task-state",
        "task_state",
        "active-task",
        "file-watch",
        "auto-ingest",
        "workspace",
        "project",
        "recent",
        "status",
    ];
    if entry.tags.iter().any(|tag| {
        task_tags
            .iter()
            .any(|candidate| tag.eq_ignore_ascii_case(candidate))
    }) {
        return true;
    }

    let key_tokens = tokenize_for_match(&entry.key);
    query_tokens.iter().any(|token| {
        matches!(
            token.as_str(),
            "file" | "build" | "test" | "project" | "task" | "work"
        ) && key_tokens.iter().any(|candidate| candidate == token)
    })
}

fn recency_boost(timestamp: &str) -> Option<f64> {
    let parsed = chrono::DateTime::parse_from_rfc3339(timestamp).ok()?;
    let age = chrono::Utc::now().signed_duration_since(parsed.with_timezone(&chrono::Utc));
    if age < chrono::Duration::hours(6) {
        Some(2.0)
    } else if age < chrono::Duration::days(2) {
        Some(1.0)
    } else if age < chrono::Duration::days(7) {
        Some(0.35)
    } else {
        Some(0.0)
    }
}

fn format_active_memory_line(entry: &MemoryEntry) -> String {
    format!("- {}: {}\n", entry.key, entry.value.replace('\n', " "))
}

fn detect_query_intents(query_tokens: &[String], query: &str) -> Vec<QueryIntent> {
    let mut intents = Vec::new();
    let query_lower = query.to_ascii_lowercase();

    if query_tokens.iter().any(|token| {
        matches!(
            token.as_str(),
            "preference"
                | "prefer"
                | "preferences"
                | "setting"
                | "settings"
                | "timezone"
                | "editor"
                | "provider"
                | "model"
                | "name"
        )
    }) {
        intents.push(QueryIntent::Preference);
    }

    if query_tokens.iter().any(|token| {
        matches!(
            token.as_str(),
            "continue"
                | "working"
                | "work"
                | "task"
                | "build"
                | "test"
                | "debug"
                | "fix"
                | "project"
        )
    }) || query_lower.contains("keep working")
    {
        intents.push(QueryIntent::WorkContext);
    }

    if query.contains('/')
        || query.contains("::")
        || query.contains('.')
        || query_tokens.iter().any(|token| {
            matches!(
                token.as_str(),
                "file" | "path" | "function" | "module" | "symbol"
            )
        })
    {
        intents.push(QueryIntent::FileLookup);
    }

    intents
}

fn source_boost(entry: &MemoryEntry) -> f64 {
    if entry
        .tags
        .iter()
        .any(|tag| tag.eq_ignore_ascii_case("preference") || tag.eq_ignore_ascii_case("user"))
    {
        return 2.5;
    }
    if entry
        .tags
        .iter()
        .any(|tag| tag.eq_ignore_ascii_case("task") || tag.eq_ignore_ascii_case("task-state"))
    {
        return 1.5;
    }
    if entry.tags.iter().any(|tag| {
        tag.eq_ignore_ascii_case("file-watch") || tag.eq_ignore_ascii_case("auto-ingest")
    }) {
        return 0.75;
    }
    0.0
}

fn intent_boost(
    query_intents: &[QueryIntent],
    key_lower: &str,
    value_lower: &str,
    tags_lower: &[String],
) -> f64 {
    let mut score = 0.0;

    for intent in query_intents {
        match intent {
            QueryIntent::Preference => {
                if tags_lower
                    .iter()
                    .any(|tag| tag == "preference" || tag == "user")
                {
                    score += 3.0;
                }
                if matches!(
                    key_lower,
                    "timezone" | "editor" | "provider" | "model" | "name"
                ) {
                    score += 2.5;
                }
            }
            QueryIntent::WorkContext => {
                if tags_lower.iter().any(|tag| {
                    matches!(
                        tag.as_str(),
                        "task"
                            | "task-state"
                            | "task_state"
                            | "file-watch"
                            | "auto-ingest"
                            | "project"
                    )
                }) {
                    score += 2.5;
                }
                if looks_like_path(key_lower) || value_lower.contains("working on") {
                    score += 1.5;
                }
            }
            QueryIntent::FileLookup => {
                if looks_like_path(key_lower) || looks_like_symbol(key_lower) {
                    score += 3.0;
                }
                if value_lower.contains("src/") || value_lower.contains("::") {
                    score += 1.5;
                }
            }
        }
    }

    score
}

fn looks_like_path(value: &str) -> bool {
    value.contains('/')
        || value.ends_with(".rs")
        || value.ends_with(".ts")
        || value.ends_with(".tsx")
}

fn looks_like_symbol(value: &str) -> bool {
    value.contains("::") || (value.contains('(') && value.contains(')'))
}

/// Try to synchronously get a query embedding from the global provider manager.
///
/// This uses `tokio::task::block_in_place` to call the async embed method
/// from a sync context.  Returns `None` if no provider supports embeddings
/// or if the call fails.
fn get_cached_query_embedding(query: &str) -> Option<Vec<f32>> {
    let pm = crate::models::get_global_providers()?;
    // block_in_place is safe here because MemoryStore methods are only called
    // from spawn_blocking or from async contexts that can tolerate it.
    let result = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(async { pm.embed(&[query]).await })
    });
    match result {
        Ok(Some(mut vecs)) if !vecs.is_empty() => Some(vecs.remove(0)),
        _ => None,
    }
}

/// Serialize an f32 slice to a compact little-endian byte blob.
fn embedding_to_blob(vec: &[f32]) -> Vec<u8> {
    vec.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize a byte blob back to an f32 vector.
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

// ── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (tempfile::TempDir, MemoryStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = MemoryStore::open(dir.path()).unwrap();
        (dir, store)
    }

    #[test]
    fn save_and_recall_by_key() {
        let (_dir, store) = temp_store();
        store.save("name", "Alice", &[]).unwrap();
        let results = store.search("", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].key, "name");
        assert_eq!(results[0].value, "Alice");
    }

    #[test]
    fn upsert_replaces_value() {
        let (_dir, store) = temp_store();
        store.save("name", "Alice", &[]).unwrap();
        store.save("name", "Bob", &[]).unwrap();
        let results = store.search("", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].value, "Bob");
    }

    #[test]
    fn fts5_ranked_search() {
        let (_dir, store) = temp_store();
        store
            .save("fruit", "I love apples and oranges", &["food".into()])
            .unwrap();
        store
            .save("pet", "My cat is named Whiskers", &["animals".into()])
            .unwrap();
        store
            .save("snack", "Apple pie is the best dessert", &["food".into()])
            .unwrap();

        let results = store.search("apple", None, 10).unwrap();
        assert!(results.len() >= 2);
        // Both apple-related entries should appear
        let keys: Vec<&str> = results.iter().map(|r| r.key.as_str()).collect();
        assert!(keys.contains(&"fruit"));
        assert!(keys.contains(&"snack"));
        // Cat entry shouldn't match
        assert!(!keys.contains(&"pet"));
    }

    #[test]
    fn tag_filtering() {
        let (_dir, store) = temp_store();
        store.save("a", "value_a", &["x".into()]).unwrap();
        store.save("b", "value_b", &["y".into()]).unwrap();

        let results = store.search("", Some("x"), 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].key, "a");
    }

    #[test]
    fn forget_deletes() {
        let (_dir, store) = temp_store();
        store.save("key1", "val", &[]).unwrap();
        assert_eq!(store.count().unwrap(), 1);
        assert!(store.forget("key1").unwrap());
        assert_eq!(store.count().unwrap(), 0);
        // After delete, FTS shouldn't find it either
        let results = store.search("val", None, 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn prompt_block_format() {
        let (_dir, store) = temp_store();
        store.save("name", "Alice", &[]).unwrap();
        store.save("goal", "Build a robot", &[]).unwrap();
        let block = store.prompt_block(4000);
        assert!(block.starts_with("<active_memory>"));
        assert!(block.ends_with("</active_memory>"));
        assert!(block.contains("<relevant_facts>"));
        assert!(block.contains("name: Alice"));
        assert!(block.contains("goal: Build a robot"));
    }

    #[test]
    fn migrate_from_jsonl() {
        let dir = tempfile::tempdir().unwrap();
        // Write a legacy JSONL file.
        let jsonl = r#"{"key":"name","value":"Alice","tags":["person"],"timestamp":"2025-01-01T00:00:00Z"}
{"key":"pet","value":"Cat","tags":[],"timestamp":"2025-01-02T00:00:00Z"}"#;
        std::fs::write(dir.path().join("memory.jsonl"), jsonl).unwrap();

        let store = MemoryStore::open(dir.path()).unwrap();
        let count = store.migrate_from_jsonl(dir.path()).unwrap();
        assert_eq!(count, 2);
        assert_eq!(store.count().unwrap(), 2);

        // Old file should be renamed.
        assert!(!dir.path().join("memory.jsonl").exists());
        assert!(dir.path().join("memory.jsonl.migrated").exists());

        // Search should work.
        let results = store.search("Alice", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].key, "name");
    }

    #[test]
    fn count_tracks_entries() {
        let (_dir, store) = temp_store();
        assert_eq!(store.count().unwrap(), 0);
        store.save("a", "1", &[]).unwrap();
        store.save("b", "2", &[]).unwrap();
        assert_eq!(store.count().unwrap(), 2);
    }

    #[test]
    fn search_special_chars() {
        let (_dir, store) = temp_store();
        store.save("q1", "what's the user's email?", &[]).unwrap();
        // Should not crash on quotes/special chars in query.
        let results = store.search("user's email", None, 10).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn limit_is_respected() {
        let (_dir, store) = temp_store();
        for i in 0..20 {
            store
                .save(&format!("k{i}"), &format!("value {i}"), &[])
                .unwrap();
        }
        let results = store.search("", None, 5).unwrap();
        assert_eq!(results.len(), 5);
    }

    #[test]
    fn empty_db_prompt_block_is_empty() {
        let (_dir, store) = temp_store();
        let block = store.prompt_block(4000);
        assert!(block.is_empty());
    }

    #[test]
    fn prompt_block_respects_max_chars() {
        let (_dir, store) = temp_store();
        for i in 0..50 {
            store
                .save(
                    &format!("key_{i}"),
                    &format!("fairly long value number {i} to fill the budget"),
                    &[],
                )
                .unwrap();
        }
        let block = store.prompt_block(200);
        assert!(block.len() <= 200 + 50); // small slack for final </memory> tag
        assert!(block.starts_with("<active_memory>"));
        assert!(block.ends_with("</active_memory>"));
    }

    #[test]
    fn prompt_block_prioritizes_exact_key_matches() {
        let (_dir, store) = temp_store();
        store
            .save(
                "timezone",
                "User is in Europe/London",
                &["preference".into()],
            )
            .unwrap();
        store
            .save(
                "project",
                "Working on memory improvements",
                &["task".into()],
            )
            .unwrap();

        let selected = store.select_active_memory("timezone", 5);
        assert!(!selected.is_empty());
        assert_eq!(selected[0].entry.key, "timezone");
    }

    #[test]
    fn prompt_block_groups_task_memories() {
        let (_dir, store) = temp_store();
        store
            .save(
                "file:src/memory/mod.rs",
                "Recent work touched active memory selection",
                &["file-watch".into(), "auto-ingest".into()],
            )
            .unwrap();
        store
            .save("timezone", "User is in UTC", &["preference".into()])
            .unwrap();

        let block = store.prompt_block_contextual("keep working on memory", 4000);
        assert!(block.contains("<active_task>"));
        assert!(block.contains("file:src/memory/mod.rs"));
        assert!(block.contains("<relevant_facts>"));
        assert!(block.contains("timezone: User is in UTC"));
    }

    #[test]
    fn prompt_block_prefers_preference_memories_for_settings_queries() {
        let (_dir, store) = temp_store();
        store
            .save(
                "timezone",
                "User is in Europe/London",
                &["preference".into()],
            )
            .unwrap();
        store
            .save(
                "file:src/config.rs",
                "Recent config work touched timezone parsing",
                &["file-watch".into(), "auto-ingest".into()],
            )
            .unwrap();

        let selected = store.select_active_memory("what is my timezone setting", 5);
        assert!(!selected.is_empty());
        assert_eq!(selected[0].entry.key, "timezone");
    }

    #[test]
    fn prompt_block_prefers_file_memories_for_path_queries() {
        let (_dir, store) = temp_store();
        store
            .save(
                "file:src/memory/mod.rs",
                "Active memory ranking lives here",
                &["file-watch".into(), "auto-ingest".into()],
            )
            .unwrap();
        store
            .save(
                "memory_notes",
                "Remember to revisit ranking",
                &["preference".into()],
            )
            .unwrap();

        let selected = store.select_active_memory("open src/memory/mod.rs", 5);
        assert!(!selected.is_empty());
        assert_eq!(selected[0].entry.key, "file:src/memory/mod.rs");
    }

    #[test]
    fn prompt_block_prefers_task_memories_for_work_queries() {
        let (_dir, store) = temp_store();
        store
            .save(
                "project",
                "Working on active memory ranking improvements",
                &["task".into()],
            )
            .unwrap();
        store
            .save("timezone", "User is in UTC", &["preference".into()])
            .unwrap();

        let selected = store.select_active_memory("continue working on ranking", 5);
        assert!(!selected.is_empty());
        assert_eq!(selected[0].entry.key, "project");
    }

    #[test]
    fn upsert_updates_tags() {
        let (_dir, store) = temp_store();
        store.save("item", "something", &["old".into()]).unwrap();
        store
            .save("item", "something new", &["new".into(), "fresh".into()])
            .unwrap();
        let results = store.search("", None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].value, "something new");
        assert_eq!(results[0].tags, vec!["new", "fresh"]);
    }

    #[test]
    fn multiple_tags_stored_and_filtered() {
        let (_dir, store) = temp_store();
        store
            .save("multi", "val", &["alpha".into(), "beta".into()])
            .unwrap();
        store.save("single", "val2", &["gamma".into()]).unwrap();

        let alpha = store.search("", Some("alpha"), 10).unwrap();
        assert_eq!(alpha.len(), 1);
        assert_eq!(alpha[0].key, "multi");

        let beta = store.search("", Some("beta"), 10).unwrap();
        assert_eq!(beta.len(), 1);

        let gamma = store.search("", Some("gamma"), 10).unwrap();
        assert_eq!(gamma.len(), 1);
        assert_eq!(gamma[0].key, "single");
    }

    #[test]
    fn forget_nonexistent_returns_false() {
        let (_dir, store) = temp_store();
        assert!(!store.forget("does_not_exist").unwrap());
    }

    #[test]
    fn fts5_multi_word_query() {
        let (_dir, store) = temp_store();
        store.save("m1", "the quick brown fox jumps", &[]).unwrap();
        store.save("m2", "lazy dog sleeps all day", &[]).unwrap();
        store.save("m3", "fox and dog are friends", &[]).unwrap();

        // Search for two words — both fox-related entries should appear
        let results = store.search("fox", None, 10).unwrap();
        let keys: Vec<&str> = results.iter().map(|r| r.key.as_str()).collect();
        assert!(keys.contains(&"m1"));
        assert!(keys.contains(&"m3"));
        assert!(!keys.contains(&"m2"));
    }

    #[test]
    fn fts5_with_tag_filter() {
        let (_dir, store) = temp_store();
        store
            .save("a", "the sun is bright", &["sky".into()])
            .unwrap();
        store
            .save("b", "the sun rises early", &["time".into()])
            .unwrap();

        // Without tag filter, both match.
        let all = store.search("sun", None, 10).unwrap();
        assert_eq!(all.len(), 2);

        // With tag filter, only one matches.
        let sky = store.search("sun", Some("sky"), 10).unwrap();
        assert_eq!(sky.len(), 1);
        assert_eq!(sky[0].key, "a");
    }

    #[test]
    fn migrate_from_jsonl_no_file_is_zero() {
        let dir = tempfile::tempdir().unwrap();
        let store = MemoryStore::open(dir.path()).unwrap();
        // No memory.jsonl exists — should return 0 without error.
        let count = store.migrate_from_jsonl(dir.path()).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn open_same_db_twice() {
        let dir = tempfile::tempdir().unwrap();
        let store1 = MemoryStore::open(dir.path()).unwrap();
        store1.save("key1", "val1", &[]).unwrap();
        drop(store1);

        // Re-open the same DB and verify data persists.
        let store2 = MemoryStore::open(dir.path()).unwrap();
        assert_eq!(store2.count().unwrap(), 1);
        let results = store2.search("", None, 10).unwrap();
        assert_eq!(results[0].key, "key1");
        assert_eq!(results[0].value, "val1");
    }

    // ── Embedding / semantic search tests ────────────────────

    #[test]
    fn embedding_blob_roundtrip() {
        let original: Vec<f32> = vec![1.0, -0.5, 0.0, 3.15, -2.71];
        let blob = embedding_to_blob(&original);
        let recovered = blob_to_embedding(&blob, original.len());
        assert_eq!(original, recovered);
    }

    #[test]
    fn cosine_similarity_identical_vectors() {
        let v = vec![1.0f32, 2.0, 3.0];
        let sim = cosine_similarity(&v, &v);
        assert!(
            (sim - 1.0).abs() < 1e-6,
            "identical vectors should have similarity ~1.0"
        );
    }

    #[test]
    fn cosine_similarity_orthogonal_vectors() {
        let a = vec![1.0f32, 0.0];
        let b = vec![0.0f32, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(
            sim.abs() < 1e-6,
            "orthogonal vectors should have similarity ~0.0"
        );
    }

    #[test]
    fn cosine_similarity_opposite_vectors() {
        let a = vec![1.0f32, 2.0, 3.0];
        let b = vec![-1.0f32, -2.0, -3.0];
        let sim = cosine_similarity(&a, &b);
        assert!(
            (sim + 1.0).abs() < 1e-6,
            "opposite vectors should have similarity ~-1.0"
        );
    }

    #[test]
    fn cosine_similarity_zero_vector() {
        let a = vec![1.0f32, 2.0];
        let b = vec![0.0f32, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert_eq!(sim, 0.0, "zero vector should yield 0.0");
    }

    #[test]
    fn save_and_retrieve_embedding() {
        let (_dir, store) = temp_store();
        store.save("k1", "some value", &[]).unwrap();

        let emb = vec![0.1f32, 0.2, 0.3];
        store.save_embedding("k1", &emb).unwrap();

        // keys_without_embeddings should not include k1 anymore.
        let missing = store.keys_without_embeddings().unwrap();
        assert!(!missing.contains(&"k1".to_string()));
    }

    #[test]
    fn keys_without_embeddings_lists_unembedded() {
        let (_dir, store) = temp_store();
        store.save("a", "alpha", &[]).unwrap();
        store.save("b", "beta", &[]).unwrap();
        store.save("c", "gamma", &[]).unwrap();

        // Embed only "a".
        store.save_embedding("a", &[1.0, 0.0]).unwrap();

        let missing = store.keys_without_embeddings().unwrap();
        assert_eq!(missing.len(), 2);
        assert!(missing.contains(&"b".to_string()));
        assert!(missing.contains(&"c".to_string()));
        assert!(!missing.contains(&"a".to_string()));
    }

    #[test]
    fn delete_embedding_removes_cache() {
        let (_dir, store) = temp_store();
        store.save("k1", "val", &[]).unwrap();
        store.save_embedding("k1", &[1.0, 2.0]).unwrap();

        assert!(store.keys_without_embeddings().unwrap().is_empty());
        store.delete_embedding("k1").unwrap();
        assert_eq!(store.keys_without_embeddings().unwrap(), vec!["k1"]);
    }

    #[test]
    fn save_embedding_upserts() {
        let (_dir, store) = temp_store();
        store.save("k1", "val", &[]).unwrap();

        store.save_embedding("k1", &[1.0, 0.0]).unwrap();
        store.save_embedding("k1", &[0.0, 1.0]).unwrap();

        // Should still have exactly one embedding — verify via semantic search.
        let results = store.search_semantic(&[0.0, 1.0], None, 10).unwrap();
        assert_eq!(results.len(), 1);
        // Similarity to [0,1] should be ~1.0 since we overwrote with [0,1].
        assert!(results[0].score.unwrap() > 0.99);
    }

    #[test]
    fn semantic_search_ranks_by_similarity() {
        let (_dir, store) = temp_store();
        // Create three memories with distinct "directions" in 2D.
        store.save("north", "pointing north", &[]).unwrap();
        store.save("east", "pointing east", &[]).unwrap();
        store.save("south", "pointing south", &[]).unwrap();

        store.save_embedding("north", &[0.0, 1.0]).unwrap();
        store.save_embedding("east", &[1.0, 0.0]).unwrap();
        store.save_embedding("south", &[0.0, -1.0]).unwrap();

        // Query close to north.
        let results = store.search_semantic(&[0.1, 0.95], None, 10).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].key, "north", "most similar should be north");
    }

    #[test]
    fn semantic_search_respects_limit() {
        let (_dir, store) = temp_store();
        for i in 0..5 {
            let key = format!("k{i}");
            store.save(&key, &format!("val{i}"), &[]).unwrap();
            store.save_embedding(&key, &[i as f32, 0.0]).unwrap();
        }
        let results = store.search_semantic(&[1.0, 0.0], None, 2).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn semantic_search_filters_by_tag() {
        let (_dir, store) = temp_store();
        store.save("a", "alpha", &["x".into()]).unwrap();
        store.save("b", "beta", &["y".into()]).unwrap();
        store.save_embedding("a", &[1.0, 0.0]).unwrap();
        store.save_embedding("b", &[1.0, 0.0]).unwrap();

        let results = store.search_semantic(&[1.0, 0.0], Some("x"), 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].key, "a");
    }

    #[test]
    fn semantic_search_empty_when_no_embeddings() {
        let (_dir, store) = temp_store();
        store.save("k1", "val", &[]).unwrap();
        // No embeddings saved — should return empty.
        let results = store.search_semantic(&[1.0, 0.0], None, 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn semantic_search_has_score() {
        let (_dir, store) = temp_store();
        store.save("k1", "val", &[]).unwrap();
        store.save_embedding("k1", &[1.0, 0.0]).unwrap();

        let results = store.search_semantic(&[1.0, 0.0], None, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].score.is_some());
        assert!((results[0].score.unwrap() - 1.0).abs() < 1e-6);
    }
}
