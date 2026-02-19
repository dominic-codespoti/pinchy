//! Persistent memory backend — SQLite with FTS5 full-text search.
//!
//! Storage: `agents/<id>/workspace/memory.db`
//!
//! Provides ranked keyword search via FTS5/BM25 instead of substring
//! matching, plus efficient upsert and tag filtering.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

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
    conn: Mutex<Connection>,
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
                dim       INTEGER NOT NULL
            );",
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
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

        let conn = self.conn.lock().expect("memory db poisoned");
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
                let inserted = conn.execute(
                    "INSERT OR IGNORE INTO memories (key, value, tags, ts) VALUES (?1, ?2, ?3, ?4)",
                    params![entry.key, entry.value, tags_json, entry.timestamp],
                )?;
                count += inserted;
            }
        }

        if count > 0 {
            // Rename old file so we don't re-import.
            let bak = workspace.join("memory.jsonl.migrated");
            let _ = std::fs::rename(&jsonl_path, &bak);
            tracing::info!(count, "migrated legacy memory.jsonl → memory.db");
        }

        Ok(count)
    }

    /// Upsert a memory entry by key.
    pub fn save(&self, key: &str, value: &str, tags: &[String]) -> anyhow::Result<()> {
        let conn = self.conn.lock().expect("memory db poisoned");
        let tags_json = serde_json::to_string(tags)?;
        let ts = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO memories (key, value, tags, ts)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET value=?2, tags=?3, ts=?4",
            params![key, value, tags_json, ts],
        )?;
        Ok(())
    }

    /// Delete a memory entry by key. Returns true if a row was deleted.
    pub fn forget(&self, key: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().expect("memory db poisoned");
        let deleted = conn.execute("DELETE FROM memories WHERE key = ?1", params![key])?;
        Ok(deleted > 0)
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
        let conn = self.conn.lock().expect("memory db poisoned");

        if query.is_empty() {
            // No search query — return all, optionally filtered by tag.
            let mut stmt = conn.prepare(
                "SELECT key, value, tags, ts FROM memories ORDER BY ts DESC LIMIT ?1",
            )?;
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
                Ok(MemoryEntry {
                    key: row.get(0)?,
                    value: row.get(1)?,
                    tags: parse_tags(&row.get::<_, String>(2)?),
                    timestamp: row.get(3)?,
                    score: Some(row.get::<_, f64>(4)?),
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
    /// Returns at most 50 entries, most recent first, capped at `max_chars`.
    pub fn prompt_block(&self, max_chars: usize) -> String {
        let entries = match self.search("", None, 50) {
            Ok(e) => e,
            Err(_) => return String::new(),
        };
        if entries.is_empty() {
            return String::new();
        }

        let mut block = String::from("<memory>\n");
        for entry in &entries {
            let line = format!("- **{}**: {}\n", entry.key, entry.value);
            if block.len() + line.len() > max_chars {
                break;
            }
            block.push_str(&line);
        }
        block.push_str("</memory>");
        block
    }

    /// Return total number of memory entries.
    pub fn count(&self) -> anyhow::Result<usize> {
        let conn = self.conn.lock().expect("memory db poisoned");
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))?;
        Ok(count as usize)
    }

    // ── Embedding / semantic search ─────────────────────────

    /// Store an embedding vector for a memory key.
    pub fn save_embedding(&self, key: &str, embedding: &[f32]) -> anyhow::Result<()> {
        let conn = self.conn.lock().expect("memory db poisoned");
        let blob = embedding_to_blob(embedding);
        conn.execute(
            "INSERT INTO memory_embeddings (key, embedding, dim)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET embedding=?2, dim=?3",
            params![key, blob, embedding.len() as i64],
        )?;
        Ok(())
    }

    /// Delete a cached embedding for a key.
    pub fn delete_embedding(&self, key: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().expect("memory db poisoned");
        conn.execute("DELETE FROM memory_embeddings WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// Return all keys that have no cached embedding yet.
    pub fn keys_without_embeddings(&self) -> anyhow::Result<Vec<String>> {
        let conn = self.conn.lock().expect("memory db poisoned");
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
        let conn = self.conn.lock().expect("memory db poisoned");
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
}

fn parse_tags(json: &str) -> Vec<String> {
    serde_json::from_str(json).unwrap_or_default()
}

/// Serialize an f32 slice to a compact little-endian byte blob.
fn embedding_to_blob(vec: &[f32]) -> Vec<u8> {
    vec.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize a byte blob back to an f32 vector.
fn blob_to_embedding(blob: &[u8], dim: usize) -> Vec<f32> {
    (0..dim)
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
        store.save("fruit", "I love apples and oranges", &["food".into()]).unwrap();
        store.save("pet", "My cat is named Whiskers", &["animals".into()]).unwrap();
        store.save("snack", "Apple pie is the best dessert", &["food".into()]).unwrap();

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
        assert!(block.starts_with("<memory>"));
        assert!(block.ends_with("</memory>"));
        assert!(block.contains("**name**"));
        assert!(block.contains("**goal**"));
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
            store.save(&format!("k{i}"), &format!("value {i}"), &[]).unwrap();
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
        assert!(block.starts_with("<memory>"));
        assert!(block.ends_with("</memory>"));
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
        store.save("a", "the sun is bright", &["sky".into()]).unwrap();
        store.save("b", "the sun rises early", &["time".into()]).unwrap();

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
        let original: Vec<f32> = vec![1.0, -0.5, 0.0, 3.14, -2.71];
        let blob = embedding_to_blob(&original);
        let recovered = blob_to_embedding(&blob, original.len());
        assert_eq!(original, recovered);
    }

    #[test]
    fn cosine_similarity_identical_vectors() {
        let v = vec![1.0f32, 2.0, 3.0];
        let sim = cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 1e-6, "identical vectors should have similarity ~1.0");
    }

    #[test]
    fn cosine_similarity_orthogonal_vectors() {
        let a = vec![1.0f32, 0.0];
        let b = vec![0.0f32, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6, "orthogonal vectors should have similarity ~0.0");
    }

    #[test]
    fn cosine_similarity_opposite_vectors() {
        let a = vec![1.0f32, 2.0, 3.0];
        let b = vec![-1.0f32, -2.0, -3.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 1e-6, "opposite vectors should have similarity ~-1.0");
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
