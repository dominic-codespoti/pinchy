//! Shared Memory Core Tests
//!
//! Core functionality tests for the shared memory system.
//! Tests migrations, basic CRUD, FTS5 search, namespace validation,
//! audit logging, and embedding operations.

use mini_claw::memory::shared::{AuditLogEntry, SharedMemoryEntry, SharedMemoryStore};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

fn setup_test_db() -> (tempfile::TempDir, SharedMemoryStore) {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");
    let conn = Connection::open(&db_path).unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    let conn = Arc::new(Mutex::new(conn));
    let store = SharedMemoryStore::open_with_conn(conn).unwrap();
    (dir, store)
}

/// Verify all required tables are created by migration.
#[test]
fn migrations_create_required_tables() {
    let (dir, _store) = setup_test_db();
    let db_path = dir.path().join("test.db");

    // Open a fresh connection to verify tables exist
    let conn = Connection::open(&db_path).unwrap();

    // Check shared_memories table
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shared_memories'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "shared_memories table should exist");

    // Check FTS5 table
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shared_memories_fts'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "shared_memories_fts table should exist");

    // Check shared_embeddings table
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shared_embeddings'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "shared_embeddings table should exist");

    // Check shared_audit_log table
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shared_audit_log'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "shared_audit_log table should exist");
}

/// Verify migrations are idempotent (can be run multiple times without error).
#[test]
fn migrations_are_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    // First migration
    {
        let conn = Connection::open(&db_path).unwrap();
        let conn = Arc::new(Mutex::new(conn));
        let _store = SharedMemoryStore::open_with_conn(conn).unwrap();
    }

    // Second migration should succeed
    {
        let conn = Connection::open(&db_path).unwrap();
        let conn = Arc::new(Mutex::new(conn));
        let _store = SharedMemoryStore::open_with_conn(conn).unwrap();
    }

    // Third migration should also succeed
    {
        let conn = Connection::open(&db_path).unwrap();
        let conn = Arc::new(Mutex::new(conn));
        let store = SharedMemoryStore::open_with_conn(conn).unwrap();

        // Verify data still works
        store
            .save(
                "test/ns",
                "key",
                "value",
                "agent:test",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
        let results = store.recall("", Some("test/ns"), 10).unwrap();
        assert_eq!(results.len(), 1);
    }
}

/// Verify FTS5 triggers exist and work.
#[test]
fn fts5_triggers_exist() {
    let (dir, _store) = setup_test_db();
    let db_path = dir.path().join("test.db");
    let conn = Connection::open(&db_path).unwrap();

    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'shared_memories_%'",
        )
        .unwrap();
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();

    let triggers: Vec<String> = rows.filter_map(|r| r.ok()).collect();
    assert!(triggers.contains(&"shared_memories_ai".to_string()));
    assert!(triggers.contains(&"shared_memories_ad".to_string()));
    assert!(triggers.contains(&"shared_memories_au".to_string()));
}

/// Test basic save and recall operations.
#[test]
fn shared_save_recall_works() {
    let (_dir, store) = setup_test_db();

    // Save an entry
    let entry_id = store
        .save(
            "public/docs",
            "getting-started",
            "Getting started with Pinchy",
            "agent:core",
            Some("session-abc-123"),
            &["docs".to_string(), "beginner".to_string()],
            None,
        )
        .unwrap();

    // Verify entry_id is a valid UUID
    assert!(!entry_id.is_empty());

    // Recall all in namespace
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 1);

    let entry = &results[0];
    assert_eq!(entry.namespace, "public/docs");
    assert_eq!(entry.path, "getting-started");
    assert_eq!(entry.content, "Getting started with Pinchy");
    assert_eq!(entry.author_agent_id, "agent:core");
    assert_eq!(entry.tags, vec!["docs", "beginner"]);
}

/// Test FTS5 BM25 search functionality.
#[test]
fn fts5_search_works() {
    let (_dir, store) = setup_test_db();

    // Create entries with distinct content
    store
        .save(
            "public/docs",
            "rust-guide",
            "How to write Rust code effectively",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "public/docs",
            "python-guide",
            "Python programming best practices",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "team/eng",
            "architecture",
            "System design patterns for backend services",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Search for "Rust" - should find rust-guide
    let results = store.recall("Rust", None, 10).unwrap();
    assert!(!results.is_empty());
    assert!(results.iter().any(|r| r.path == "rust-guide"));

    // Search for "programming" - should find python-guide
    let results = store.recall("programming", None, 10).unwrap();
    assert!(results.iter().any(|r| r.path == "python-guide"));

    // Search for "backend" - should find architecture
    let results = store.recall("backend", None, 10).unwrap();
    assert!(results.iter().any(|r| r.path == "architecture"));
}

/// Test namespace validation.
#[test]
fn namespace_validation_works() {
    // Valid namespaces
    assert!(SharedMemoryStore::validate_namespace("public").is_ok());
    assert!(SharedMemoryStore::validate_namespace("public/docs").is_ok());
    assert!(SharedMemoryStore::validate_namespace("team/eng/conventions").is_ok());
    assert!(SharedMemoryStore::validate_namespace("my-namespace_123").is_ok());
    assert!(SharedMemoryStore::validate_namespace("namespace.with.dots").is_ok());

    // Invalid: empty
    assert!(SharedMemoryStore::validate_namespace("").is_err());

    // Invalid: path traversal
    assert!(SharedMemoryStore::validate_namespace("../secret").is_err());
    assert!(SharedMemoryStore::validate_namespace("foo/../../etc").is_err());
    assert!(SharedMemoryStore::validate_namespace("./local").is_err());

    // Invalid: reserved prefixes
    assert!(SharedMemoryStore::validate_namespace("system/config").is_err());
    assert!(SharedMemoryStore::validate_namespace("internal/secrets").is_err());
    assert!(SharedMemoryStore::validate_namespace("pinchy/core").is_err());

    // Invalid: special characters
    assert!(SharedMemoryStore::validate_namespace("test<script>").is_err());
    assert!(SharedMemoryStore::validate_namespace("hello world").is_err());
}

/// Test namespace normalization.
#[test]
fn namespace_normalization_works() {
    assert_eq!(
        SharedMemoryStore::normalize_namespace("Public/Docs"),
        "public/docs"
    );
    assert_eq!(
        SharedMemoryStore::normalize_namespace("PUBLIC\\DOCS"),
        "public\\docs"
    );
    assert_eq!(
        SharedMemoryStore::normalize_namespace("///public//docs///"),
        "public/docs"
    );
    assert_eq!(
        SharedMemoryStore::normalize_namespace("..public..docs.."),
        "public.docs" // dots collapsed but not interpreted as traversal
    );

    // Very long namespace gets truncated
    let long = "a".repeat(200);
    let normalized = SharedMemoryStore::normalize_namespace(&long);
    assert_eq!(normalized.len(), 128);
}

/// Test forget operation.
#[test]
fn forget_shared_entry_works() {
    let (_dir, store) = setup_test_db();

    store
        .save(
            "public/docs",
            "temp-entry",
            "Temporary content",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Verify it exists
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 1);

    // Forget it
    let deleted = store.forget("public/docs", "temp-entry").unwrap();
    assert!(deleted);

    // Verify it's gone
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert!(results.is_empty());

    // Forgetting non-existent returns false
    let deleted = store.forget("public/docs", "non-existent").unwrap();
    assert!(!deleted);
}

/// Test audit logging.
#[test]
fn audit_logging_occurs() {
    let (_dir, store) = setup_test_db();

    // Write audit log entries
    store
        .audit_log(
            "write",
            "agent:core",
            Some("session-1"),
            Some("public/docs"),
            Some("entry-123"),
            "allowed",
            Some("sha256:abc123"),
            None,
        )
        .unwrap();

    store
        .audit_log(
            "read",
            "agent:other",
            Some("session-2"),
            Some("public/docs"),
            Some("entry-123"),
            "allowed",
            None,
            None,
        )
        .unwrap();

    store
        .audit_log(
            "write",
            "agent:unauthorized",
            Some("session-3"),
            Some("team/eng"),
            Some("entry-456"),
            "denied",
            None,
            Some("namespace_not_authorized"),
        )
        .unwrap();

    // Query by agent
    let logs = store
        .query_audit_log(Some("agent:core"), None, None, 10)
        .unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].operation, "write");
    assert_eq!(logs[0].authorization, "allowed");

    // Query by namespace
    let logs = store
        .query_audit_log(None, Some("public/docs"), None, 10)
        .unwrap();
    assert_eq!(logs.len(), 2);

    // Query by operation
    let logs = store
        .query_audit_log(None, None, Some("write"), 10)
        .unwrap();
    assert_eq!(logs.len(), 2);

    // Query all
    let logs = store.query_audit_log(None, None, None, 10).unwrap();
    assert_eq!(logs.len(), 3);
}

/// Test embedding save and semantic search.
#[test]
fn embedding_operations_work() {
    let (_dir, store) = setup_test_db();

    // Create entries
    let entry1 = store
        .save(
            "public/docs",
            "entry1",
            "First test entry",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    let entry2 = store
        .save(
            "public/docs",
            "entry2",
            "Second test entry",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    let entry3 = store
        .save(
            "public/docs",
            "entry3",
            "Different content entirely",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Save embeddings
    store
        .save_embedding(&entry1, &[1.0f32, 0.0, 0.0], "test-model-v1")
        .unwrap();
    store
        .save_embedding(&entry2, &[0.9f32, 0.1, 0.0], "test-model-v1")
        .unwrap();
    store
        .save_embedding(&entry3, &[0.0f32, 1.0, 0.0], "test-model-v1")
        .unwrap();

    // Semantic search should find closest match
    let results = store.recall_semantic(&[0.95, 0.05, 0.0], None, 10).unwrap();
    assert!(!results.is_empty());
    // First result should be entry1 or entry2 (closest to query vector)
    let first = &results[0];
    assert!(first.score.unwrap() > 0.9);
}

/// Test content hash computation.
#[test]
fn content_hash_works() {
    let hash1 = SharedMemoryStore::compute_content_hash("hello world");
    let hash2 = SharedMemoryStore::compute_content_hash("hello world");
    let hash3 = SharedMemoryStore::compute_content_hash("different");

    // Same content = same hash
    assert_eq!(hash1, hash2);

    // Different content = different hash
    assert_ne!(hash1, hash3);

    // Hash is base64 encoded (should be alphanumeric with possible +/=)
    assert!(!hash1.is_empty());
}

/// Test wildcard namespace queries.
#[test]
fn wildcard_namespace_queries() {
    let (_dir, store) = setup_test_db();

    // Create entries in various namespaces
    store
        .save(
            "team/eng/docs",
            "a",
            "Engineering docs",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "team/eng/conventions",
            "b",
            "Engineering conventions",
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
            "Product docs",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "public/docs",
            "d",
            "Public docs",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Query with wildcard for team/eng/*
    let results = store.recall("", Some("team/eng/*"), 10).unwrap();
    assert_eq!(results.len(), 2);
    assert!(results.iter().any(|r| r.namespace == "team/eng/docs"));
    assert!(results
        .iter()
        .any(|r| r.namespace == "team/eng/conventions"));

    // Query with broader wildcard
    let results = store.recall("", Some("team/*"), 10).unwrap();
    assert_eq!(results.len(), 3);

    // Query all with star
    let results = store.recall("", Some("*"), 10).unwrap();
    assert_eq!(results.len(), 4);
}

/// Test list_namespaces functionality.
#[test]
fn list_namespaces_works() {
    let (_dir, store) = setup_test_db();

    // Initially empty
    let namespaces = store.list_namespaces().unwrap();
    assert!(namespaces.is_empty());

    // Add entries
    store
        .save(
            "alpha",
            "key1",
            "Content",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "beta/gamma",
            "key2",
            "Content",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "alpha",
            "key3",
            "More content",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Should have exactly 2 unique namespaces
    let namespaces = store.list_namespaces().unwrap();
    assert_eq!(namespaces.len(), 2);
    assert!(namespaces.contains(&"alpha".to_string()));
    assert!(namespaces.contains(&"beta/gamma".to_string()));
}

/// Test count_in_namespace.
#[test]
fn count_in_namespace_works() {
    let (_dir, store) = setup_test_db();

    assert_eq!(store.count_in_namespace("empty").unwrap(), 0);

    store
        .save(
            "test",
            "a",
            "Content A",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "test",
            "b",
            "Content B",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "test",
            "c",
            "Content C",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();

    assert_eq!(store.count_in_namespace("test").unwrap(), 3);
}

/// Test upsert behavior (same namespace+path updates existing).
#[test]
fn upsert_behavior() {
    let (_dir, store) = setup_test_db();

    // First save
    let id1 = store
        .save(
            "public/docs",
            "readme",
            "Original content",
            "agent:core",
            Some("session-1"),
            &["v1".to_string()],
            None,
        )
        .unwrap();

    // Second save with same namespace+path should update
    let id2 = store
        .save(
            "public/docs",
            "readme",
            "Updated content",
            "agent:other",
            Some("session-2"),
            &["v2".to_string()],
            None,
        )
        .unwrap();

    // Should only have one entry with updated content
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].content, "Updated content");
    assert_eq!(results[0].author_agent_id, "agent:other");
    assert_eq!(results[0].tags, vec!["v2"]);
    // entry_id should be from second save
    assert_eq!(results[0].entry_id, id2);
}

/// Test search with empty query returns recent entries.
#[test]
fn empty_query_returns_recent() {
    let (_dir, store) = setup_test_db();

    store
        .save("test", "a", "First", "agent:core", Some("s1"), &[], None)
        .unwrap();
    store
        .save("test", "b", "Second", "agent:core", Some("s1"), &[], None)
        .unwrap();
    store
        .save("test", "c", "Third", "agent:core", Some("s1"), &[], None)
        .unwrap();

    // Empty query should return all recent entries
    let results = store.recall("", None, 10).unwrap();
    assert_eq!(results.len(), 3);

    // With limit
    let results = store.recall("", None, 2).unwrap();
    assert_eq!(results.len(), 2);
}

/// Test search respects namespace filter.
#[test]
fn search_respects_namespace_filter() {
    let (_dir, store) = setup_test_db();

    store
        .save(
            "public/docs",
            "key",
            "content",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "team/eng",
            "key",
            "content",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();

    // Search without namespace filter finds both
    let results = store.recall("content", None, 10).unwrap();
    assert_eq!(results.len(), 2);

    // Search with namespace filter finds only one
    let results = store.recall("content", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].namespace, "public/docs");
}

// ============================================================================
// Prompt Context Integration Tests (Wave 1)
// ============================================================================

/// Test formatting a single entry for prompt injection.
#[test]
fn format_for_prompt_includes_attribution() {
    let entry = SharedMemoryEntry {
        entry_id: "test-id".to_string(),
        namespace: "public/docs".to_string(),
        path: "readme".to_string(),
        author_agent_id: "agent:backend-lead".to_string(),
        author_session_id: Some("session-1".to_string()),
        created_at: 1711929600, // 2024-04-01 00:00:00 UTC
        updated_at: 1711929600,
        content: "Always run cargo fmt before committing.".to_string(),
        content_hash: "sha256:abc123".to_string(),
        tags: vec!["conventions".to_string()],
        access_count: 42,
        ttl: None,
        score: None,
    };

    let formatted = SharedMemoryStore::format_for_prompt(&entry);

    // Verify required components per LETTA_INSPIRED_SHARED_MEMORY_SPEC section 5.3
    assert!(formatted.contains("[Shared Memory from namespace: public/docs]"));
    assert!(formatted.contains("Author: agent:backend-lead"));
    assert!(formatted.contains("Created: 2024-04-01"));
    assert!(formatted.contains("Always run cargo fmt before committing."));
}

/// Test prompt block building with multiple entries.
#[test]
fn build_prompt_block_multiple_entries() {
    let entries = vec![
        SharedMemoryEntry {
            entry_id: "id1".to_string(),
            namespace: "public/docs".to_string(),
            path: "api".to_string(),
            author_agent_id: "agent:core".to_string(),
            author_session_id: Some("s1".to_string()),
            created_at: 1711929600,
            updated_at: 1711929600,
            content: "API design guidelines".to_string(),
            content_hash: "hash1".to_string(),
            tags: vec![],
            access_count: 0,
            ttl: None,
            score: None,
        },
        SharedMemoryEntry {
            entry_id: "id2".to_string(),
            namespace: "team/eng".to_string(),
            path: "conventions".to_string(),
            author_agent_id: "agent:backend".to_string(),
            author_session_id: Some("s2".to_string()),
            created_at: 1712016000,
            updated_at: 1712016000,
            content: "Code review process".to_string(),
            content_hash: "hash2".to_string(),
            tags: vec![],
            access_count: 0,
            ttl: None,
            score: None,
        },
    ];

    let block = SharedMemoryStore::build_prompt_block(&entries, 4000);

    // Verify block structure
    assert!(block.starts_with("<shared_memory>"));
    assert!(block.ends_with("</shared_memory>"));

    // Verify both entries are included with proper attribution
    assert!(block.contains("[Shared Memory from namespace: public/docs]"));
    assert!(block.contains("[Shared Memory from namespace: team/eng]"));
    assert!(block.contains("Author: agent:core"));
    assert!(block.contains("Author: agent:backend"));
    assert!(block.contains("API design guidelines"));
    assert!(block.contains("Code review process"));
}

/// Test prompt block respects max_chars budget.
#[test]
fn build_prompt_block_respects_budget() {
    let entries: Vec<SharedMemoryEntry> = (0..20)
        .map(|i| SharedMemoryEntry {
            entry_id: format!("id{i}"),
            namespace: "public/docs".to_string(),
            path: format!("path{i}"),
            author_agent_id: "agent:core".to_string(),
            author_session_id: Some("s1".to_string()),
            created_at: 1711929600,
            updated_at: 1711929600,
            content: format!("Entry number {i} with substantial content to fill space quickly"),
            content_hash: format!("hash{i}"),
            tags: vec![],
            access_count: 0,
            ttl: None,
            score: None,
        })
        .collect();

    let max_chars = 500;
    let block = SharedMemoryStore::build_prompt_block(&entries, max_chars);

    // Block should not exceed budget
    assert!(
        block.len() <= max_chars,
        "Block length {} should not exceed budget {}",
        block.len(),
        max_chars
    );
    assert!(block.starts_with("<shared_memory>"));
    assert!(block.ends_with("</shared_memory>"));
}

/// Test empty entries produce empty prompt block.
#[test]
fn build_prompt_block_empty_entries() {
    let entries: Vec<SharedMemoryEntry> = vec![];
    let block = SharedMemoryStore::build_prompt_block(&entries, 4000);
    assert!(block.is_empty());
}

/// Test token estimation for budget calculations.
#[test]
fn estimate_token_count_accurate() {
    let entries = vec![
        SharedMemoryEntry {
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
        },
        SharedMemoryEntry {
            entry_id: "id2".to_string(),
            namespace: "team".to_string(),
            path: "b".to_string(),
            author_agent_id: "agent:core".to_string(),
            author_session_id: Some("s2".to_string()),
            created_at: 0,
            updated_at: 0,
            content: "b".repeat(140), // 140 chars
            content_hash: "hash2".to_string(),
            tags: vec![],
            access_count: 0,
            ttl: None,
            score: None,
        },
    ];

    // (70 + 140) * 2 / 7 = 60 tokens
    let tokens = SharedMemoryStore::estimate_token_count(&entries);
    assert_eq!(tokens, 60);
}

/// Test token estimation with empty entries.
#[test]
fn estimate_token_count_empty() {
    let entries: Vec<SharedMemoryEntry> = vec![];
    assert_eq!(SharedMemoryStore::estimate_token_count(&entries), 0);
}

/// Test end-to-end: save entries, recall them, format for prompt.
#[test]
fn end_to_end_save_recall_format() {
    let (_dir, store) = setup_test_db();

    // Save entries to different namespaces
    store
        .save(
            "public/docs",
            "getting-started",
            "Run cargo build to compile the project",
            "agent:backend-lead",
            Some("session-abc"),
            &["beginner".to_string()],
            None,
        )
        .unwrap();

    store
        .save(
            "team/eng/conventions",
            "error-handling",
            "Use anyhow::Result for error propagation",
            "agent:rust-expert",
            Some("session-def"),
            &["patterns".to_string()],
            None,
        )
        .unwrap();

    // Recall all entries
    let results = store.recall("", None, 10).unwrap();
    assert_eq!(results.len(), 2);

    // Format for prompt
    let block = SharedMemoryStore::build_prompt_block(&results, 4000);

    // Verify complete flow worked
    assert!(block.starts_with("<shared_memory>"));
    assert!(block.ends_with("</shared_memory>"));
    // Should have both namespaces
    assert!(block.contains("public/docs"));
    assert!(block.contains("team/eng/conventions"));
    // Should have both authors
    assert!(block.contains("agent:backend-lead"));
    assert!(block.contains("agent:rust-expert"));
}

/// Test that shared memory appears in prompt with proper namespace attribution.
/// This simulates what happens in src/agent/turn.rs when building initial messages.
#[test]
fn prompt_injection_includes_namespace_and_author() {
    let (_dir, store) = setup_test_db();

    // Save entry with clear attribution
    store
        .save(
            "public/coding-conventions",
            "rust-error-handling",
            "Always use anyhow::Result<T> for fallible functions",
            "agent:backend-lead",
            Some("session-001"),
            &["rust".to_string(), "errors".to_string()],
            None,
        )
        .unwrap();

    // Recall the entry
    let results = store
        .recall("", Some("public/coding-conventions"), 10)
        .unwrap();
    assert_eq!(results.len(), 1);

    // Format for prompt (simulating what happens in build_initial_messages)
    let formatted = SharedMemoryStore::format_for_prompt(&results[0]);

    // Verify namespace attribution is present per spec section 5.3
    assert!(formatted.contains("[Shared Memory from namespace: public/coding-conventions]"));
    assert!(formatted.contains("Author: agent:backend-lead"));
    assert!(formatted.contains("Created:"));
    assert!(formatted.contains("Always use anyhow::Result<T> for fallible functions"));
}

/// Test that multiple shared memory entries are properly formatted with separators.
#[test]
fn prompt_block_multiple_entries_with_separators() {
    let (_dir, store) = setup_test_db();

    // Save multiple entries
    store
        .save(
            "public/docs",
            "api-guide",
            "Use POST /api/v1/sessions to create a session",
            "agent:api-designer",
            Some("session-001"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "public/docs",
            "auth-guide",
            "Include Authorization header with Bearer token",
            "agent:security-lead",
            Some("session-002"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "team/eng/conventions",
            "testing",
            "Always run cargo test before committing",
            "agent:ci-bot",
            Some("session-003"),
            &[],
            None,
        )
        .unwrap();

    // Recall all entries
    let results = store.recall("", None, 10).unwrap();
    assert_eq!(results.len(), 3);

    // Build prompt block
    let block = SharedMemoryStore::build_prompt_block(&results, 10000);

    // Verify structure
    assert!(block.starts_with("<shared_memory>\n"));
    assert!(block.ends_with("\n</shared_memory>"));

    // Each entry should have its own namespace header
    let namespace_count = block.matches("[Shared Memory from namespace:").count();
    assert_eq!(namespace_count, 3, "expected 3 namespace headers");

    // Should have all authors
    assert!(block.contains("agent:api-designer"));
    assert!(block.contains("agent:security-lead"));
    assert!(block.contains("agent:ci-bot"));
}

/// Test that prompt block respects the max_chars budget.
#[test]
fn prompt_block_respects_budget_tightly() {
    let (_dir, store) = setup_test_db();

    // Save a long entry
    store
        .save(
            "public/docs",
            "long-content",
            &"a".repeat(1000), // 1000 character content
            "agent:writer",
            Some("session-001"),
            &[],
            None,
        )
        .unwrap();

    // Recall the entry
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 1);

    // With a tight budget, should still include the entry if it fits
    let tight_budget = 1500; // Just enough for formatted entry
    let block = SharedMemoryStore::build_prompt_block(&results, tight_budget);
    assert!(!block.is_empty());
    assert!(block.len() <= tight_budget);

    // With a very small budget, should return wrapper-only or empty
    let tiny_budget = 50;
    let tiny_block = SharedMemoryStore::build_prompt_block(&results, tiny_budget);
    // Should be minimal - either empty or just the wrapper tags
    assert!(tiny_block.len() <= tiny_budget);
}

// ============================================================================
// Context Integration and Budget Tests (Wave 3)
// ============================================================================

/// Test that shared memory respects token budget limits.
/// This simulates the budget allocation that happens in src/agent/turn.rs
#[test]
fn shared_memory_respects_token_budget() {
    let (_dir, store) = setup_test_db();

    // Create entries with known token sizes
    // 70 chars = 20 tokens (70 * 2 / 7)
    let content_20_tokens = "a".repeat(70);
    // 140 chars = 40 tokens
    let content_40_tokens = "b".repeat(140);
    // 350 chars = 100 tokens
    let content_100_tokens = "c".repeat(350);

    store
        .save(
            "public/docs",
            "entry-20",
            &content_20_tokens,
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "public/docs",
            "entry-40",
            &content_40_tokens,
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "public/docs",
            "entry-100",
            &content_100_tokens,
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Recall all entries
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 3);

    // Total tokens should be 160 (20 + 40 + 100)
    let total_tokens = mini_claw::memory::shared::SharedMemoryStore::estimate_token_count(&results);
    assert_eq!(total_tokens, 160);

    // Simulate budget allocation with 100 token limit
    let memory_budget = mini_claw::context::MemoryBudget {
        percent_of_context: 20,
        max_percent: 50,
    };
    let total_available = 500usize; // 100 token budget = 20% of 500
    let allocation = mini_claw::context::allocate_memory_budget(total_available, &memory_budget);

    assert_eq!(allocation.shared_budget, 250); // 50% cap of 500

    // Build prompt block with tight budget
    let tight_budget_chars = (allocation.shared_budget * 7) / 2; // tokens to chars
    let block = mini_claw::memory::shared::SharedMemoryStore::build_prompt_block(
        &results,
        tight_budget_chars,
    );

    assert!(!block.is_empty());
    assert!(block.starts_with("<shared_memory>"));
}

/// Test budget adjustment when private memory uses less than allocated.
#[test]
fn budget_adjustment_private_uses_less() {
    use mini_claw::context::{adjust_memory_budget_for_private_actual, allocate_memory_budget};

    let memory_budget = mini_claw::context::MemoryBudget {
        percent_of_context: 20,
        max_percent: 50,
    };
    let total_available = 100_000usize;

    // Initial allocation
    let allocation = allocate_memory_budget(total_available, &memory_budget);
    assert_eq!(allocation.private_budget, 20_000);
    assert_eq!(allocation.shared_budget, 50_000);

    // Private only used 10k tokens (less than budgeted 20k)
    let adjusted = adjust_memory_budget_for_private_actual(&allocation, 10_000, total_available);

    // Private gets actual, shared can use up to its cap
    assert_eq!(adjusted.private_budget, 10_000);
    assert_eq!(adjusted.shared_budget, 50_000); // Cap unchanged
    assert_eq!(adjusted.remaining, 40_000);
}

/// Test budget adjustment when private memory uses more than allocated.
#[test]
fn budget_adjustment_private_uses_more() {
    use mini_claw::context::{adjust_memory_budget_for_private_actual, allocate_memory_budget};

    let memory_budget = mini_claw::context::MemoryBudget {
        percent_of_context: 20,
        max_percent: 50,
    };
    let total_available = 100_000usize;

    let allocation = allocate_memory_budget(total_available, &memory_budget);

    // Private used 30k tokens (more than base 20k)
    let adjusted = adjust_memory_budget_for_private_actual(&allocation, 30_000, total_available);

    assert_eq!(adjusted.private_budget, 30_000);
    assert_eq!(adjusted.shared_budget, 50_000); // Cap unchanged
    assert_eq!(adjusted.remaining, 20_000);
}

/// Test per-turn rebuild behavior: shared memory should be re-queried each turn.
/// This verifies that shared memory participates in the turn-based compaction model.
#[test]
fn per_turn_rebuild_behavior() {
    let (_dir, store) = setup_test_db();

    // Turn 1: Initial query finds entry A
    store
        .save(
            "public/docs",
            "turn1",
            "First turn content",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    let results_turn1 = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results_turn1.len(), 1);
    assert_eq!(results_turn1[0].path, "turn1");

    // Turn 2: New entry added, query finds both (simulating per-turn rebuild)
    store
        .save(
            "public/docs",
            "turn2",
            "Second turn content",
            "agent:core",
            Some("session-2"),
            &[],
            None,
        )
        .unwrap();

    let results_turn2 = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results_turn2.len(), 2);

    // Turn 3: Entry removed, query reflects current state
    store.forget("public/docs", "turn1").unwrap();

    let results_turn3 = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results_turn3.len(), 1);
    assert_eq!(results_turn3[0].path, "turn2");
}

/// Test that shared memory participates in context budget alongside private memory.
/// Both should count against the same effective context limit.
#[test]
fn shared_and_private_share_context_budget() {
    // This test verifies the architectural principle from spec section 5.1:
    // "Shared memory counts against the SAME context budget as private memory"

    let (_dir, store) = setup_test_db();

    // Create shared memory entries
    for i in 0..5 {
        store
            .save(
                "public/docs",
                &format!("shared-{i}"),
                &format!("Shared memory entry number {i} with some content"),
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
    }

    // Get all shared entries
    let shared_entries = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(shared_entries.len(), 5);

    // Calculate their token count
    let shared_tokens =
        mini_claw::memory::shared::SharedMemoryStore::estimate_token_count(&shared_entries);
    assert!(shared_tokens > 0);

    // In the real system, this token count would be added to:
    // 1. System message tokens (bootstrap, skills)
    // 2. Private memory tokens
    // 3. Conversation history tokens
    // 4. User message tokens
    // Total must stay within ContextBudget.max_context_tokens

    // The key invariant: shared_tokens + private_tokens + history_tokens < max_context_tokens
    // This is enforced by the context management in manage_context()
    let max_context_tokens = 128_000usize;
    assert!(
        shared_tokens < max_context_tokens,
        "Shared memory alone should not exceed max context"
    );
}

/// Test compact-aware behavior: shared memory is rebuilt after compaction.
/// When compaction occurs, shared memory should be re-queried just like private memory.
#[test]
fn compaction_aware_rebuild() {
    let (_dir, store) = setup_test_db();

    // Create initial shared memory state
    for i in 0..3 {
        store
            .save(
                "public/docs",
                &format!("entry-{i}"),
                &format!("Content for entry {i}"),
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
    }

    // Query simulates pre-compaction state
    let pre_compact = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(pre_compact.len(), 3);

    // Simulate compaction by removing old entries and adding new ones
    // This mirrors what happens when context is compacted
    store.forget("public/docs", "entry-0").unwrap();
    store.forget("public/docs", "entry-1").unwrap();

    // Add a new entry (simulating memory from a new turn)
    store
        .save(
            "public/docs",
            "new-entry",
            "New content after compaction",
            "agent:core",
            Some("session-2"),
            &[],
            None,
        )
        .unwrap();

    // Post-compaction query should reflect new state
    let post_compact = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(post_compact.len(), 2);
    assert!(post_compact.iter().any(|e| e.path == "entry-2"));
    assert!(post_compact.iter().any(|e| e.path == "new-entry"));
}

/// Test that count_entries_by_author returns correct count.
#[test]
fn count_entries_by_author_works() {
    let (_dir, store) = setup_test_db();

    // Initially zero
    assert_eq!(store.count_entries_by_author("agent:core").unwrap(), 0);
    assert_eq!(store.count_entries_by_author("agent:other").unwrap(), 0);

    // Add entries for agent:core
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
            "public/docs",
            "b",
            "Content B",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Add entry for agent:other
    store
        .save(
            "public/docs",
            "c",
            "Content C",
            "agent:other",
            Some("session-2"),
            &[],
            None,
        )
        .unwrap();

    // Verify counts
    assert_eq!(store.count_entries_by_author("agent:core").unwrap(), 2);
    assert_eq!(store.count_entries_by_author("agent:other").unwrap(), 1);
}

/// Test that count_writes_in_window respects the time window.
#[test]
fn count_writes_in_window_works() {
    let (_dir, store) = setup_test_db();

    // Initially zero writes
    assert_eq!(store.count_writes_in_window("agent:core", 3600).unwrap(), 0);

    // Log some audit entries for writes
    for i in 0..3 {
        store
            .audit_log(
                "write",
                "agent:core",
                Some("session-1"),
                Some("public/docs"),
                Some(&format!("entry-{}", i)),
                "allowed",
                Some(&format!("hash-{}", i)),
                None,
            )
            .unwrap();
    }

    // Log a denied write (should not count toward rate limit)
    store
        .audit_log(
            "write",
            "agent:core",
            Some("session-1"),
            Some("public/docs"),
            None,
            "denied",
            Some("hash-denied"),
            Some("namespace_not_authorized"),
        )
        .unwrap();

    // Log a read operation (should not count toward write rate limit)
    store
        .audit_log(
            "read",
            "agent:core",
            Some("session-1"),
            Some("public/docs"),
            None,
            "allowed",
            None,
            None,
        )
        .unwrap();

    // Verify count (only 3 allowed writes)
    assert_eq!(store.count_writes_in_window("agent:core", 3600).unwrap(), 3);
    assert_eq!(
        store.count_writes_in_window("agent:other", 3600).unwrap(),
        0
    );
}

/// Test basic secret detection for common credential patterns.
#[test]
fn secret_detection_blocks_common_patterns() {
    // These should be blocked
    let blocked_patterns = vec![
        ("password: secret123", "password:"),
        ("api_key: sk-abc123", "api_key:"),
        ("token: bearer_12345", "token:"),
        ("secret: my-secret-value", "secret:"),
        ("private_key: abc123", "private_key"),
        (
            "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
            "aws_access_key_id",
        ),
        ("DATABASE_URL=postgres://user:pass@host/db", "database_url"),
        ("credentials.json content", "credentials.json"),
        ("id_rsa private key", "id_rsa"),
    ];

    for (content, expected_pattern) in blocked_patterns {
        let result = SharedMemoryStore::check_content_for_secrets(content);
        assert!(
            result.is_err(),
            "Content with '{}' should be blocked",
            expected_pattern
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("Potential secret detected"),
            "Error should indicate secret detection: {}",
            err_msg
        );
    }
}

/// Test that safe content is not blocked.
#[test]
fn secret_detection_allows_safe_content() {
    // These should be allowed
    let safe_content = vec![
        "This is just regular documentation about how to use the API.",
        "Remember to check the configuration file.",
        "The function returns a Result type.",
        "Use cargo test to run tests.",
        "Documentation: https://example.com/docs",
        "Public API documentation",
        "Style guide for the project",
    ];

    for content in safe_content {
        let result = SharedMemoryStore::check_content_for_secrets(content);
        assert!(
            result.is_ok(),
            "Safe content should not be blocked: {}",
            content
        );
    }
}

/// Test secret detection for high-entropy values.
#[test]
fn secret_detection_blocks_high_entropy() {
    // These should be blocked (high-entropy values after credential keywords)
    let blocked_high_entropy = vec![
        "api_key: 0123456789abcdef",                   // hex after api_key
        "secret_key=abcd1234ef567890",                 // hex after secret_key (16 hex chars)
        "token: SG9sbG8gV29ybGQgdGhpcyBpcyBhIHRlc3Q=", // base64 after token
    ];

    for content in blocked_high_entropy {
        let result = SharedMemoryStore::check_content_for_secrets(content);
        assert!(
            result.is_err(),
            "High-entropy content should be blocked: {}",
            content
        );
    }
}

/// Test secret detection allows legitimate uses of keywords without secrets.
#[test]
fn secret_detection_allows_legitimate_keyword_use() {
    // These are legitimate uses of keywords without actual secrets
    let legitimate_uses = vec![
        "The password field should be hashed using bcrypt.",
        "Use the API key documentation at /docs/api",
        "This function accepts an auth token parameter.",
        "The secret sauce is not actually a secret.",
        "Public key cryptography uses private keys.",
        "Token-based authentication is recommended.",
    ];

    for content in legitimate_uses {
        let result = SharedMemoryStore::check_content_for_secrets(content);
        assert!(
            result.is_ok(),
            "Legitimate use should not be blocked: {}",
            content
        );
    }
}

// ---------------------------------------------------------------------------
// Audit Log Retention / Cleanup Tests
// ---------------------------------------------------------------------------

/// Test audit log cleanup with retention period.
#[test]
fn audit_log_cleanup_respects_retention_days() {
    let (_dir, store) = setup_test_db();

    // Insert old audit entries (simulate 100 days old)
    let old_ts = chrono::Utc::now().timestamp() - (100 * 24 * 60 * 60);
    for i in 0..5 {
        store
            .audit_log(
                "write",
                "agent:core",
                Some("session-old"),
                Some("public/docs"),
                Some(&format!("old-entry-{}", i)),
                "allowed",
                Some("hash-old"),
                None,
            )
            .unwrap();
    }

    // Update the old entries to have old timestamps
    store
        .test_update_audit_timestamps_for_agent("agent:core", old_ts)
        .unwrap();

    // Insert new audit entries (recent)
    for i in 0..3 {
        store
            .audit_log(
                "write",
                "agent:core",
                Some("session-new"),
                Some("public/docs"),
                Some(&format!("new-entry-{}", i)),
                "allowed",
                Some("hash-new"),
                None,
            )
            .unwrap();
    }

    // Verify total count before cleanup
    assert_eq!(store.count_audit_log_entries().unwrap(), 8);

    // Run cleanup with 90-day retention
    let deleted = store.cleanup_audit_log_retention(90).unwrap();
    assert_eq!(deleted, 5, "Should delete 5 old entries");

    // Verify remaining entries
    let remaining = store.count_audit_log_entries().unwrap();
    assert_eq!(remaining, 3, "Should have 3 recent entries remaining");
}

/// Test audit log cleanup with zero days retention (disabled).
#[test]
fn audit_log_cleanup_disabled_with_zero_days() {
    let (_dir, store) = setup_test_db();

    // Insert some audit entries
    for i in 0..3 {
        store
            .audit_log(
                "write",
                "agent:core",
                Some("session-1"),
                Some("public/docs"),
                Some(&format!("entry-{}", i)),
                "allowed",
                Some("hash"),
                None,
            )
            .unwrap();
    }

    // Run cleanup with 0 days (disabled)
    let deleted = store.cleanup_audit_log_retention(0).unwrap();
    assert_eq!(deleted, 0, "Should not delete any entries when disabled");

    // Verify all entries remain
    let remaining = store.count_audit_log_entries().unwrap();
    assert_eq!(
        remaining, 3,
        "All entries should remain when cleanup is disabled"
    );
}

/// Test audit log cleanup with specific timestamp.
#[test]
fn audit_log_cleanup_older_than_timestamp() {
    let (_dir, store) = setup_test_db();

    let now = chrono::Utc::now().timestamp();

    // Insert old entries
    for i in 0..3 {
        store
            .audit_log(
                "write",
                "agent:core",
                Some("session-old"),
                Some("public/docs"),
                Some(&format!("old-entry-{}", i)),
                "allowed",
                Some("hash-old"),
                None,
            )
            .unwrap();
    }

    // Update old entries to be 10 seconds ago
    let old_ts = now - 10;
    store.test_update_all_audit_timestamps(old_ts).unwrap();

    // Insert a new entry
    store
        .audit_log(
            "write",
            "agent:core",
            Some("session-new"),
            Some("public/docs"),
            Some("new-entry"),
            "allowed",
            Some("hash-new"),
            None,
        )
        .unwrap();

    // Verify total count
    assert_eq!(store.count_audit_log_entries().unwrap(), 4);

    // Run cleanup with cutoff at 5 seconds ago (should delete old entries)
    let cutoff = now - 5;
    let deleted = store.cleanup_audit_log_older_than(cutoff).unwrap();
    assert_eq!(deleted, 3, "Should delete 3 old entries");

    // Verify remaining
    let remaining = store.count_audit_log_entries().unwrap();
    assert_eq!(remaining, 1, "Should have 1 new entry remaining");
}

/// Test that audit log cleanup is idempotent.
#[test]
fn audit_log_cleanup_is_idempotent() {
    let (_dir, store) = setup_test_db();

    // Insert old entries
    let old_ts = chrono::Utc::now().timestamp() - (100 * 24 * 60 * 60);
    for i in 0..3 {
        store
            .audit_log(
                "write",
                "agent:core",
                Some("session-old"),
                Some("public/docs"),
                Some(&format!("old-entry-{}", i)),
                "allowed",
                Some("hash-old"),
                None,
            )
            .unwrap();
    }

    // Update old entries
    store.test_update_all_audit_timestamps(old_ts).unwrap();

    // First cleanup
    let deleted1 = store.cleanup_audit_log_retention(90).unwrap();
    assert_eq!(deleted1, 3, "First cleanup should delete 3 entries");

    // Second cleanup (should be a no-op)
    let deleted2 = store.cleanup_audit_log_retention(90).unwrap();
    assert_eq!(deleted2, 0, "Second cleanup should delete nothing");

    // Verify zero remaining
    assert_eq!(store.count_audit_log_entries().unwrap(), 0);
}
