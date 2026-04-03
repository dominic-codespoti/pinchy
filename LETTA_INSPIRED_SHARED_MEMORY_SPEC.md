# LETTA_INSPIRED_SHARED_MEMORY_SPEC

**Status**: MVP Complete  
**Version**: 1.0-mvp  
**Scope**: MVP → v1.0 → v1.1

A Letta-inspired shared memory system for Pinchy, implemented natively in Rust with SQLite + FTS5 storage. This spec prioritizes minimal viable delivery while preserving hooks for future sophistication.

**Design Constraint**: "Ship the smallest thing that works. Cut scope."

---

## 1. OVERVIEW

### 1.1 PROBLEM STATEMENT

Pinchy's current memory system (`save_memory`, `recall_memory`, `forget_memory`) operates strictly per-agent. Each agent has its own `memory.db` in its workspace—completely isolated. This prevents legitimate cross-agent coordination:

- Knowledge discovered by Agent A must be rediscovered by Agent B
- Project conventions established in one session don't propagate to new sessions
- No persistent "team memory" for organizational knowledge

### 1.2 GOALS

| Priority | Goal | Success Metric |
|----------|------|----------------|
| P0 | Agents can read shared memory with explicit authorization | `recall_memory` can query shared namespaces |
| P0 | Agents can write shared memory with explicit capability | `save_memory` accepts shared namespace parameter |
| P0 | Private memory remains default and isolated | No regression in per-agent memory behavior |
| P1 | Shared memory counts against context/token budget | Integrated with existing `turn-based compaction` |
| P1 | Reuse existing embedding infrastructure | No separate embedding subsystem |
| P2 | Simple config-based access control | Namespace allowlists in config.yaml |

### 1.3 NON-GOALS

| Item | Rationale |
|------|-----------|
| Letta API compatibility | Borrow architectural ideas, not wire protocols |
| Working/Core/Archival promotion layers | Single shared pool is sufficient for MVP |
| Real-time sync across hosts | Single-binary scope; clustering is v2 |
| Distributed consensus | SQLite is sufficient for single-host scale |
| Agent-to-agent direct messaging | Use existing gateway/WebSocket patterns |
| Automatic memory merging | Agents must explicitly read/write shared memory |
| Cross-organization federation | Future research topic |
| Graph relationship queries | Start with tag-based filtering; graph is v1.1 |
| Built-in vector database | SQLite + embeddings via existing providers |
| Cryptographic signatures | Provenance tracking without crypto in MVP |
| Heavy secret detection | Enhanced pattern detection (JWT, SSH keys, Stripe-style keys, Bearer tokens, AWS credentials) implemented. ML-based detection deferred. |

### 1.4 GUIDING PRINCIPLES

1. **Explicit Over Implicit**: No automatic sharing. All shared memory access requires explicit opt-in.
2. **Default Deny**: Agents cannot access shared memory without explicit authorization.
3. **Local-First**: Private per-agent memory remains the default. Shared memory is secondary.
4. **Tool-First**: Extend existing tools before adding new APIs or HTTP endpoints.
5. **Context-Aware**: Shared memory retrieval consumes the same context budget as private memory.
6. **Single-Binary**: No external dependencies. SQLite-backed only.

### 1.5 TERMINOLOGY

| Term | Definition |
|------|------------|
| **Private Memory** | Per-agent memory (`agents/{id}/workspace/memory.db`)—current implementation |
| **Shared Memory** | Cross-agent memory stored in `pinchy.db` with namespace scoping |
| **Namespace** | Hierarchical path for memory scoping (e.g., `team/eng`, `public/docs`) |
| **Recall** | Retrieval via FTS5 BM25 + optional semantic search |
| **Turn-based Compaction** | Existing context management via turn counting |
| **Context Budget** | Token budget for prompt construction (120k tokens max) |
| **Embedding Provider** | Reuses existing `ModelProvider` trait for embeddings |

---

## 2. ARCHITECTURE

### 2.1 SIMPLIFIED MEMORY MODEL (MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT WORKSPACE                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PRIVATE MEMORY                                          │   │
│  │  - Current session context                               │   │
│  │  - Private agent knowledge                               │   │
│  │  - Ephemeral tool results                                │   │
│  │  Location: agents/{id}/workspace/memory.db               │   │
│  │  Access: Always allowed, counts toward context budget    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼ (Explicit Tool Call)              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SHARED MEMORY (pinchy.db)                               │   │
│  │  - Team conventions, project state                         │   │
│  │  - Documentation, code patterns                          │   │
│  │  - Single pool (no working/core/archival tiers in MVP)     │   │
│  │  Location: pinchy.db:shared_memories                     │   │
│  │  Access: Config-authorized namespaces only                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key MVP Simplification**: No promotion/demotion layers. Shared memory is a single pool with optional TTL-based expiration (v1.0). Advanced layering is post-MVP.

### 2.2 NAMESPACE SEMANTICS (MVP)

**Grammar and Normalization:**
- Namespaces are dot-separated or slash-separated lowercase ASCII paths: `public/docs`, `team.eng.conventions`
- Maximum length: 128 characters
- Normalization: lowercase, collapse multiple separators, trim leading/trailing separators
- Reserved prefixes: `system/`, `internal/`, `pinchy/` (prohibited in user namespaces)
- No path traversal: `../`, `./` in paths are rejected

**Namespace Types:**
- **Omitted/None**: Private memory (per-agent `memory.db` in workspace)
- **Explicit**: Shared memory in `pinchy.db` with full namespace path

**Wildcard Semantics:**
- `namespace="*"`: Query all namespaces the agent is authorized to access (read permission)
- `namespace="team/*"`: Query all namespaces under `team/` prefix (requires authorization for each matched namespace)
- Wildcards do NOT create namespaces; they only match existing authorized namespaces

**Access Control Model:**
- Config-based ACLs only in MVP (see Section 3.4)
- Implicit namespace creation: first authorized write to a non-existent namespace creates it
- Result attribution: every recalled entry includes `namespace`, `author_agent_id`, `created_at`

**MVP Namespace Hierarchy (Simplified):**
```
shared/                          # Root prefix (implicit)
├── public/                      # Readable by all authorized agents
│   ├── docs/                    # Shared documentation
│   └── patterns/                # Code patterns and conventions
├── team/{team_id}/              # Team-scoped memory
│   └── conventions/             # Team-specific conventions
└── project/{project_id}/        # Project-scoped memory
    └── context/                 # Project context
```

**MVP Scope**: Start with `public/` and one team namespace. Config-based authorization only.

### 2.3 RETRIEVAL/INJECTION FLOW

**Critical Principle**: Memory injection is rebuilt every turn using the current query. Shared memory does NOT stay pinned forever—it participates in per-turn rebuild and respects the same context budget.

```
Agent Turn Starts
    │
    ▼
┌─────────────────────────────────────────┐
│  1. CONTEXT BUDGET CHECK                │
│     - max_turns: 20                       │
│     - compact_keep_recent_turns: 8        │
│     - prune_message_threshold: 30         │
│     - max_context_tokens: 128000          │
│     - target_context_pct: 0.75 (96000)    │
│     - Compaction triggers: turns > 20 OR tokens > 96000
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  2. MEMORY BUDGET ALLOCATION            │
│     - memory_budget config (default 20%)  │
│     - Private memory gets priority        │
│     - Shared memory gets capped slice     │
│     - If shared empty, private can expand │
│     - If private empty, shared can expand to cap only
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  3. PRIVATE RECALL (always)               │
│     - Query private memory (BM25)         │
│     - Optional: semantic search           │
│     - Counts against context budget       │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  4. SHARED RECALL (if authorized + space)│
│     - Determine accessible namespaces     │
│     - Query shared memory (FTS5 + vector) │
│     - Counts against SAME context budget    │
│     - Respects turn-based compaction      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  5. RESULT FUSION                       │
│     - Private results first (priority)    │
│     - Shared results fill remaining space │
│     - Source attribution on all entries   │
│     - Re-rank by relevance + recency      │
└─────────────────────────────────────────┘
    │
    ▼
Prompt Injection via prompt_block_contextual()
```

**Token Estimation**: Uses existing `len * 2 / 7` approximation.

**Allocation Pseudocode**:
```rust
fn allocate_memory_budget(
    total_available: usize,
    private_results: Vec<Memory>,
    shared_results: Vec<SharedMemory>,
    config: &ContextBudget,
) -> (Vec<Memory>, Vec<SharedMemory>) {
    let memory_budget = (total_available as f32 * config.memory_budget_pct) as usize;
    let private_budget = memory_budget.saturating_sub(shared_results.token_estimate());
    let capped_shared = std::cmp::min(shared_results.token_estimate(), memory_budget / 2);
    
    // Private gets priority; shared gets capped slice
    let private_selected = select_within_budget(private_results, private_budget);
    let remaining = total_available - private_selected.token_estimate();
    let shared_cap = std::cmp::min(capped_shared, remaining);
    let shared_selected = select_within_budget(shared_results, shared_cap);
    
    (private_selected, shared_selected)
}
```

**Critical Integration Point**: Shared memory uses the SAME context budget as private memory. It is not a separate pool. Both private and shared memory participate in turn-based compaction.

### 2.4 WRITE FLOW (TOOL-FIRST)

```
Agent calls save_memory with namespace parameter
    │
    ▼
┌─────────────────────────────────────────┐
│  AUTHORIZATION CHECK                  │
│  - Verify namespace in agent's config   │
│  - Check rate limits (per-agent)        │
│  - Basic content validation (size)      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  WRITE TO SHARED MEMORY                 │
│  - Insert into shared_memories table    │
│  - Generate embedding (async via        │
│    existing provider infrastructure)    │
│  - Update FTS5 index                    │
│  - Write audit log (append-only)        │
└─────────────────────────────────────────┘
```

### 2.5 TOOL/API CHANGES (MVP: EXTEND EXISTING)

#### Modified Tools (MVP)

| Tool | Change |
|------|--------|
| `save_memory` | Add optional `namespace` parameter. Default: private (`None`). Shared requires config authorization. |
| `recall_memory` | Add optional `namespace` parameter. Default: searches all accessible namespaces. Supports `namespace="*"` for all authorized. |
| `forget_memory` | Add optional `namespace` parameter. Can delete from shared if authorized. |

**Parameter Schema**:
```rust
pub struct SaveMemoryParams {
    pub content: String,
    pub namespace: Option<String>,  // NEW: None = private, Some("public/docs") = shared
    pub tags: Option<Vec<String>>,
    pub ttl_seconds: Option<u64>, // NEW: Optional expiration
}

pub struct RecallMemoryParams {
    pub query: String,
    pub namespace: Option<String>,  // NEW: None = private only, Some("*") = all authorized shared
    pub limit: Option<usize>,
    pub use_semantic: Option<bool>, // Use embeddings if available
}
```

#### Tool Error Handling

**Alignment with Current Tool Conventions:**
- **Hard failures**: Return `Err(anyhow!("..."))` or use `bail!("...")` for unexpected errors
- **Recoverable failures**: Return structured JSON in `Ok(...)` with error details
- **Soft results** (like `forget_memory` style `not_found`): Return structured success with `found: false`

**Structured Error Envelope**:
```rust
pub struct SharedMemoryError {
    pub code: String,           // Error code from table below
    pub message: String,        // Human-readable message
    pub recoverable: bool,      // Can agent retry or adjust?
    pub namespace: Option<String>,
}

// Error Codes
pub enum SharedMemoryErrorCode {
    NamespaceNotFound,      // Soft - namespace doesn't exist
    NamespaceNotAuthorized, // Hard - agent lacks permission
    ContentTooLarge,        // Soft - exceeds max_entry_size
    SecretDetected,         // Soft - keyword blocklist match
    EmbeddingFailed,      // Soft - provider down, falls back to BM25
    RateLimitExceeded,      // Soft - retry after cooldown
    EntryNotFound,          // Soft - forget_memory target missing
    DatabaseError,          // Hard - internal SQLite error
}
```

**Classification:**
| Error | Type | Agent Action |
|-------|------|--------------|
| NamespaceNotAuthorized | Hard | Cannot proceed; needs admin intervention |
| ContentTooLarge | Soft | Truncate and retry |
| EmbeddingFailed | Soft | Proceed with BM25-only; degraded but functional |
| RateLimitExceeded | Soft | Wait and retry |
| DatabaseError | Hard | Log and escalate; may need restart |

**Post-MVP HTTP Mapping** (v1.0): Map structured errors to appropriate HTTP status codes (401/403/429/500) for gateway endpoints.

#### New Tools (v1.0 - Post-MVP)

| Tool | Purpose |
|------|---------|
| `grant_shared_access` | Admin tool: grant agent access to namespace |
| `revoke_shared_access` | Admin tool: revoke namespace access |
| `list_shared_namespaces` | List namespaces agent can access |

#### HTTP API (MVP Wave 1B - IMPLEMENTED)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/agents/:agent_id/memory?namespace=X` | Query shared memory (via namespace param) |
| POST | `/api/agents/:agent_id/memory/shared` | Write to shared memory (auth required) |
| DELETE | `/api/agents/:agent_id/memory/shared` | Delete from shared memory (auth required) |
| GET | `/api/memory/namespaces` | List accessible namespaces |

**Implementation Note**: HTTP API was originally planned for v1.0 but implemented in MVP Wave 1B (April 2026). All endpoints check config-based ACL before allowing operations.

### 2.6 INTEGRATION POINTS

| Module | Integration |
|--------|-------------|
| `src/store/mod.rs` | New table: `shared_memories` with FTS5 index |
| `src/tools/builtins/memory.rs` | Add namespace parameter handling, config-based auth |
| `src/memory/mod.rs` | Extend `MemoryStore` with shared memory query methods |
| `src/context/mod.rs` | Include shared memory in prompt block generation |
| `src/agent/turn.rs` | Inject authorized shared memory during message building; counts against budget |
| `src/gateway/handlers/memory.rs` | Shared memory HTTP endpoints (MVP Wave 1B) |

### 2.7 EMBEDDING INTEGRATION (REUSE EXISTING)

**Critical Design Decision**: Shared memory embeddings reuse the existing `ModelProvider` trait and embedding infrastructure. No separate subsystem.

```rust
// Existing pattern in src/models/
pub trait ModelProvider {
    async fn embed(&self, text: &str) -> Result<Vec<f32>>;
    // ... other methods
}

// Shared memory embedding flow:
// 1. Agent calls save_memory with namespace
// 2. Memory tool checks authorization
// 3. Text content passed to existing embed() via ProviderManager
// 4. Embedding stored in shared_embeddings table (BLOB)
// 5. Provider selection follows existing priority/fallback logic
```

**Embedding Storage**:
```rust
pub struct SharedEmbedding {
    pub entry_id: Uuid,
    pub embedding: Vec<f32>,     // Little-endian f32 BLOB
    pub dim: usize,              // Dimension (e.g., 1536, 768)
    pub model: String,           // Provider/model identifier (e.g., "openai/text-embedding-3-small")
    pub created_at: DateTime<Utc>,
}
```

**Query-Time Mismatch Handling**:
- At query time, check if stored `model`/`dim` matches current provider
- If mismatch: skip stale embedding for semantic scoring, fall back to BM25-only
- If provider outage: degrade to BM25-only search, do NOT fail the recall path
- Background re-embedding of stale embeddings: POST-MVP (v1.1)

**Key Points**:
- No new embedding providers needed
- No separate embedding configuration
- Follows existing provider fallback chain
- Same dimension handling as private memory
- Store `model` and `dim` with each embedding for future compatibility

---

## 3. DATA MODEL & STORAGE

### 3.1 SHARED MEMORY ENTITY (MVP)

```rust
/// Shared memory entry (MVP - simplified)
pub struct SharedMemoryEntry {
    pub entry_id: Uuid,
    pub namespace: String,           // e.g., "public/docs", "team/eng"
    pub path: String,                // Logical path within namespace
    pub author_agent_id: String,
    pub author_session_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub content_hash: String,        // SHA-256 for integrity
    pub content: String,             // Raw content (MVP: no structured schemas)
    pub tags: Vec<String>,
    pub access_count: u64,           // For usage analytics
    pub ttl: Option<DateTime<Utc>>,  // Optional expiration
}
```

**MVP Simplification**: Raw string content only. Structured schemas (ADR, patterns, etc.) are v1.0.

### 3.2 PROVENANCE (MVP: BASIC)

```rust
/// Provenance tracking (MVP - no cryptography)
pub struct Provenance {
    pub entry_id: Uuid,
    pub author_agent_id: String,
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub content_hash: String,        // For integrity verification
}

/// Trust level for cross-agent memory (v1.0)
pub enum TrustLevel {
    Self,        // Own writes
    Team,        // Same team namespace
    Public,      // Public namespace
    Unverified,  // Unknown origin (fallback)
}
```

**MVP Position**: Content hashes for integrity, no Ed25519 signatures. Signatures are v1.1+.

### 3.3 DATABASE SCHEMA (SQLITE)

```sql
-- Shared memories (single pool - no core/archival split in MVP)
CREATE TABLE shared_memories (
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
    ttl              INTEGER,       -- nullable unix timestamp
    UNIQUE(namespace, path)
);

CREATE INDEX idx_shared_namespace ON shared_memories(namespace);
CREATE INDEX idx_shared_author ON shared_memories(author_agent_id);
CREATE INDEX idx_shared_updated ON shared_memories(updated_at);

-- FTS5 for full-text search
CREATE VIRTUAL TABLE shared_memories_fts USING fts5(
    content,
    tags='shared_memories',
    content_rowid='rowid'
);

-- Triggers to sync FTS
CREATE TRIGGER shared_memories_ai AFTER INSERT ON shared_memories BEGIN
    INSERT INTO shared_memories_fts(rowid, content)
    VALUES (new.rowid, new.content);
END;

CREATE TRIGGER shared_memories_ad AFTER DELETE ON shared_memories BEGIN
    INSERT INTO shared_memories_fts(shared_memories_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER shared_memories_au AFTER UPDATE ON shared_memories BEGIN
    INSERT INTO shared_memories_fts(shared_memories_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
    INSERT INTO shared_memories_fts(rowid, content)
    VALUES (new.rowid, new.content);
END;

-- Embeddings for semantic search
CREATE TABLE shared_embeddings (
    entry_id         TEXT PRIMARY KEY,
    embedding        BLOB NOT NULL, -- f32 little-endian
    dim              INTEGER NOT NULL,
    model            TEXT NOT NULL,   -- Provider/model identifier for mismatch detection
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (entry_id) REFERENCES shared_memories(entry_id)
        ON DELETE CASCADE
);

CREATE INDEX idx_shared_embeddings_model ON shared_embeddings(model);

-- Audit log (append-only)
CREATE TABLE shared_audit_log (
    record_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp        INTEGER NOT NULL,
    operation        TEXT NOT NULL, -- 'read', 'write', 'delete'
    agent_id         TEXT NOT NULL,
    session_id       TEXT,
    namespace        TEXT,
    entry_id         TEXT,
    authorization    TEXT NOT NULL, -- 'allowed', 'denied'
    content_hash     TEXT,
    error            TEXT
);

CREATE INDEX idx_shared_audit_agent ON shared_audit_log(agent_id);
CREATE INDEX idx_shared_audit_namespace ON shared_audit_log(namespace);
CREATE INDEX idx_shared_audit_timestamp ON shared_audit_log(timestamp);
```

**MVP Simplifications**:
- Single `shared_memories` table (no core/archival split)
- No capability table (config-based ACL instead)
- No relationships table
- Basic audit log (no IP, no request_id)

### 3.4 CONFIG-BASED ACL (MVP)

```yaml
# config.yaml - shared memory authorization (MVP)
shared_memory:
  enabled: true
  
  # Context budget allocation
  memory_budget:
    percent_of_context: 20          # Shared memory % of total context budget
    max_percent: 50               # Hard cap even when private memory is empty
    
  # Audit log retention (days) - older entries auto-purged on startup
  audit_log_retention_days: 90      # Default: 90 days (0 = disable cleanup)
    
  # Namespace authorization (simple allowlist)
  namespaces:
    public:
      read:
        - "*"                    # All agents can read public
      write:
        - "agent:core"           # Only core agent can write public
        
    team/eng:
      read:
        - "agent:backend-*"      # Backend agents can read
        - "agent:frontend-*"       # Frontend agents can read
      write:
        - "agent:backend-lead"   # Only lead can write
        
    project/pinchy:
      read:
        - "*"
      write:
        - "agent:core"
        - "user:admin"           # Human admin can write via CLI
  
  # Per-agent defaults
  defaults:
    read_namespaces: ["public"]
    
  # Limits
  max_entry_size: 65536           # 64KB
  max_entries_per_agent: 1000
  rate_limit_writes_per_hour: 100
```

**ContextBudget Integration**:
```rust
pub struct ContextBudget {
    pub max_turns: u32 = 20,
    pub compact_keep_recent_turns: u32 = 8,
    pub prune_message_threshold: u32 = 30,
    pub max_context_tokens: usize = 128000,
    pub target_context_pct: f32 = 0.75,  // Compaction at 96k tokens
    pub memory_budget: MemoryBudget,      // NEW
}

pub struct MemoryBudget {
    pub percent_of_context: u8,     // Default 20
    pub max_percent: u8,          // Hard cap 50
}
```

**MVP Position**: Simple YAML-based ACL. No capability tokens, no JWT, no crypto. File-based config is sufficient for single-binary deployment.

**v1.0 Enhancement**: Database-backed capabilities with grant/revoke APIs.

### 3.5 DATABASE MIGRATION (MVP)

**Migration Strategy**: Additive migrations using `PRAGMA user_version` in `pinchy.db`. Startup migration runs in `PinchyDb::migrate()` before any shared memory operations.

**Concrete MVP Tables**:
- `shared_memories` - Core memory entries
- `shared_memories_fts` - FTS5 virtual table for BM25 search
- `shared_embeddings` - Vector embeddings with model/dim tracking
- `shared_audit_log` - Append-only operation log

**Migration Implementation**:
```rust
// In src/store/mod.rs - PinchyDb::migrate()
pub fn migrate(&self) -> Result<()> {
    let version: i32 = self.conn.query_row(
        "PRAGMA user_version",
        [],
        |row| row.get(0)
    )?;
    
    if version < 1 {
        self.migrate_v1_shared_memory()?;
    }
    // Future: if version < 2 { migrate_v2_... }
    
    Ok(())
}

fn migrate_v1_shared_memory(&self) -> Result<()> {
    let tx = self.conn.transaction()?;
    
    // Main table
    tx.execute(
        "CREATE TABLE IF NOT EXISTS shared_memories (
            entry_id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            path TEXT NOT NULL,
            author_agent_id TEXT NOT NULL,
    author_session_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            tags_json TEXT NOT NULL DEFAULT '[]',
            access_count INTEGER NOT NULL DEFAULT 0,
            ttl INTEGER,
            UNIQUE(namespace, path)
        )",
        [],
    )?;
    
    // Indexes
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_shared_namespace ON shared_memories(namespace)",
        [],
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_shared_author ON shared_memories(author_agent_id)",
        [],
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_shared_updated ON shared_memories(updated_at)",
        [],
    )?;
    
    // FTS5 virtual table
    tx.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS shared_memories_fts USING fts5(
            content,
            tags='shared_memories',
            content_rowid='rowid'
        )",
        [],
    )?;
    
    // FTS5 triggers
    tx.execute(
        "CREATE TRIGGER IF NOT EXISTS shared_memories_ai 
         AFTER INSERT ON shared_memories BEGIN
            INSERT INTO shared_memories_fts(rowid, content) VALUES (new.rowid, new.content);
         END",
        [],
    )?;
    tx.execute(
        "CREATE TRIGGER IF NOT EXISTS shared_memories_ad 
         AFTER DELETE ON shared_memories BEGIN
            INSERT INTO shared_memories_fts(shared_memories_fts, rowid, content) 
            VALUES ('delete', old.rowid, old.content);
         END",
        [],
    )?;
    tx.execute(
        "CREATE TRIGGER IF NOT EXISTS shared_memories_au 
         AFTER UPDATE ON shared_memories BEGIN
            INSERT INTO shared_memories_fts(shared_memories_fts, rowid, content) 
            VALUES ('delete', old.rowid, old.content);
            INSERT INTO shared_memories_fts(rowid, content) VALUES (new.rowid, new.content);
         END",
        [],
    )?;
    
    // Embeddings table with model/dim tracking
    tx.execute(
        "CREATE TABLE IF NOT EXISTS shared_embeddings (
            entry_id TEXT PRIMARY KEY,
            embedding BLOB NOT NULL,
            dim INTEGER NOT NULL,
            model TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (entry_id) REFERENCES shared_memories(entry_id) ON DELETE CASCADE
        )",
        [],
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_shared_embeddings_model ON shared_embeddings(model)",
        [],
    )?;
    
    // Audit log
    tx.execute(
        "CREATE TABLE IF NOT EXISTS shared_audit_log (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            operation TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            session_id TEXT,
            namespace TEXT,
            entry_id TEXT,
            authorization TEXT NOT NULL,
            content_hash TEXT,
            error TEXT
        )",
        [],
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_shared_audit_agent ON shared_audit_log(agent_id)",
        [],
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_shared_audit_namespace ON shared_audit_log(namespace)",
        [],
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_shared_audit_timestamp ON shared_audit_log(timestamp)",
        [],
    )?;
    
    // Version bump
    tx.execute("PRAGMA user_version = 1", [])?;
    
    tx.commit()?;
    Ok(())
}
```

**Startup Behavior**:
- Migration runs on every `pinchy start` in `PinchyDb::migrate()`
- Uses `IF NOT EXISTS` for idempotency
- Wrapped in transaction for atomicity

**Failure Handling**:
- Migration failure aborts startup (fail-fast)
- Error is logged with full context
- Admin must fix DDL issue or restore from backup

**Rollback Policy**:
- No automatic rollback on migration failure
- Restore from `pinchy.db.backup` if needed
- Version is only bumped after successful commit

**Idempotency Expectations**:
- All `CREATE` statements use `IF NOT EXISTS`
- All `CREATE TRIGGER` statements use `IF NOT EXISTS`
- Safe to run multiple times

**Phase 1 (MVP)**: New tables only; existing per-agent `memory.db` unchanged  
**Phase 2 (v1.0)**: Optional namespace hierarchy enforcement  
**Phase 3 (v1.1)**: Background TTL cleanup, soft deletes

---

## 4. SECURITY MODEL

### 4.1 THREAT MODEL

| Threat Category | Description | Severity | MVP Mitigation |
|-----------------|-------------|----------|----------------|
| Unauthorized Read | Agent reads shared memory without permission | High | Config-based ACL |
| Unauthorized Write | Agent overwrites/poisons shared memory | Critical | Config-based ACL + write allowlists |
| Secret Leakage | Credentials in shared memory | Critical | Basic keyword detection + block |
| Prompt Contamination | Shared context pollutes reasoning | Medium | Source attribution in prompts |
| Provenance Spoofing | Agent impersonates another | Medium | Agent ID binding (v1.0: crypto signatures) |
| Denial of Memory | Flooding shared memory | Low | Rate limits + size quotas |

### 4.2 MVP SECURITY PRINCIPLES

1. **Explicit Over Implicit**: No automatic sharing
2. **Default Deny**: No shared access without config authorization
3. **Local-First**: Private memory is preferred and fully isolated
4. **Config-Based ACL**: Simple YAML allowlists, no complex capability system in MVP
5. **Basic Provenance**: Author tracking with content hashes
6. **Enhanced Secret Detection**: Pattern detection for JWT tokens, SSH keys (OpenSSH formats), Stripe-style keys (sk_live_, sk_test_, etc.), Bearer tokens, AWS credential patterns, and high-entropy values after credential keywords. ML-based detection deferred to v1.2+.

### 4.3 TRUST BOUNDARIES (MVP)

```
┌─────────────────────────────────────────────────────────────┐
│                      PINCHY GATEWAY                         │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           PRIVATE AGENT WORKSPACE (Trust Zone A)      │  │
│  │  ┌─────────────────────────────────────────────┐      │  │
│  │  │  Agent A Private Memory                     │      │  │
│  │  │  - memory.db (SQLite)                       │      │  │
│  │  │  - Fully isolated                           │      │  │
│  │  └─────────────────────────────────────────────┘      │  │
│  │                        │                              │  │
│  │                        ▼ (Tool Call + Config Auth)     │  │
│  │  ┌─────────────────────────────────────────────┐      │  │
│  │  │      SHARED MEMORY (Trust Zone B)             │      │  │
│  │  │  ┌─────────┐  ┌─────────┐                    │      │  │
│  │  │  │  public │  │team/eng │                    │      │  │
│  │  │  │  docs   │  │convent- │                    │      │  │
│  │  │  │         │  │ions     │                    │      │  │
│  │  │  └─────────┘  └─────────┘                    │      │  │
│  │  │                                             │      │  │
│  │  │  - Read: Config allowlist                   │      │  │
│  │  │  - Write: Config allowlist                  │      │  │
│  │  │  - Audit: Basic logging                     │      │  │
│  │  └─────────────────────────────────────────────┘      │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 DATA CLASSIFICATION

| Classification | Description | Shared Memory Eligibility |
|----------------|-------------|---------------------------|
| **PUBLIC** | Non-sensitive documentation | ✅ Permitted |
| **INTERNAL** | Project-specific knowledge | ✅ Permitted with namespace restriction |
| **RESTRICTED** | Credentials, PII, security-sensitive | ❌ PROHIBITED (basic detection) |
| **AGENT-LOCAL** | Agent-specific reasoning | ❌ PROHIBITED |

### 4.5 ACCESS CONTROL (MVP: CONFIG-BASED)

**Namespace Matching:**
- Wildcard `*` matches any agent ID for read
- Pattern matching: `agent:backend-*` matches `agent:backend-lead`, `agent:backend-worker-1`
- Exact match: `agent:core` only matches `agent:core`
- Pattern order in config matters: first match wins

**Read Access**:
- Check if agent_id matches namespace `read` allowlist in config
- Pattern matching supported: `agent:backend-*` matches `agent:backend-lead`
- `namespace="*"` in tool call queries all namespaces where agent has read permission
- `namespace="team/*"` queries all authorized namespaces under `team/` prefix
- Default: deny unless explicitly allowed

**Write Access**:
- Check if agent_id matches namespace `write` allowlist in config
- More restrictive than read by default
- Implicit namespace creation: first authorized write creates the namespace
- Default: deny unless explicitly allowed

**Result Attribution:**
Every recalled entry includes:
```rust
pub struct MemoryResult {
    pub content: String,
    pub namespace: Option<String>,  // None = private, Some = shared namespace
    pub author_agent_id: String,
    pub created_at: DateTime<Utc>,
    pub relevance_score: f32,
}
```

**v1.0 Enhancement**: Database-backed capabilities with grant/revoke admin tools.

### 4.6 CONTENT VALIDATION (MVP: BASIC)

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTENT VALIDATION LAYER                 │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Size       │  │   Keyword    │  │   Schema     │      │
│  │   Limit      │  │   Blocklist  │  │   (v1.0)     │      │
│  │              │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Keyword Blocklist (MVP)**:
- "password:", "secret:", "api_key:", "token:"
- High-entropy string detection (basic entropy check)
- "ignore previous", "disregard instructions"

**Response on Detection**:
1. Write operation REJECTED
2. Agent notified: "Potential secret detected. Use private memory or secrets store."
3. Audit log entry

### 4.7 SECURITY BY IMPLEMENTATION PHASE

| Feature | MVP | v1.0 | v1.1 | v1.2+ |
|---------|-----|------|------|-------|
| Config-based ACL | ✅ | ✅ | ✅ | ✅ |
| Namespace hierarchy | Basic | Full | Full | Full |
| Content hash provenance | ✅ | ✅ | ✅ | ✅ |
| Ed25519 signatures | ❌ | ❌ | ✅ | ✅ |
| Database capabilities | ❌ | ✅ | ✅ | ✅ |
| Secret detection | Basic | Improved | Improved | ML-based |
| Schema validation | ❌ | ✅ | ✅ | ✅ |
| Audit log streaming | ❌ | ❌ | SIEM | SIEM |
| Entry encryption | ❌ | ❌ | ❌ | Research |

---

## 5. CONTEXT INTEGRATION

### 5.1 SHARED MEMORY COUNTS AGAINST BUDGET

**Critical Requirement**: Shared memory retrieval consumes the same context/token budget as private memory. This is not optional—it preserves existing behavior.

**Actual ContextBudget Values**:
```rust
pub struct ContextBudget {
    pub max_turns: u32 = 20,                 // Trigger compaction
    pub compact_keep_recent_turns: u32 = 8,  // Keep recent turns after compaction
    pub prune_message_threshold: u32 = 30,   // Pruning threshold
    pub max_context_tokens: usize = 128000,    // Hard limit
    pub target_context_pct: f32 = 0.75,        // Compaction at 96k tokens (75%)
}
```

**Compaction Triggers**:
- Turn count > 20, OR
- Estimated tokens > 96000 (128000 * 0.75)

**Token Estimation**: Uses existing `len * 2 / 7` approximation.

**Memory Injection**: Uses `prompt_block_contextual(&user_content, 4000)` for current context.

**Shared/Private Budget Allocation**:
```rust
// In src/context/mod.rs or src/agent/turn.rs
pub fn build_prompt_with_memory(
    &self,
    budget: ContextBudget,
    agent_id: &str,
    query: &str,
) -> Result<Prompt> {
    // 1. Calculate available context after conversation history
    let history_tokens = estimate_history_tokens();
    let available = budget.max_context_tokens - history_tokens;
    
    // 2. Memory budget allocation (default 20% of available, max 50%)
    let memory_config = &self.config.memory_budget;
    let base_memory_budget = (available as f32 * memory_config.percent_of_context as f32 / 100.0) as usize;
    let max_memory_budget = (available as f32 * memory_config.max_percent as f32 / 100.0) as usize;
    
    // 3. Query private memory (always allowed)
    let private_memories = self.recall_private(query, base_memory_budget)?;
    let private_tokens = private_memories.token_estimate();
    
    // 4. Calculate shared allowance
    // Private gets priority; shared fills remaining up to cap
    let remaining_after_private = available.saturating_sub(private_tokens);
    let shared_cap = std::cmp::min(
        max_memory_budget.saturating_sub(private_tokens),
        remaining_after_private
    );
    
    // 5. Query shared memory (if authorized and space available)
    let shared_memories = if self.has_shared_access(agent_id) && shared_cap > 0 {
        self.recall_shared(query, shared_cap)?
    } else {
        vec![]
    };
    
    // 6. Combine within budget with source attribution
    let combined = merge_within_budget(private_memories, shared_memories, available);
    let attributed = add_source_attribution(combined);
    
    Ok(Prompt::with_memory(attributed))
}
```

**Key Allocation Rules**:
- Shared memory injection is rebuilt every turn using current query
- Shared memory is NOT pinned forever—participates in per-turn rebuild
- Both shared and private memory count toward same effective context limit
- Private memory gets priority allocation
- Shared memory gets a capped slice (default 20%, max 50%)
- If shared memory is empty, private can use freed slice
- If private is empty, shared can expand only to cap (max 50%)

### 5.2 TURN-BASED COMPACTION INTEGRATION

Shared memory respects the existing turn-based compaction system:

```rust
// Existing pattern in src/agent/turn.rs
pub struct TurnContext {
    pub turn_count: u32,
    pub last_compaction_turn: u32,
    pub compact_keep_recent_turns: u32 = 8,
}

// Shared memory is included in compaction:
// - When compaction triggers (turns > 20 OR tokens > 96000), both private AND shared memories are re-evaluated
// - Shared memories may be evicted from context even if still in database
// - Relevance scoring applies to both pools
// - Memory is rebuilt fresh every turn after compaction
```

### 5.3 SOURCE ATTRIBUTION IN PROMPTS

All shared memory entries injected into prompts include source attribution:

```
[Private Memory]
- Content from agent's private memory...

[Shared Memory from namespace: public/docs]
Author: agent:backend-lead | Created: 2025-04-01
- Content from shared memory...

[Shared Memory from namespace: team/eng]
Author: agent:frontend-lead | Created: 2025-04-01
- Content from shared memory...
```

This prevents prompt contamination by clearly distinguishing sources.

---

## 6. IMPLEMENTATION WORK BREAKDOWN

### DEPENDENCY GRAPH

```
SM-001 (Schema)
    ├── SM-002 (FTS5)
    ├── SM-003 (Embeddings table)
    └── SM-004 (SharedMemoryStore)
            ├── SM-005 (save_shared)
            ├── SM-006 (recall_shared)
            ├── SM-007 (forget_shared)
            └── SM-008 (auth check)
                    ├── SM-009 (tool namespace param)
                    ├── SM-010 (context integration)
                    └── SM-011 (budget counting)
                            └── SM-012 (turn compaction)
                                    └── SM-013 (E2E test)
```

### EPIC 1: CORE STORAGE LAYER

| Ticket | Description | Est | Depends |
|--------|-------------|-----|---------|
| SM-001 | Implement `PinchyDb::migrate()` with PRAGMA user_version | 2 | - |
| SM-002 | Create `shared_memories` table schema (idempotent) | 2 | SM-001 |
| SM-003 | Add FTS5 virtual table + triggers (idempotent) | 2 | SM-002 |
| SM-004 | Add `shared_embeddings` table with model/dim | 2 | SM-001 |
| SM-005 | Add `shared_audit_log` table | 2 | SM-001 |
| SM-006 | Create `SharedMemoryStore` struct in `src/memory/shared.rs` | 3 | SM-002 |
| SM-007 | Implement `save_shared` with content hashing | 3 | SM-006 |
| SM-008 | Implement `recall_shared` with BM25 + embedding mismatch handling | 3 | SM-006 |
| SM-009 | Implement `forget_shared` with auth check | 2 | SM-006 |

### EPIC 2: CONFIG-BASED AUTHORIZATION (MVP)

| Ticket | Description | Est | Depends |
|--------|-------------|-----|---------|
| SM-010 | Load namespace ACL from config.yaml | 2 | - |
| SM-011 | Add `memory_budget` config to ContextBudget | 2 | - |
| SM-012 | Implement `can_read_namespace(agent_id, ns)` with wildcard support | 2 | SM-010 |
| SM-013 | Implement `can_write_namespace(agent_id, ns)` | 2 | SM-010 |
| SM-014 | Add rate limiting per agent/namespace | 2 | SM-010 |
| SM-015 | Basic content validation (size, keywords) | 2 | - |

### EPIC 3: TOOL INTEGRATION

| Ticket | Description | Est | Depends |
|--------|-------------|-----|---------|
| SM-016 | Add `namespace` parameter to `save_memory` tool | 2 | SM-007, SM-013 |
| SM-017 | Add `namespace` parameter to `recall_memory` tool with wildcard support | 2 | SM-008, SM-012 |
| SM-018 | Add `namespace` parameter to `forget_memory` tool | 2 | SM-009, SM-013 |
| SM-019 | Reuse existing `embed()` via ProviderManager with model/dim storage | 2 | SM-004 |
| SM-020 | Implement embedding mismatch handling (BM25 fallback) | 2 | SM-019 |
| SM-021 | Implement structured error envelope for shared memory ops | 2 | - |
| SM-022 | Update tool schemas + documentation | 1 | SM-016, SM-017, SM-018 |

### EPIC 4: CONTEXT INTEGRATION (CRITICAL)

| Ticket | Description | Est | Depends |
|--------|-------------|-----|---------|
| SM-023 | Add shared memory query to context builder | 3 | SM-008 |
| SM-024 | Implement memory budget allocation (private priority, shared cap) | 3 | SM-023, SM-011 |
| SM-025 | Integrate with existing turn-based compaction (turns > 20 OR tokens > 96000) | 3 | SM-024 |
| SM-026 | Add source attribution to prompt injection (namespace + author) | 2 | SM-023 |
| SM-027 | Implement per-turn memory rebuild behavior | 2 | SM-025 |

### EPIC 5: AUDIT & OBSERVABILITY

| Ticket | Description | Est | Depends |
|--------|-------------|-----|---------|
| SM-028 | Implement audit logging for all shared memory operations | 3 | SM-005 |
| SM-029 | Add basic metrics (reads/writes per namespace) | 2 | - |
| SM-030 | Feature flag implementation | 2 | - |

### EPIC 6: POST-MVP ENHANCEMENTS (v1.0+)

| Ticket | Description | Est | Phase |
|--------|-------------|-----|-------|
| SM-031 | Database-backed capabilities table | 3 | v1.0 |
| SM-032 | Admin grant/revoke tools | 3 | v1.0 |
| SM-033 | HTTP API endpoints for shared memory | 3 | v1.0 |
| SM-034 | Structured content schemas | 3 | v1.0 |
| SM-035 | Background re-embedding for stale embeddings | 3 | v1.1 |
| SM-036 | Archival layer with TTL cleanup | 3 | v1.1 |
| SM-037 | Ed25519 signatures | 3 | v1.1 |
| SM-038 | Entry relationships | 3 | v1.1 |
| SM-039 | Reputation scoring | 3 | v1.2 |

### DEPENDENCY GRAPH

```
SM-001 (Migration)
    ├── SM-002 (shared_memories table)
    ├── SM-003 (FTS5)
    ├── SM-004 (embeddings table)
    └── SM-005 (audit_log table)
            └── SM-006 (SharedMemoryStore)
                    ├── SM-007 (save_shared)
                    ├── SM-008 (recall_shared)
                    ├── SM-009 (forget_shared)
                    └── SM-010 (config ACL)
                            ├── SM-011 (memory_budget)
                            ├── SM-012 (can_read with wildcard)
                            ├── SM-013 (can_write)
                            └── SM-014 (rate limit)
                                    ├── SM-016 (tool namespace param)
                                    ├── SM-017 (recall wildcard)
                                    ├── SM-023 (context integration)
                                    └── SM-024 (budget allocation)
                                            ├── SM-025 (turn compaction)
                                            └── SM-027 (per-turn rebuild)
                                                    └── SM-030 (E2E test)
```

### 7.2 TESTING STRATEGY

| Layer | Tests |
|-------|-------|
| Unit | SharedMemoryStore methods, ACL validation, content hashing |
| Integration | Tool calls with namespace, context budget counting |
| Security | ACL bypass attempts, secret detection, unauthorized access |
| Performance | 10K shared entries, concurrent reads, embedding throughput |
| E2E | Multi-agent shared workflow, audit log verification |

### 7.3 FAILURE MODES

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Shared DB corruption | Shared memory unavailable | Fallback to private only; backups |
| Embedding provider down | Semantic search degrades | Fallback to BM25-only |
| Config ACL misconfiguration | Unauthorized access possible | Validate config on startup |
| Namespace flooding | Storage exhaustion | Rate limiting + size quotas |

### 7.4 EMERGENCY PROCEDURES

```bash
# Disable shared memory immediately
pinchy admin shared-memory disable

# Check status
pinchy admin shared-memory status

# Backup before rollback
cp ~/.pinchy/pinchy.db ~/.pinchy/pinchy.db.backup
```

---

## 8. DESIGN DECISIONS & REJECTED ALTERNATIVES

### 8.1 CHOSEN DESIGN

**Tool-First, Config-Auth, Single-Pool Shared Memory**

- Extend existing `save_memory`, `recall_memory`, `forget_memory` with namespace
- Config-based ACL (not capabilities) for MVP simplicity
- Single shared pool (no core/archival) for MVP
- Reuse existing embedding infrastructure
- Shared memory counts against same context budget

### 8.2 REJECTED ALTERNATIVES

| Alternative | Rationale |
|-------------|-----------|
| Full Working/Core/Archival layers | Too complex for MVP. Single pool is sufficient. |
| Capability-based auth in MVP | Overengineering. Config-based ACL is sufficient for single-binary. |
| Separate embedding subsystem | Violates "reuse existing" principle. ProviderManager handles this. |
| Broad HTTP API in MVP | Tool-first approach is more consistent with Pinchy patterns. |
| Ed25519 signatures in MVP | Cryptographic provenance is v1.1+. Content hashes sufficient for MVP. |
| Heavy secret detection | Basic keyword blocklist is sufficient for MVP. |
| Automatic memory promotion | Too magical. Explicit write paths preserve agent autonomy. |

### 8.3 DECISION LOG

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-01 | Config-based ACL over capabilities | Simpler for single-binary, sufficient for MVP |
| 2026-04-01 | Single pool over three layers | Reduced complexity, defer layering to v1.1+ |
| 2026-04-01 | Tool-first over HTTP-first | Consistent with Pinchy's tool-centric design |
| 2026-04-01 | Reuse ProviderManager for embeddings | No new subsystem needed |
| 2025-04-01 | Shared counts against same budget | Preserves turn-based compaction behavior |
| 2025-04-01 | Content hashes only in MVP | Cryptographic signatures deferred to v1.1 |
| 2025-04-01 | PRAGMA user_version for migrations | Simple, idempotent, SQLite-native |
| 2025-04-01 | Per-turn memory rebuild | Memory not pinned forever, respects context budget |
| 2025-04-01 | Private priority / shared capped allocation | Balances usefulness with private memory needs |
| 2025-04-01 | BM25 fallback on embedding mismatch | Degrades gracefully, doesn't fail recall |
| 2025-04-01 | Namespace wildcard matching (`*`, `prefix/*`) | Flexible querying without complex traversal |
| 2025-04-01 | Structured error envelope | Aligns with existing tool conventions |
| 2025-04-01 | Model/dim stored with embeddings | Enables future re-embedding, mismatch detection |

---

## 9. MVP VS LATER BOUNDARIES

### 9.1 MVP (WEEK 1-2)

**In Scope**:
- `PinchyDb::migrate()` with `PRAGMA user_version`
- `shared_memories` table with FTS5 (idempotent DDL)
- `shared_embeddings` table with model/dim tracking
- `shared_audit_log` table
- Config-based namespace ACL with wildcard matching
- `memory_budget` config in ContextBudget
- `namespace` parameter on `save_memory`, `recall_memory`, `forget_memory`
- Wildcard namespace queries (`*`, `prefix/*`)
- Structured error envelope with error codes
- BM25-only fallback on embedding mismatch
- `public/` and limited team namespaces
- Basic audit logging
- Shared memory counts against context budget (128k tokens, 75% target)
- Per-turn memory rebuild behavior
- Private priority / shared capped allocation
- Integration with turn-based compaction (20 turns / 96k token trigger)
- Source attribution in prompts (namespace + author)
- Basic content validation (size, keyword blocklist)
- Content hash provenance

**Explicitly Out**:
- Working/Core/Archival promotion layers
- Capability database (config only)
- Admin grant/revoke tools
- Background re-embedding
- Ed25519 signatures
- Structured content schemas
- Complex secret detection
- Entry relationships
- Reputation scoring

### 9.2 V1.0 (WEEK 3-4)

- ~~HTTP API endpoints (`/api/memory/*`)~~ **MOVED TO MVP Wave 1B - COMPLETE**
- Database-backed capability system
- Admin grant/revoke tools
- Full namespace hierarchy enforcement
- Structured content schemas (ADR, patterns)
- Improved secret detection
- Error-to-HTTP status mapping

### 9.3 V1.1 (MONTH 2)

- Background re-embedding for stale embeddings
- Archival layer with TTL cleanup
- Background promotion/demotion (opt-in)
- Ed25519 signatures
- Entry relationships (supersedes, relates_to)
- SIEM audit streaming

### 9.4 V1.2+ (FUTURE)

- Graph traversal queries
- Agent reputation scoring
- Cross-gateway sync (research)
- ML-based poisoning detection
- Entry encryption

---

## 10. OPEN QUESTIONS

### 10.1 PRE-IMPLEMENTATION (RESOLVED)

| Question | Resolution | Location in Spec |
|----------|------------|------------------|
| Context budget allocation | 20% default, 50% cap, private priority | Section 5.1 |
| Compaction triggers | turns > 20 OR tokens > 96000 | Section 5.1, 5.2 |
| Embedding model/dim mismatch | Skip stale, BM25-only fallback | Section 2.7 |
| Provider outage handling | Degrade to BM25-only | Section 2.7 |
| Namespace wildcard semantics | `*`=all authorized, `prefix/*`=prefix match | Section 2.2 |
| Implicit namespace creation | First authorized write creates namespace | Section 2.2 |
| Migration strategy | `PRAGMA user_version`, idempotent DDL | Section 3.5 |
| Tool error handling | Hard=Err(), Soft=Ok(JSON), structured envelope | Section 2.5 |
| Default shared memory budget %? | 20% (configurable) | Section 3.4 |
| Audit log retention in single-binary? | 90 days, auto-cleanup on startup | Section 7.1 |

### 10.2 POST-MVP (RESEARCH)

| Question | Timeline |
|----------|----------|
| Background re-embedding of stale embeddings? | v1.1 |
| Should we add agent reputation scores? | v1.2 |
| How to handle GDPR deletion requests? | v1.1 (soft delete) |
| Multi-gateway replication? | v2.0 |
| Namespace ownership transfer? | v1.1 |
| Should shared memory support attachments? | v1.1 |

---

## 11. APPENDIX

### 11.1 SECURITY CHECKLIST (MVP)

- [ ] Config-based ACL loaded and validated
- [ ] Namespace authorization checks on all shared operations (including wildcard matching)
- [ ] Content size limits enforced
- [ ] Basic keyword blocklist for secrets
- [ ] Audit logging enabled
- [ ] Source attribution in prompt injection (namespace + author)
- [ ] Rate limiting per agent
- [ ] Shared memory counts against context budget (128k max, 96k compaction trigger)
- [ ] Per-turn memory rebuild (shared not permanently pinned)
- [ ] Private priority / shared capped allocation
- [ ] Integration with turn-based compaction (20 turns)
- [ ] Error messages don't leak namespace existence
- [ ] Emergency "disable shared memory" switch
- [ ] Embedding model/dim stored and mismatch handled (BM25 fallback)
- [ ] Structured error envelope for shared memory operations

### 11.2 VERIFIED CODE PATHS

The following code paths are explicitly referenced and must be accurately maintained:

- `src/store/mod.rs` - Database migrations and table creation
- `src/agent/turn.rs` - Agent turn processing, context building
- `src/memory/mod.rs` - MemoryStore trait and implementations
- `src/tools/builtins/memory.rs` - save_memory, recall_memory, forget_memory tools
- `src/gateway/handlers/memory.rs` - HTTP handlers (v1.0+)

### 11.3 INCIDENT RESPONSE (MVP)

**Suspected Poisoned Memory Entry**:
1. Identify entry via audit log
2. Use `forget_memory` with namespace to remove
3. Create corrected entry with clear provenance

**Suspected Unauthorized Access**:
1. Check audit logs
2. Update config ACL to remove access
3. Restart to reload config

**Secret Leakage**:
1. Use `forget_memory` to remove immediately
2. Rotate any exposed credentials
3. Review audit log for access scope

---

*End of Specification*
