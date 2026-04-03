# Shared Memory MVP Test Harnesses

> Operational, smoke, and manual test harnesses for Pinchy's shared memory MVP.
> Aligned with repo's make/cargo patterns. See `LETTA_INSPIRED_SHARED_MEMORY_SPEC.md` for spec details.

---

## 1. Harness Overview

| Harness | Type | Purpose | When to Run |
|---------|------|---------|-------------|
| `cargo test --test shared_memory_store` | Unit/Integration | Core storage layer (SM-001 → SM-009) | Every build during Epic 1 |
| `cargo test --test shared_memory_acl` | Unit/Integration | Config-based auth (SM-010 → SM-015) | Every build during Epic 2 |
| `cargo test --test shared_memory_tools` | Integration | Tool namespace params (SM-016 → SM-022) | Every build during Epic 3 |
| `cargo test --test shared_memory_context` | Integration | Context budget integration (SM-023 → SM-027) | Every build during Epic 4 |
| `make smoke-shared` | Smoke | End-to-end workflow verification | Pre-merge, nightly CI |
| `make manual-shared-demo` | Manual | Interactive multi-agent demo | Feature demo, QA validation |
| `scripts/shared-memory-check.sh` | Operational | Health checks in production | Post-deploy, incident response |

---

## 2. Unit/Integration Test Harnesses (cargo test)

### 2.1 Core Storage Tests (`tests/shared_memory_store.rs`)

**Proves:** Database migrations, FTS5, embeddings table, CRUD operations, content hashing

```rust
//! Shared Memory Store — Core Storage Layer Tests (Epic 1)
//! Tickets: SM-001 through SM-009

use mini_claw::memory::shared::{SharedMemoryStore, SharedMemoryEntry};
use mini_claw::store::PinchyDb;
use tempfile::TempDir;

// ── Migration Tests (SM-001) ───────────────────────────────────

#[test]
fn migration_creates_all_tables() {
    let temp = TempDir::new().unwrap();
    let db = PinchyDb::open(temp.path()).unwrap();
    
    // Verify PRAGMA user_version bumped to 1
    let version: i32 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 1, "migration should set user_version = 1");
    
    // Verify all expected tables exist
    let tables: Vec<String> = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'shared_%'"
    ).unwrap()
    .query_map([], |r| r.get(0)).unwrap()
    .filter_map(|r| r.ok())
    .collect();
    
    assert!(tables.contains(&"shared_memories".to_string()));
    assert!(tables.contains(&"shared_embeddings".to_string()));
    assert!(tables.contains(&"shared_audit_log".to_string()));
}

#[test]
fn migration_is_idempotent() {
    let temp = TempDir::new().unwrap();
    let db = PinchyDb::open(temp.path()).unwrap();
    
    // Running migrate again should not fail
    db.migrate().expect("migration should be idempotent");
    
    let version: i32 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 1);
}

// ── Schema Tests (SM-002, SM-003, SM-004, SM-005) ────────────

#[test]
fn shared_memories_table_has_required_columns() {
    // Verify schema matches spec section 3.3
}

#[test]
fn fts5_triggers_fire_on_insert_update_delete() {
    // Insert → FTS row created
    // Update → FTS row replaced
    // Delete → FTS row removed
}

#[test]
fn embeddings_table_foreign_key_cascade() {
    // Deleting memory entry should cascade delete embedding
}

// ── SharedMemoryStore CRUD (SM-006 → SM-009) ─────────────────

#[test]
fn save_shared_creates_entry_with_content_hash() {
    // Verify SHA-256 hash is computed and stored
}

#[test]
fn recall_shared_uses_bm25_ranking() {
    // Insert test data, recall with query, verify BM25 scores populated
}

#[test]
fn recall_shared_with_embedding_fallback_to_bm25() {
    // Test when embedding provider unavailable
}

#[test]
fn forget_shared_requires_auth() {
    // Unauth delete should fail; auth delete should succeed
}
```

**Run:**
```bash
cargo test --test shared_memory_store -- --nocapture
```

---

### 2.2 Authorization Tests (`tests/shared_memory_acl.rs`)

**Proves:** Config loading, wildcard matching, read/write permissions, rate limiting

```rust
//! Shared Memory Authorization Tests (Epic 2)
//! Tickets: SM-010 through SM-015

use mini_claw::config::SharedMemoryConfig;
use mini_claw::memory::auth::{can_read_namespace, can_write_namespace};

// ── Config Loading (SM-010) ──────────────────────────────────

#[test]
fn config_loads_namespace_acl() {
    let yaml = r#"
shared_memory:
  enabled: true
  namespaces:
    public:
      read: ["*"]
      write: ["agent:core"]
    team/eng:
      read: ["agent:backend-*"]
      write: ["agent:backend-lead"]
"#;
    let config: SharedMemoryConfig = serde_yaml::from_str(yaml).unwrap();
    assert!(config.enabled);
    assert!(config.namespaces.contains_key("public"));
}

#[test]
fn wildcard_star_matches_all_agents() {
    assert!(can_read_namespace("agent:any", "public", &config));
}

#[test]
fn wildcard_prefix_matches_pattern() {
    assert!(can_read_namespace("agent:backend-worker-1", "team/eng", &config));
    assert!(!can_read_namespace("agent:frontend-worker", "team/eng", &config));
}

#[test]
fn write_more_restrictive_than_read() {
    // agent:backend-worker can read team/eng but not write
    assert!(can_read_namespace("agent:backend-worker", "team/eng", &config));
    assert!(!can_write_namespace("agent:backend-worker", "team/eng", &config));
}

#[test]
fn rate_limit_enforced_per_agent() {
    // Exceed 100 writes/hour, expect RateLimitExceeded
}
```

**Run:**
```bash
cargo test --test shared_memory_acl
```

---

### 2.3 Tool Integration Tests (`tests/shared_memory_tools.rs`)

**Proves:** Namespace parameter handling, wildcard queries, embedding integration, error envelopes

```rust
//! Shared Memory Tool Integration Tests (Epic 3)
//! Tickets: SM-016 through SM-022

use mini_claw::tools;
use serde_json::json;

#[tokio::test]
async fn save_memory_with_namespace_writes_to_shared() {
    let result = tools::save_memory(
        &agent_ctx,
        json!({
            "content": "Project conventions for Rust error handling",
            "namespace": "public/docs",
            "tags": ["conventions", "rust"]
        })
    ).await.expect("save should succeed");
    
    // Verify entry in shared_memories, not private memory.db
}

#[tokio::test]
async fn save_memory_without_namespace_writes_to_private() {
    // No namespace → private memory.db
}

#[tokio::test]
async fn recall_memory_namespace_star_queries_all_authorized() {
    let result = tools::recall_memory(
        &agent_ctx,
        json!({
            "query": "error handling patterns",
            "namespace": "*",
            "limit": 10
        })
    ).await.unwrap();
    
    // Should return results from all namespaces agent can read
}

#[tokio::test]
async fn recall_memory_namespace_prefix_wildcard() {
    // "team/*" should query all team/ sub-namespaces
}

#[tokio::test]
async fn unauthorized_read_returns_structured_error() {
    // Should return SharedMemoryError with code NamespaceNotAuthorized
}

#[tokio::test]
async fn embedding_mismatch_falls_back_to_bm25() {
    // Simulate stored embedding with different model/dim
    // Should still return results via BM25
}
```

**Run:**
```bash
cargo test --test shared_memory_tools
```

---

### 2.4 Context Integration Tests (`tests/shared_memory_context.rs`)

**Proves:** Budget allocation, turn-based compaction, source attribution, per-turn rebuild

```rust
//! Shared Memory Context Integration Tests (Epic 4)
//! Tickets: SM-023 through SM-027

use mini_claw::context::{build_prompt_with_memory, ContextBudget};
use mini_claw::memory::shared::SharedMemoryStore;

#[test]
fn memory_budget_allocates_20_percent_default() {
    let budget = ContextBudget {
        max_context_tokens: 128000,
        memory_budget: MemoryBudget { percent_of_context: 20, max_percent: 50 },
        ..Default::default()
    };
    
    // Memory allocation should be ~25,600 tokens (20% of 128k)
}

#[test]
fn private_memory_gets_priority_over_shared() {
    // Private should fill first; shared gets remaining up to cap
}

#[test]
fn shared_memory_counts_against_same_budget() {
    // Combined private + shared should not exceed budget.max_context_tokens * 0.75
}

#[test]
fn turn_compaction_rebuilds_shared_memory() {
    // After 20 turns, shared memory should be re-queried, not persisted from prior turn
}

#[test]
fn prompt_includes_source_attribution() {
    // Verify [Shared Memory from namespace: X] labels in prompt
}
```

**Run:**
```bash
cargo test --test shared_memory_context
```

---

## 3. Smoke Test Harness (`make smoke-shared`)

**Proves:** Full stack works end-to-end with real database and temporary config

### Makefile Addition

```makefile
# ── Shared Memory Smoke Tests ──────────────────────────────────

SMOKE_TEMP_DIR := $(shell mktemp -d)

smoke-shared: release
	@echo "🔥 Running shared memory smoke tests..."
	@echo "   Temp dir: $(SMOKE_TEMP_DIR)"
	@mkdir -p $(SMOKE_TEMP_DIR)/agents
	@# Create smoke test config
	@cat > $(SMOKE_TEMP_DIR)/config.yaml << 'EOF'
shared_memory:
  enabled: true
  memory_budget:
    percent_of_context: 20
    max_percent: 50
  namespaces:
    public:
      read: ["*"]
      write: ["agent:smoke-test"]
    smoke/test:
      read: ["agent:smoke-*"]
      write: ["agent:smoke-lead"]
EOF
	@# Run smoke test binary
	@PINCHY_HOME=$(SMOKE_TEMP_DIR) ./target/release/pinchy smoke shared-memory
	@rm -rf $(SMOKE_TEMP_DIR)
	@echo "✅ Smoke tests passed"

smoke-shared-verbose: release
	@PINCHY_HOME=$(SMOKE_TEMP_DIR) ./target/release/pinchy smoke shared-memory --verbose
```

### CLI Implementation (`src/cli/smoke.rs`)

```rust
//! Smoke test command for shared memory verification

use anyhow::Result;
use clap::Parser;

#[derive(Parser)]
pub struct SmokeSharedArgs {
    #[arg(long)]
    verbose: bool,
}

pub async fn run_smoke_shared(args: SmokeSharedArgs) -> Result<()> {
    let config = load_config()?;
    let db = PinchyDb::open(&pinchy_home())?;
    
    println!("[smoke] Shared Memory MVP Smoke Tests");
    println!("[smoke] ==================================");
    
    // Test 1: Migration applied
    let version = db.user_version()?;
    assert_eq!(version, 1, "user_version should be 1");
    println!("✓ Migration: user_version = {}", version);
    
    // Test 2: Can write to authorized namespace
    let store = SharedMemoryStore::new(db.clone());
    let entry = store.save_shared(
        "smoke/test",
        "test/path",
        "Smoke test entry content",
        &["smoke", "test"],
        "agent:smoke-lead",
    ).await?;
    println!("✓ Write: entry_id = {}", entry.entry_id);
    
    // Test 3: Can read back
    let results = store.recall_shared(
        "smoke test",
        Some("smoke/test"),
        10,
    ).await?;
    assert!(!results.is_empty(), "should recall written entry");
    println!("✓ Read: {} results", results.len());
    
    // Test 4: Unauthorized write rejected
    let unauthorized = store.save_shared(
        "smoke/test",
        "unauthorized/path",
        "This should fail",
        &[],
        "agent:unauthorized",  // Not in write allowlist
    ).await;
    assert!(unauthorized.is_err(), "unauthorized write should fail");
    println!("✓ Auth: unauthorized write rejected");
    
    // Test 5: Audit log recorded
    let audit_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM shared_audit_log WHERE namespace = ?",
        ["smoke/test"],
        |r| r.get(0)
    )?;
    assert!(audit_count >= 2, "audit log should have entries");
    println!("✓ Audit: {} entries recorded", audit_count);
    
    // Test 6: FTS5 search works
    let fts_results = store.recall_shared("entry content", None, 10).await?;
    assert!(!fts_results.is_empty(), "FTS5 should find content");
    println!("✓ FTS5: search returned {} results", fts_results.len());
    
    // Test 7: Wildcard namespace query
    let wildcard_results = store.recall_shared(
        "test",
        Some("*"),  // All authorized namespaces
        10,
    ).await?;
    println!("✓ Wildcard: {} results from all namespaces", wildcard_results.len());
    
    println!("\n[smoke] All tests passed ✅");
    Ok(())
}
```

**When to run:**
- Before every PR merge
- Nightly CI pipeline
- After any database schema change

---

## 4. Manual Demo Harness (`make manual-shared-demo`)

**Proves:** Feature works in realistic multi-agent scenario; suitable for demos and QA

### Makefile Addition

```makefile
# ── Manual Shared Memory Demo ──────────────────────────────────

manual-shared-demo: release
	@echo "🎭 Manual Shared Memory Demo"
	@echo "   This will start Pinchy and run an interactive multi-agent demo."
	@echo ""
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 0
	@./target/release/pinchy demo shared-memory --interactive
```

### Demo Script (`src/cli/demo.rs`)

Interactive prompts:
1. **Setup:** Create 2 agents (writer: `agent:demo-lead`, reader: `agent:demo-worker`)
2. **Write:** Writer saves conventions to `team/demo` namespace
3. **Read:** Reader recalls conventions from same namespace
4. **Verify:** Show audit log entries
5. **Auth Test:** Attempt unauthorized write (should fail)
6. **Wildcard:** Reader queries `*` for all accessible namespaces

**When to run:**
- Feature demo to stakeholders
- QA validation before release
- Regression testing after major changes

---

## 5. Operational Health Check Script (`scripts/shared-memory-check.sh`)

**Proves:** Production deployment is healthy; suitable for monitoring and incident response

```bash
#!/bin/bash
# Shared Memory Operational Health Check
# Usage: ./scripts/shared-memory-check.sh [--verbose]
# Exit codes: 0 = healthy, 1 = issues found

set -e

VERBOSE=${1:-""}
PINCHY_HOME=${PINCHY_HOME:-$HOME/.pinchy}
DB_PATH="$PINCHY_HOME/pinchy.db"
ERRORS=0

log() {
    if [ "$VERBOSE" = "--verbose" ]; then
        echo "[check] $1"
    fi
}

error() {
    echo "[ERROR] $1"
    ((ERRORS++))
}

echo "=== Pinchy Shared Memory Health Check ==="
echo "DB Path: $DB_PATH"
echo ""

# 1. Database exists and is accessible
if [ ! -f "$DB_PATH" ]; then
    error "Database not found at $DB_PATH"
else
    log "Database file exists"
fi

# 2. Migration version check
VERSION=$(sqlite3 "$DB_PATH" "PRAGMA user_version;" 2>/dev/null || echo "-1")
if [ "$VERSION" -lt 1 ]; then
    error "Migration not applied: user_version = $VERSION (expected >= 1)"
else
    log "Migration OK: user_version = $VERSION"
fi

# 3. Required tables exist
for table in shared_memories shared_embeddings shared_audit_log shared_memories_fts; do
    EXISTS=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" 2>/dev/null)
    if [ -z "$EXISTS" ]; then
        error "Table missing: $table"
    else
        log "Table exists: $table"
    fi
done

# 4. FTS5 virtual table is functional
FTS_CHECK=$(sqlite3 "$DB_PATH" "INSERT INTO shared_memories_fts(rowid, content) VALUES (99999, 'healthcheck'); DELETE FROM shared_memories_fts WHERE rowid = 99999; SELECT 1;" 2>/dev/null || echo "0")
if [ "$FTS_CHECK" != "1" ]; then
    error "FTS5 virtual table not functional"
else
    log "FTS5 functional"
fi

# 5. Row counts (basic sanity)
MEMORY_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM shared_memories;" 2>/dev/null || echo "0")
AUDIT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM shared_audit_log;" 2>/dev/null || echo "0")
log "Stats: $MEMORY_COUNT shared memories, $AUDIT_COUNT audit entries"

# 6. Recent errors in audit log
RECENT_ERRORS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM shared_audit_log WHERE error IS NOT NULL AND timestamp > datetime('now', '-1 hour');" 2>/dev/null || echo "0")
if [ "$RECENT_ERRORS" -gt 0 ]; then
    error "Found $RECENT_ERRORS errors in last hour (check audit log)"
fi

# 7. Config validation
if [ -f "$PINCHY_HOME/config.yaml" ]; then
    if grep -q "shared_memory:" "$PINCHY_HOME/config.yaml" 2>/dev/null; then
        log "Config: shared_memory section present"
        if grep -A 5 "shared_memory:" "$PINCHY_HOME/config.yaml" | grep -q "enabled: true"; then
            log "Config: shared memory enabled"
        fi
    fi
fi

# Summary
echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ Health check passed"
    exit 0
else
    echo "❌ Found $ERRORS issue(s)"
    exit 1
fi
```

### Makefile Addition

```makefile
# ── Operational Health Checks ──────────────────────────────────

check-shared:
	@bash scripts/shared-memory-check.sh

check-shared-verbose:
	@bash scripts/shared-memory-check.sh --verbose
```

**When to run:**
- Post-deployment verification
- Part of `make install` sequence
- Incident response: first diagnostic step
- Monitoring cron job (every 5 minutes)

---

## 6. CI Pipeline Integration

### `.github/workflows/shared-memory.yml` (or add to existing)

```yaml
name: Shared Memory Tests

on:
  push:
    paths:
      - 'src/memory/**'
      - 'src/store/**'
      - 'src/tools/builtins/memory.rs'
      - 'src/context/**'
      - 'tests/shared_memory*.rs'
      - 'LETTA_INSPIRED_SHARED_MEMORY_SPEC.md'

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-action@stable
      
      - name: Run storage layer tests
        run: cargo test --test shared_memory_store --no-default-features
      
      - name: Run ACL tests
        run: cargo test --test shared_memory_acl --no-default-features
      
      - name: Run tool integration tests
        run: cargo test --test shared_memory_tools --no-default-features
      
      - name: Run context integration tests
        run: cargo test --test shared_memory_context --no-default-features

  smoke:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-action@stable
      
      - name: Build release
        run: make release
      
      - name: Run smoke tests
        run: make smoke-shared

  health-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Check health script syntax
        run: bash -n scripts/shared-memory-check.sh
      
      - name: Make script executable
        run: chmod +x scripts/shared-memory-check.sh
```

---

## 7. Quick Reference: When to Run What

| Phase | Harness | Command | Frequency |
|-------|---------|---------|-----------|
| **Development** (Epic 1) | Storage tests | `cargo test --test shared_memory_store` | Every change |
| **Development** (Epic 2) | ACL tests | `cargo test --test shared_memory_acl` | Every change |
| **Development** (Epic 3) | Tool tests | `cargo test --test shared_memory_tools` | Every change |
| **Development** (Epic 4) | Context tests | `cargo test --test shared_memory_context` | Every change |
| **Pre-commit** | Lint + unit | `cargo fmt && cargo clippy && cargo test --lib` | Every commit |
| **Pre-merge** | Smoke | `make smoke-shared` | Every PR |
| **Nightly** | Full suite | `make smoke-shared && make check-shared` | Daily |
| **Release** | Demo + health | `make manual-shared-demo && make check-shared` | Before tag |
| **Production** | Health check | `./scripts/shared-memory-check.sh` | Post-deploy |

---

## 8. Exit Codes and Error Handling

| Harness | Success | Failure | Notes |
|---------|---------|---------|-------|
| `cargo test` | 0 | 101 | Standard Rust test behavior |
| `make smoke-shared` | 0 | 1 | Uses `set -e` in script |
| `scripts/shared-memory-check.sh` | 0 | 1 | Counts errors, exits 1 if >0 |
| `pinchy smoke shared-memory` | 0 | 1 | Logs all errors before exit |

---

## Summary

| Harness Type | Count | Purpose |
|--------------|-------|---------|
| Unit/Integration | 4 test files | TDD during implementation |
| Smoke | 1 make target | Pre-merge verification |
| Manual | 1 demo command | Stakeholder demos, QA |
| Operational | 1 shell script | Production health monitoring |

**Total new files:** 4 test files, 1 script, ~50 lines Makefile additions, 1 CLI subcommand

**Implementation order:**
1. Add `tests/shared_memory_store.rs` (unblocks SM-001)
2. Add `tests/shared_memory_acl.rs` (unblocks SM-010)
3. Add `pinchy smoke shared-memory` command (SM-013)
4. Add `make smoke-shared` target
5. Add `scripts/shared-memory-check.sh` (SM-028)
6. Add remaining integration tests as features land
