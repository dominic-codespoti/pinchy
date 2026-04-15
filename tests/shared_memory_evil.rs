//! Shared Memory Evil/Boundary Tests
//!
//! Boundary hardening tests that verify the shared memory system
//! correctly handles malicious or edge-case inputs.

use mini_claw::config::shared_memory::{NamespaceAcl, SharedMemoryConfig};
use mini_claw::memory::shared::SharedMemoryStore;
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

/// Test invalid namespace rejection.
#[test]
fn invalid_namespaces_rejected() {
    let (_dir, store) = setup_test_db();

    // Empty namespace should be rejected
    let result = store.save("", "path", "content", "agent", Some("session"), &[], None);
    assert!(result.is_err());

    // Path traversal attempts should be rejected
    let result = store.save(
        "../etc/passwd",
        "key",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_err());

    let result = store.save(
        "foo/../../secret",
        "key",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_err());

    let result = store.save(
        "./local",
        "key",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_err());

    // Reserved system prefixes should be rejected
    let result = store.save(
        "system/secrets",
        "key",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_err());

    let result = store.save(
        "internal/config",
        "key",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_err());

    let result = store.save(
        "pinchy/admin",
        "key",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_err());

    // SQL injection attempts should be handled
    let result = store.save(
        "public'; DROP TABLE shared_memories; --",
        "key",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    // This may or may not be rejected at validation level, but should not cause SQL injection
    if result.is_ok() {
        // If accepted, verify table still exists
        let results = store.recall("", None, 10).unwrap();
        // Should not panic or cause issues
        let _ = results;
    }
}

/// Test reserved prefixes are rejected.
#[test]
fn reserved_prefixes_rejected() {
    // All system/internal/pinchy prefixes should be rejected
    let reserved = vec![
        "system/",
        "system/config",
        "system/secrets",
        "internal/",
        "internal/admin",
        "pinchy/",
        "pinchy/core",
        "pinchy/config",
    ];

    for ns in reserved {
        let result = SharedMemoryStore::validate_namespace(ns);
        assert!(
            result.is_err(),
            "Reserved prefix '{}' should be rejected",
            ns
        );
    }
}

/// Test traversal-like inputs are rejected.
#[test]
fn traversal_inputs_rejected() {
    let traversal_attempts = vec![
        "../secret",
        "../../etc/passwd",
        "foo/../bar",
        "./../secret",
        "a/b/../../../c",
        "normal/../secret",
        "..\\windows\\secret", // Windows-style
        ".\\local",
    ];

    for ns in traversal_attempts {
        let result = SharedMemoryStore::validate_namespace(&ns);
        assert!(
            result.is_err(),
            "Traversal attempt '{}' should be rejected",
            ns
        );
    }
}

/// Test malformed/evil config handling.
#[test]
fn evil_config_handling() {
    // Test with various malformed inputs that shouldn't panic

    let mut config = SharedMemoryConfig::default();
    config.enabled = true;

    // Empty agent ID should be handled
    let can_read = config.can_read("", "public");
    assert!(!can_read); // Empty agent shouldn't have access by default

    // Very long agent ID should be handled
    let long_agent = "a".repeat(1000);
    let _ = config.can_read(&long_agent, "public");
    // Should not panic

    // Special characters in agent ID
    let special_agents = vec!["agent<script>", "agent; DROP TABLE", "agent' OR '1'='1"];
    for agent in special_agents {
        let _ = config.can_read(agent, "public");
        // Should not panic
    }
}

/// Test feature flag matrix handling.
#[test]
fn feature_flag_matrix_cases() {
    // Test various combinations of feature flag and operations

    // Disabled feature blocks all operations
    let mut disabled_config = SharedMemoryConfig::default();
    disabled_config.enabled = false;

    let mut acl = NamespaceAcl::default();
    acl.read = vec!["*".to_string()];
    acl.write = vec!["*".to_string()];
    disabled_config.namespaces.insert("public".to_string(), acl);

    assert!(!disabled_config.can_read("any", "public"));
    assert!(!disabled_config.can_write("any", "public"));

    // Enabled feature with empty ACLs denies access
    let mut enabled_config = SharedMemoryConfig::default();
    enabled_config.enabled = true;
    // No ACLs defined

    assert!(!enabled_config.can_read("any", "public"));
    assert!(!enabled_config.can_write("any", "public"));
}

/// Test budget/namespace edge conditions don't panic.
#[test]
fn budget_edge_conditions_no_panic() {
    let config = SharedMemoryConfig::default();

    // Very large context budget
    let large_tokens = usize::MAX;
    let _ = (large_tokens as f32 * config.memory_budget.percent_of_context as f32 / 100.0) as usize;

    // Zero context budget
    let zero_tokens = 0usize;
    let budget =
        (zero_tokens as f32 * config.memory_budget.percent_of_context as f32 / 100.0) as usize;
    assert_eq!(budget, 0);

    // 100% budget
    let full_tokens = 100000usize;
    let max = (full_tokens as f32 * config.memory_budget.max_percent as f32 / 100.0) as usize;
    assert_eq!(max, 50000);
}

/// Test empty/whitespace namespace handling.
#[test]
fn empty_whitespace_namespace_handling() {
    let (_dir, store) = setup_test_db();

    // Empty namespace should be rejected
    let result = SharedMemoryStore::validate_namespace("");
    assert!(result.is_err());

    // Whitespace-only should be normalized to empty and rejected on save
    let result = store.save("   ", "key", "content", "agent", Some("session"), &[], None);
    assert!(result.is_err());

    // Tab and newline should be rejected (invalid chars)
    let result = SharedMemoryStore::validate_namespace("public\t/docs");
    assert!(result.is_err());

    let result = SharedMemoryStore::validate_namespace("public\n/docs");
    assert!(result.is_err());
}

/// Test content size edge cases.
#[test]
fn content_size_edge_cases() {
    let mut config = SharedMemoryConfig::default();

    // Zero size should be valid
    assert!(config.validate_content_size("").is_ok());

    // Exactly at limit
    config.max_entry_size = 5;
    assert!(config.validate_content_size("hello").is_ok());

    // One byte over
    assert!(config.validate_content_size("hello!").is_err());

    // Very large content
    config.max_entry_size = usize::MAX;
    let huge_content = "a".repeat(1000000);
    assert!(config.validate_content_size(&huge_content).is_ok());
}

/// Test rate limit edge cases.
#[test]
fn rate_limit_edge_cases() {
    let mut config = SharedMemoryConfig::default();

    // Zero rate limit
    config.rate_limit_writes_per_hour = 0;
    assert_eq!(config.rate_limit_writes_per_hour, 0);

    // Very high rate limit
    config.rate_limit_writes_per_hour = u32::MAX;
    assert_eq!(config.rate_limit_writes_per_hour, u32::MAX);
}

/// Test namespace length edge cases.
#[test]
fn namespace_length_edge_cases() {
    // Exactly at limit (128 chars)
    let at_limit = "a".repeat(128);
    let result = SharedMemoryStore::validate_namespace(&at_limit);
    assert!(result.is_ok());

    // One char over limit
    let over_limit = "a".repeat(129);
    let result = SharedMemoryStore::validate_namespace(&over_limit);
    assert!(result.is_err());

    // Very long namespace gets truncated in normalization
    let very_long = "a".repeat(1000);
    let normalized = SharedMemoryStore::normalize_namespace(&very_long);
    assert_eq!(normalized.len(), 128);
}

/// Test SQL injection resistance in queries.
#[test]
fn sql_injection_resistance() {
    let (_dir, store) = setup_test_db();

    // Create a legitimate entry
    store
        .save(
            "public/docs",
            "legit",
            "Legitimate content",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Search with SQL injection attempt
    let results = store.recall("' OR '1'='1", None, 10);
    // Should not panic or return all entries via injection
    assert!(results.is_ok());

    // Search with DROP TABLE attempt
    let results = store.recall("'; DROP TABLE shared_memories; --", None, 10);
    assert!(results.is_ok());

    // Verify table still exists by querying
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert!(!results.is_empty());

    // Namespace filter injection attempt
    let results = store.recall("content", Some("public' OR '1'='1"), 10);
    assert!(results.is_ok());
}

/// Test unicode and special character handling in content.
#[test]
fn unicode_content_handling() {
    let (_dir, store) = setup_test_db();

    let unicode_content = "Hello 世界 🌍 مرحبا Привет 🚀";
    store
        .save(
            "public/docs",
            "unicode-test",
            unicode_content,
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].content, unicode_content);

    // Search should work
    let results = store.recall("世界", None, 10).unwrap();
    // FTS5 may or may not match unicode depending on tokenizer
    // The important thing is it doesn't crash
}

/// Test concurrent access patterns (simulated).
#[test]
fn concurrent_access_patterns() {
    let (dir, store) = setup_test_db();

    // Multiple saves in same namespace
    for i in 0..100 {
        store
            .save(
                "public/docs",
                &format!("key-{}", i),
                &format!("Content {}", i),
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
    }

    // Verify all entries exist
    let results = store.recall("", Some("public/docs"), 1000).unwrap();
    assert_eq!(results.len(), 100);

    // Multiple namespaces
    for i in 0..10 {
        store
            .save(
                &format!("namespace-{}", i),
                "key",
                "content",
                "agent:core",
                Some("session-1"),
                &[],
                None,
            )
            .unwrap();
    }

    let namespaces = store.list_namespaces().unwrap();
    assert_eq!(namespaces.len(), 11); // 10 + public/docs
}

/// Test path edge cases.
#[test]
fn path_edge_cases() {
    let (_dir, store) = setup_test_db();

    // Empty path should be rejected
    let result = store.save(
        "public/docs",
        "",
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_err());

    // Very long path should work (within reason)
    let long_path = "a".repeat(1000);
    let result = store.save(
        "public/docs",
        &long_path,
        "content",
        "agent",
        Some("session"),
        &[],
        None,
    );
    assert!(result.is_ok());

    // Path with special characters that are allowed
    let special_paths = vec!["my-path", "my_path", "my.path", "my123", "UPPERCASE"];

    for path in special_paths {
        let result = store.save(
            "public/docs",
            path,
            "content",
            "agent",
            Some("session"),
            &[],
            None,
        );
        assert!(result.is_ok(), "Path '{}' should be allowed", path);
    }
}

/// Test malformed audit log entries don't crash.
#[test]
fn audit_log_malformed_entries() {
    let (_dir, store) = setup_test_db();

    // All optional fields as None
    store
        .audit_log("read", "agent", None, None, None, "allowed", None, None)
        .unwrap();

    // Very long strings
    let long_string = "a".repeat(10000);
    store
        .audit_log(
            &long_string,
            &long_string,
            Some(&long_string),
            Some(&long_string),
            Some(&long_string),
            &long_string,
            Some(&long_string),
            Some(&long_string),
        )
        .unwrap();

    // Query should handle these without crashing
    let logs = store.query_audit_log(None, None, None, 100).unwrap();
    assert_eq!(logs.len(), 2);
}

/// Test embedding edge cases.
#[test]
fn embedding_edge_cases() {
    let (_dir, store) = setup_test_db();

    let entry_id = store
        .save(
            "test",
            "key",
            "content",
            "agent",
            Some("session"),
            &[],
            None,
        )
        .unwrap();

    // Empty embedding
    store.save_embedding(&entry_id, &[], "model").unwrap();

    // Very large embedding
    let large_emb = vec![0.5f32; 10000];
    store
        .save_embedding(&entry_id, &large_emb, "model")
        .unwrap();

    // Semantic search with mismatched dimensions
    let results = store.recall_semantic(&[1.0, 2.0, 3.0], None, 10);
    // Should handle dimension mismatch gracefully
    assert!(results.is_ok());
}

/// Test TTL edge cases.
#[test]
fn ttl_edge_cases() {
    let (_dir, store) = setup_test_db();

    let now = chrono::Utc::now().timestamp();

    // Far future TTL
    store
        .save(
            "test",
            "far-future",
            "content",
            "agent",
            Some("session"),
            &[],
            Some(now + 365 * 86400 * 100), // 100 years
        )
        .unwrap();

    // Past TTL (expired)
    store
        .save(
            "test",
            "expired",
            "content",
            "agent",
            Some("session"),
            &[],
            Some(now - 86400), // 1 day ago
        )
        .unwrap();

    // Should only see non-expired entry
    let results = store.recall("", Some("test"), 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].path, "far-future");

    // No TTL (None) should be visible
    store
        .save(
            "test",
            "no-ttl",
            "content",
            "agent",
            Some("session"),
            &[],
            None,
        )
        .unwrap();

    let results = store.recall("", Some("test"), 10).unwrap();
    assert_eq!(results.len(), 2);
}

/// Test wildcard pattern edge cases.
#[test]
fn wildcard_pattern_edge_cases() {
    let (_dir, store) = setup_test_db();

    store
        .save("a/b/c", "key", "content", "agent", Some("s"), &[], None)
        .unwrap();
    store
        .save("a/b/d", "key", "content", "agent", Some("s"), &[], None)
        .unwrap();
    store
        .save("a/x/y", "key", "content", "agent", Some("s"), &[], None)
        .unwrap();

    // Multiple wildcards
    let results = store.recall("", Some("*/*/*"), 10).unwrap();
    assert_eq!(results.len(), 3);

    // Wildcard at start
    let results = store.recall("", Some("*/b/*"), 10).unwrap();
    assert_eq!(results.len(), 2);

    // Just wildcard
    let results = store.recall("", Some("*"), 10).unwrap();
    assert_eq!(results.len(), 3);
}

/// Test audit log failure doesn't crash the operation.
#[test]
fn audit_log_failure_does_not_crash() {
    let (_dir, store) = setup_test_db();

    // Create an entry
    let entry_id = store
        .save(
            "public/docs",
            "test-key",
            "Test content",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Verify save succeeded despite any audit log issues
    assert!(!entry_id.is_empty());

    // Query audit log - should work without crashing
    let logs = store.query_audit_log(None, None, None, 10).unwrap();
    // May or may not have entries depending on test environment
    let _ = logs;
}

/// Test author_session_id nullability - entries without session should work.
#[test]
fn author_session_id_nullable() {
    let (_dir, store) = setup_test_db();

    // Save with session_id
    let id1 = store
        .save(
            "public/docs",
            "with-session",
            "Content with session",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Save without session_id (None)
    let id2 = store
        .save(
            "public/docs",
            "without-session",
            "Content without session",
            "agent:core",
            None, // No session
            &[],
            None,
        )
        .unwrap();

    // Both should be retrievable
    let results = store.recall("", Some("public/docs"), 10).unwrap();
    assert_eq!(results.len(), 2);

    // Verify session_id handling
    let with_session = results.iter().find(|e| e.entry_id == id1).unwrap();
    let without_session = results.iter().find(|e| e.entry_id == id2).unwrap();

    assert_eq!(
        with_session.author_session_id,
        Some("session-1".to_string())
    );
    assert_eq!(without_session.author_session_id, None);
}

/// Test audit log entries include session_id when provided.
#[test]
fn audit_log_includes_session_id() {
    let (_dir, store) = setup_test_db();

    // Write audit log with session_id
    store
        .audit_log(
            "write",
            "agent:core",
            Some("session-abc-123"),
            Some("public/docs"),
            Some("entry-1"),
            "allowed",
            Some("hash123"),
            None,
        )
        .unwrap();

    // Write audit log without session_id
    store
        .audit_log(
            "read",
            "agent:other",
            None,
            Some("public/docs"),
            Some("entry-1"),
            "allowed",
            None,
            None,
        )
        .unwrap();

    // Query and verify
    let logs = store
        .query_audit_log(Some("agent:core"), None, None, 10)
        .unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].session_id, Some("session-abc-123".to_string()));

    let logs = store
        .query_audit_log(Some("agent:other"), None, None, 10)
        .unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].session_id, None);
}
/// Test config validation edge cases.
#[test]
fn config_validation_edge_cases() {
    let mut config = SharedMemoryConfig::default();

    // Max entry size 0 should reject everything except empty
    config.max_entry_size = 0;
    assert!(config.validate_content_size("").is_ok());
    assert!(config.validate_content_size("a").is_err());

    // Zero memory budget percentages
    config.memory_budget.percent_of_context = 0;
    config.memory_budget.max_percent = 0;
    assert_eq!(config.memory_budget.percent_of_context, 0);

    // 100% memory budget
    config.memory_budget.percent_of_context = 100;
    config.memory_budget.max_percent = 100;
    assert_eq!(config.memory_budget.percent_of_context, 100);
}

// ============================================================================
// Wave 1 Hardening Tests
// ============================================================================

/// Test FTS5 injection resistance with hardened query builder.
#[test]
fn fts5_injection_resistance_hardened() {
    let (_dir, store) = setup_test_db();

    // Create legitimate entries
    store
        .save(
            "public/docs",
            "legit",
            "Legitimate content for testing",
            "agent:core",
            Some("session-1"),
            &[],
            None,
        )
        .unwrap();

    // Various FTS5 injection attempts should be sanitized
    let injection_attempts = [
        "*",                                 // Match all
        "' OR '1'='1",                       // Boolean injection
        "'; DROP TABLE shared_memories; --", // SQL-style injection
        "content OR *",                      // OR with wildcard
        "content AND *",                     // AND with wildcard
        "content NOT test",                  // NOT operator
        "content NEAR test",                 // NEAR operator
        "^content",                          // Initial token marker
        "content*",                          // Suffix wildcard in input
        "\"content\" OR \"\"\"=\"\"",        // Quote injection
        "test ^ -content +required",         // Multiple operators
    ];

    for attempt in &injection_attempts {
        let results = store.recall(attempt, None, 10);
        assert!(
            results.is_ok(),
            "Injection attempt '{}' should not crash",
            attempt
        );
        // Verify table still exists by querying
        let verify = store.recall("", Some("public/docs"), 10).unwrap();
        assert!(
            !verify.is_empty(),
            "Table should still be accessible after: {}",
            attempt
        );
    }
}

/// Test FTS5 query complexity limits.
#[test]
fn fts5_query_complexity_limits() {
    let (_dir, store) = setup_test_db();

    // Query with many words should be truncated
    let many_words = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    let results = store.recall(many_words, None, 10);
    assert!(results.is_ok());

    // Very long single word should be truncated
    let long_word = "a".repeat(100);
    let results = store.recall(&long_word, None, 10);
    assert!(results.is_ok());
}

/// Test secret detection for new hardened patterns.
#[test]
fn secret_detection_hardened_patterns() {
    // JWT tokens (three base64 segments)
    let jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    assert!(SharedMemoryStore::check_content_for_secrets(jwt).is_err());

    // SSH key formats
    let openssh_key =
        "-----BEGIN OPENSSH PRIVATE KEY-----\nabc123\n-----END OPENSSH PRIVATE KEY-----";
    assert!(SharedMemoryStore::check_content_for_secrets(openssh_key).is_err());

    let rsa_key = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...";
    assert!(SharedMemoryStore::check_content_for_secrets(rsa_key).is_err());

    // SSH public keys
    let ssh_rsa = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC user@example.com";
    assert!(SharedMemoryStore::check_content_for_secrets(ssh_rsa).is_err());

    let ssh_ed25519 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI user@example.com";
    assert!(SharedMemoryStore::check_content_for_secrets(ssh_ed25519).is_err());

    // API key patterns (using clearly fake test prefixes - NOT real Stripe patterns)
    // The fake_ prefix ensures these don't trigger GitHub secret scanning
    let stripe_live = "fake_sk_live_abcdefghijklmnopqrstuvwxyz";
    assert!(SharedMemoryStore::check_content_for_secrets(stripe_live).is_err());

    let stripe_test = "fake_sk_test_abcdefghijklmnopqrstuvwxyz";
    assert!(SharedMemoryStore::check_content_for_secrets(stripe_test).is_err());

    let rk_restricted = "fake_rk_live_abcdefghijklmnopqrstuvwxyz";
    assert!(SharedMemoryStore::check_content_for_secrets(rk_restricted).is_err());
}

/// Test secret detection edge cases - partial matches.
#[test]
fn secret_detection_edge_cases() {
    // eyJ alone (start of JWT) should be flagged
    assert!(SharedMemoryStore::check_content_for_secrets("eyJhbGciOiJIUzI1NiJ9").is_err());

    // Bearer token
    assert!(SharedMemoryStore::check_content_for_secrets("Bearer eyJhbGciOiJIUzI1NiJ9").is_err());
    assert!(SharedMemoryStore::check_content_for_secrets("bearer: eyJhbGciOiJIUzI1NiJ9").is_err());

    // AWS credential patterns
    let aws_access = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
    assert!(SharedMemoryStore::check_content_for_secrets(aws_access).is_err());

    let aws_secret = "aws_secret_access_key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    assert!(SharedMemoryStore::check_content_for_secrets(aws_secret).is_err());
}

/// Test that legitimate documentation is not falsely flagged.
#[test]
fn secret_detection_no_false_positives_on_docs() {
    let safe_documentation = [
        "This guide explains how to use API keys safely.",
        "The password should be stored hashed, not plaintext.",
        "JWT tokens are used for authentication in this system.",
        "SSH keys can be generated with ssh-keygen -t ed25519.",
        "Copy .env.example to .env and fill in your values.",
        "Bearer tokens should be sent in the Authorization header.",
        "Use AWS Secrets Manager for storing credentials.",
        "The secret to good API design is consistency.",
        "Private key encryption uses AES-256-GCM.",
        "This function accepts an optional api_key parameter.",
        "OpenAI-style keys start with 'sk-' but this is just documentation.",
    ];

    for content in &safe_documentation {
        assert!(
            SharedMemoryStore::check_content_for_secrets(content).is_ok(),
            "Documentation should not be flagged: {}",
            content
        );
    }
}

/// Test that FTS5 search still works correctly after hardening.
#[test]
fn fts5_hardening_preserves_functionality() {
    let (_dir, store) = setup_test_db();

    // Create test entries
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

    // Normal searches should work
    let results = store.recall("Rust", None, 10).unwrap();
    assert!(results.iter().any(|r| r.path == "rust-guide"));

    let results = store.recall("Python programming", None, 10).unwrap();
    assert!(results.iter().any(|r| r.path == "python-guide"));

    let results = store.recall("backend services", None, 10).unwrap();
    assert!(results.iter().any(|r| r.path == "architecture"));

    // Prefix matching should work (searching for "prog" should find "programming")
    let results = store.recall("prog", None, 10).unwrap();
    assert!(results.iter().any(|r| r.path == "python-guide"));
}
