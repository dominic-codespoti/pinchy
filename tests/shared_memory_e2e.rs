//! Shared Memory E2E Tests
//!
//! End-to-end tests for shared memory that exercise cross-layer behavior
//! through real tool boundaries as much as possible.

use mini_claw::config::shared_memory::{NamespaceAcl, SharedMemoryConfig};
use mini_claw::memory::shared::SharedMemoryStore;
use rusqlite::Connection;
use serde_json::json;
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

/// Test private memory behavior when namespace is omitted (no regression).
/// This verifies the existing MemoryStore still works without namespace support.
#[test]
fn private_memory_no_regression() {
    use mini_claw::memory::MemoryStore;

    let dir = tempfile::tempdir().unwrap();
    let store = MemoryStore::open(dir.path()).unwrap();

    // Save without namespace (traditional private memory)
    store
        .save("my-key", "my-value", &["tag1".to_string()])
        .unwrap();

    // Recall without namespace
    let results = store.search("", None, 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].key, "my-key");
    assert_eq!(results[0].value, "my-value");
    assert_eq!(results[0].tags, vec!["tag1"]);

    // Forget without namespace
    let deleted = store.forget("my-key").unwrap();
    assert!(deleted);

    let results = store.search("", None, 10).unwrap();
    assert!(results.is_empty());
}

/// Test authorized shared write and cross-agent recall.
#[test]
fn authorized_cross_agent_recall() {
    let (_dir, store) = setup_test_db();

    // Agent A writes to shared memory
    store
        .save(
            "public/docs",
            "conventions",
            "Always use snake_case for Rust",
            "agent:backend-lead",
            Some("session-a"),
            &["rust".to_string(), "style".to_string()],
            None,
        )
        .unwrap();

    // Agent B recalls the entry
    let results = store.recall("snake_case", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].author_agent_id, "agent:backend-lead");
    assert_eq!(results[0].content, "Always use snake_case for Rust");

    // Verify cross-agent recall works
    assert!(results[0].content.contains("snake_case"));
}

/// Test config-based authorization (ACL checks).
#[test]
fn config_based_authorization() {
    let mut config = SharedMemoryConfig::default();
    config.enabled = true;

    // Setup ACL: public readable by all, writable only by core
    let mut public_acl = NamespaceAcl::default();
    public_acl.read = vec!["*".to_string()];
    public_acl.write = vec!["agent:core".to_string()];
    config.namespaces.insert("public".to_string(), public_acl);

    // Setup ACL: team/eng readable by backend agents only
    let mut eng_acl = NamespaceAcl::default();
    eng_acl.read = vec!["agent:backend-*".to_string()];
    eng_acl.write = vec!["agent:backend-lead".to_string()];
    config.namespaces.insert("team/eng".to_string(), eng_acl);

    // Test read authorization
    assert!(config.can_read("any-agent", "public"));
    assert!(config.can_read("agent:core", "public"));

    assert!(config.can_read("agent:backend-lead", "team/eng"));
    assert!(config.can_read("agent:backend-worker", "team/eng"));
    assert!(!config.can_read("agent:frontend", "team/eng"));

    // Test write authorization
    assert!(config.can_write("agent:core", "public"));
    assert!(!config.can_write("agent:other", "public"));

    assert!(config.can_write("agent:backend-lead", "team/eng"));
    assert!(!config.can_write("agent:backend-worker", "team/eng"));
    assert!(!config.can_write("agent:frontend", "team/eng"));
}

/// Test unauthorized access is blocked via config.
#[test]
fn unauthorized_access_blocked() {
    let mut config = SharedMemoryConfig::default();
    config.enabled = true;

    // Only agent:admin can access secret namespace
    let mut secret_acl = NamespaceAcl::default();
    secret_acl.read = vec!["agent:admin".to_string()];
    secret_acl.write = vec!["agent:admin".to_string()];
    config.namespaces.insert("secret".to_string(), secret_acl);

    // Unauthorized agent cannot read
    assert!(!config.can_read("agent:regular", "secret"));
    assert!(!config.can_write("agent:regular", "secret"));

    // Authorized agent can access
    assert!(config.can_read("agent:admin", "secret"));
    assert!(config.can_write("agent:admin", "secret"));
}

/// Test wildcard namespace behavior.
#[test]
fn wildcard_namespace_behavior() {
    let (_dir, store) = setup_test_db();

    // Create entries across namespaces
    store
        .save(
            "team/eng/docs",
            "api",
            "API design patterns",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "team/eng/conventions",
            "style",
            "Code style guide",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "team/product",
            "roadmap",
            "Product roadmap",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();

    // Query with wildcard pattern "team/eng/*"
    let results = store.recall("", Some("team/eng/*"), 10).unwrap();
    assert_eq!(results.len(), 2);

    // Query with broader wildcard
    let results = store.recall("", Some("team/*"), 10).unwrap();
    assert_eq!(results.len(), 3);

    // Query with root wildcard
    let results = store.recall("", Some("*"), 10).unwrap();
    assert_eq!(results.len(), 3);
}

/// Test feature flag disables shared behavior.
#[test]
fn feature_flag_disables_shared() {
    let mut config = SharedMemoryConfig::default();
    config.enabled = false; // Disabled

    // Setup generous ACLs
    let mut acl = NamespaceAcl::default();
    acl.read = vec!["*".to_string()];
    acl.write = vec!["*".to_string()];
    config.namespaces.insert("public".to_string(), acl);

    // When disabled, no access allowed
    assert!(!config.can_read("any", "public"));
    assert!(!config.can_write("any", "public"));

    // When enabled, access allowed
    config.enabled = true;
    assert!(config.can_read("any", "public"));
    assert!(config.can_write("any", "public"));
}

/// Test memory budget configuration.
#[test]
fn memory_budget_config() {
    let config = SharedMemoryConfig::default();

    // Default values
    assert_eq!(config.memory_budget.percent_of_context, 20);
    assert_eq!(config.memory_budget.max_percent, 50);

    // Test budget calculations
    let total_tokens = 100000usize;
    let memory_budget =
        (total_tokens as f32 * config.memory_budget.percent_of_context as f32 / 100.0) as usize;
    assert_eq!(memory_budget, 20000);

    let max_memory =
        (total_tokens as f32 * config.memory_budget.max_percent as f32 / 100.0) as usize;
    assert_eq!(max_memory, 50000);
}

/// Test degraded embedding path with BM25 fallback semantics.
#[test]
fn embedding_degradation_safe() {
    let (_dir, store) = setup_test_db();

    // Create entries
    store
        .save(
            "public/docs",
            "entry1",
            "Machine learning concepts",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();
    store
        .save(
            "public/docs",
            "entry2",
            "Deep learning neural networks",
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();

    // Save embedding for only one entry (simulating partial embedding coverage)
    let entry1_id = store
        .recall("", Some("public/docs"), 10)
        .unwrap()
        .into_iter()
        .find(|e| e.path == "entry1")
        .map(|e| e.entry_id)
        .unwrap();

    store
        .save_embedding(&entry1_id, &[1.0f32, 0.0, 0.0], "model-v1")
        .unwrap();

    // BM25 search still works for all entries
    let results = store.recall("learning", None, 10).unwrap();
    assert_eq!(results.len(), 2);

    // Semantic search only returns embedded entry
    let results = store.recall_semantic(&[0.99, 0.01, 0.0], None, 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].path, "entry1");

    // BM25 search still works even when semantic doesn't find match
    let results = store.recall("neural", None, 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].path, "entry2");
}

/// Test content size validation.
#[test]
fn content_size_validation() {
    let mut config = SharedMemoryConfig::default();
    config.max_entry_size = 100;

    // Small content passes
    assert!(config.validate_content_size("small").is_ok());

    // Content at limit passes
    let at_limit = "a".repeat(100);
    assert!(config.validate_content_size(&at_limit).is_ok());

    // Content over limit fails
    let over_limit = "a".repeat(101);
    assert!(config.validate_content_size(&over_limit).is_err());
}

/// Test content hashing provides integrity.
#[test]
fn content_hash_integrity() {
    let (_dir, store) = setup_test_db();

    let content = "Important configuration data";
    let hash1 = SharedMemoryStore::compute_content_hash(content);
    let hash2 = SharedMemoryStore::compute_content_hash(content);

    // Same content produces same hash
    assert_eq!(hash1, hash2);

    // Store entry and verify hash is persisted
    store
        .save(
            "config",
            "settings",
            content,
            "agent:core",
            Some("s1"),
            &[],
            None,
        )
        .unwrap();

    let results = store.recall("", Some("config"), 10).unwrap();
    assert_eq!(results[0].content_hash, hash1);

    // Different content produces different hash
    let different_hash = SharedMemoryStore::compute_content_hash("Different data");
    assert_ne!(hash1, different_hash);
}

/// Test namespace parent prefix matching.
#[test]
fn namespace_parent_prefix_matching() {
    let mut config = SharedMemoryConfig::default();
    config.enabled = true;

    // Setup ACL for parent namespace
    let mut acl = NamespaceAcl::default();
    acl.read = vec!["agent:team-member".to_string()];
    acl.write = vec!["agent:team-lead".to_string()];
    config.namespaces.insert("team/eng".to_string(), acl);

    // Child namespaces should inherit permissions
    assert!(config.can_read("agent:team-member", "team/eng"));
    assert!(config.can_read("agent:team-member", "team/eng/docs"));
    assert!(config.can_read("agent:team-member", "team/eng/conventions"));

    assert!(config.can_write("agent:team-lead", "team/eng"));
    assert!(config.can_write("agent:team-lead", "team/eng/docs"));

    // Non-team member should not access
    assert!(!config.can_read("agent:outsider", "team/eng"));
    assert!(!config.can_read("agent:outsider", "team/eng/docs"));
}

/// Test TTL (time-to-live) expiration filtering.
#[test]
fn ttl_expiration_filtering() {
    let (_dir, store) = setup_test_db();

    let now = chrono::Utc::now().timestamp();

    // Create entry with future TTL (not expired)
    store
        .save(
            "test",
            "future",
            "Future content",
            "agent:core",
            Some("s1"),
            &[],
            Some(now + 86400), // 1 day from now
        )
        .unwrap();

    // Create entry with past TTL (expired) - still stored but filtered in recall
    store
        .save(
            "test",
            "past",
            "Past content",
            "agent:core",
            Some("s1"),
            &[],
            Some(now - 1), // 1 second ago
        )
        .unwrap();

    // Recall should only return non-expired entry
    let results = store.recall("", Some("test"), 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].path, "future");
}

/// Test structured JSON error responses for shared memory operations.
#[test]
fn structured_error_responses() {
    // Test various error scenarios produce appropriate errors

    // Empty namespace validation
    let result = SharedMemoryStore::validate_namespace("");
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("empty"));

    // Path traversal detection
    let result = SharedMemoryStore::validate_namespace("../etc/passwd");
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("traversal"));

    // Reserved prefix detection
    let result = SharedMemoryStore::validate_namespace("system/secrets");
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("reserved"));
}

/// Test agent pattern matching with various wildcards.
#[test]
fn agent_pattern_matching() {
    let mut config = SharedMemoryConfig::default();
    config.enabled = true;

    let mut acl = NamespaceAcl::default();
    acl.read = vec![
        "agent:core".to_string(),
        "agent:backend-*".to_string(),
        "agent:frontend-*".to_string(),
    ];
    config.namespaces.insert("team".to_string(), acl);

    // Exact match
    assert!(config.can_read("agent:core", "team"));

    // Prefix matches
    assert!(config.can_read("agent:backend-lead", "team"));
    assert!(config.can_read("agent:backend-worker-1", "team"));
    assert!(config.can_read("agent:frontend-dev", "team"));

    // Non-matches
    assert!(!config.can_read("agent:other", "team"));
    assert!(!config.can_read("random", "team"));
}

/// Test rate limiting configuration.
#[test]
fn rate_limiting_config() {
    let config = SharedMemoryConfig::default();

    // Default rate limit
    assert_eq!(config.rate_limit_writes_per_hour, 100);

    // Custom rate limit
    let mut config = SharedMemoryConfig::default();
    config.rate_limit_writes_per_hour = 50;
    assert_eq!(config.rate_limit_writes_per_hour, 50);
}

/// Test max entries per agent configuration.
#[test]
fn max_entries_config() {
    let config = SharedMemoryConfig::default();
    assert_eq!(config.max_entries_per_agent, 1000);

    let mut config = SharedMemoryConfig::default();
    config.max_entries_per_agent = 500;
    assert_eq!(config.max_entries_per_agent, 500);
}
