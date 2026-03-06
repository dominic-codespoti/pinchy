#!/usr/bin/env bash
# migrate-jsonl-to-sqlite.sh — One-shot migration of legacy JSONL/JSON files
# into the consolidated pinchy.db SQLite database.
#
# Migrates:
#   sessions/index.jsonl          → sessions table
#   CURRENT_SESSION               → sessions.is_current flag
#   sessions/*.jsonl              → exchanges table
#   *.receipts.jsonl              → receipts table
#   cron_jobs.json                → cron_jobs table
#   cron_events/*.json            → cron_events table
#   heartbeat_status.json         → heartbeat_status table
#
# After migration, old files are moved to <pinchy_home>/_legacy_backup/
# so they can be inspected or deleted later.
#
# Usage:
#   ./scripts/migrate-jsonl-to-sqlite.sh [PINCHY_HOME]
#
# If PINCHY_HOME is not passed as an argument, it falls back to the
# PINCHY_HOME env var, then ~/.pinchy.
set -euo pipefail

# ── Resolve PINCHY_HOME ──────────────────────────────────────────────────

PINCHY_HOME="${1:-${PINCHY_HOME:-$HOME/.pinchy}}"
DB="$PINCHY_HOME/pinchy.db"
BACKUP="$PINCHY_HOME/_legacy_backup"
AGENTS_DIR="$PINCHY_HOME/agents"

log()  { echo "[migrate] $*"; }
warn() { echo "[migrate] WARNING: $*" >&2; }
die()  { echo "[migrate] FATAL: $*" >&2; exit 1; }

if [[ ! -d "$PINCHY_HOME" ]]; then
    die "PINCHY_HOME directory does not exist: $PINCHY_HOME"
fi

# Ensure sqlite3 is available
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not found — install it first"
command -v jq >/dev/null 2>&1      || die "jq not found — install it first"

log "PINCHY_HOME = $PINCHY_HOME"
log "Database    = $DB"

# ── Create DB + schema if needed ─────────────────────────────────────────

sqlite3 "$DB" <<'SQL'
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sessions (
    session_id  TEXT PRIMARY KEY,
    agent_id    TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    title       TEXT,
    is_current  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);

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
CREATE INDEX IF NOT EXISTS idx_exchanges_session ON exchanges(session_id, id);

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
CREATE INDEX IF NOT EXISTS idx_receipts_session ON receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_receipts_agent   ON receipts(agent_id);

CREATE TABLE IF NOT EXISTS cron_jobs (
    agent_id         TEXT NOT NULL,
    name             TEXT NOT NULL,
    schedule         TEXT NOT NULL,
    message          TEXT,
    kind             TEXT NOT NULL DEFAULT 'Message',
    depends_on       TEXT,
    max_retries      INTEGER,
    retry_delay_secs INTEGER,
    condition        TEXT,
    retry_count      INTEGER NOT NULL DEFAULT 0,
    last_status      TEXT,
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
CREATE INDEX IF NOT EXISTS idx_cron_events_job ON cron_events(job_id, scheduled_at);

CREATE TABLE IF NOT EXISTS heartbeat_status (
    agent_id         TEXT PRIMARY KEY,
    enabled          INTEGER NOT NULL DEFAULT 1,
    health           TEXT NOT NULL DEFAULT 'OK',
    last_tick        INTEGER,
    next_tick        INTEGER,
    interval_secs    INTEGER,
    message_preview  TEXT,
    latest_session   TEXT
);
SQL

log "Schema ensured."

# ── Counters ─────────────────────────────────────────────────────────────

SESSIONS_MIGRATED=0
EXCHANGES_MIGRATED=0
RECEIPTS_MIGRATED=0
CRON_JOBS_MIGRATED=0
CRON_EVENTS_MIGRATED=0
HEARTBEATS_MIGRATED=0
FILES_CLEANED=0

# ── Helper: escape a string for SQL single-quoting ───────────────────────

sql_escape() {
    # Doubles single-quotes for SQL string literals
    printf '%s' "$1" | sed "s/'/''/g"
}

# ── 1. Session index (index.jsonl) ──────────────────────────────────────

migrate_session_index() {
    local index_file="$1"
    [[ -f "$index_file" ]] || return 0

    log "Migrating session index: $index_file"
    local count=0

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue

        local session_id agent_id created_at title
        session_id=$(echo "$line" | jq -r '.session_id // empty') || continue
        agent_id=$(echo "$line" | jq -r '.agent_id // empty')     || continue
        created_at=$(echo "$line" | jq -r '.created_at // 0')     || continue
        title=$(echo "$line" | jq -r '.title // empty')           || continue

        [[ -z "$session_id" ]] && continue
        [[ -z "$agent_id" ]]   && continue

        sqlite3 "$DB" "INSERT OR IGNORE INTO sessions (session_id, agent_id, created_at, title)
            VALUES ('$(sql_escape "$session_id")', '$(sql_escape "$agent_id")',
                    $created_at, '$(sql_escape "$title")');"
        ((count++)) || true
    done < "$index_file"

    SESSIONS_MIGRATED=$((SESSIONS_MIGRATED + count))
    log "  → $count session index entries"
}

# ── 2. CURRENT_SESSION files ────────────────────────────────────────────

migrate_current_session() {
    local agent_id="$1" workspace="$2"
    local cs_file="$workspace/CURRENT_SESSION"
    [[ -f "$cs_file" ]] || return 0

    local session_id
    session_id=$(cat "$cs_file" | tr -d '[:space:]')
    [[ -z "$session_id" ]] && return 0

    log "  Setting current session for $agent_id → $session_id"
    sqlite3 "$DB" "UPDATE sessions SET is_current = 0 WHERE agent_id = '$(sql_escape "$agent_id")' AND is_current = 1;
                   UPDATE sessions SET is_current = 1 WHERE session_id = '$(sql_escape "$session_id")';"
}

# ── 3. Session JSONL files → exchanges ──────────────────────────────────

migrate_session_exchanges() {
    local session_id="$1" jsonl_file="$2"
    [[ -f "$jsonl_file" ]] || return 0

    local count=0
    local batch=""

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue

        local ts role content metadata tool_calls tool_call_id images
        ts=$(echo "$line" | jq -r '.timestamp // 0')                  || continue
        role=$(echo "$line" | jq -r '.role // "unknown"')             || continue
        content=$(echo "$line" | jq -r '.content // ""')              || continue
        metadata=$(echo "$line" | jq -c '.metadata // null')          || continue
        tool_calls=$(echo "$line" | jq -c '.tool_calls // null')      || continue
        tool_call_id=$(echo "$line" | jq -r '.tool_call_id // empty') || continue
        images=$(echo "$line" | jq -c '.images // []')                || continue

        # Null → empty for optional fields
        [[ "$metadata" == "null" ]]    && metadata=""
        [[ "$tool_calls" == "null" ]]  && tool_calls=""

        batch+="INSERT INTO exchanges (session_id, timestamp, role, content, metadata, tool_calls, tool_call_id, images)
            VALUES ('$(sql_escape "$session_id")', $ts, '$(sql_escape "$role")',
                    '$(sql_escape "$content")', '$(sql_escape "$metadata")',
                    '$(sql_escape "$tool_calls")', '$(sql_escape "$tool_call_id")',
                    '$(sql_escape "$images")');
"
        ((count++)) || true

        # Batch every 500 inserts for performance
        if (( count % 500 == 0 )); then
            sqlite3 "$DB" "BEGIN; $batch COMMIT;"
            batch=""
        fi
    done < "$jsonl_file"

    # Flush remaining
    if [[ -n "$batch" ]]; then
        sqlite3 "$DB" "BEGIN; $batch COMMIT;"
    fi

    EXCHANGES_MIGRATED=$((EXCHANGES_MIGRATED + count))
    (( count > 0 )) && log "    $session_id: $count exchanges"
}

# ── 4. Receipt JSONL files ──────────────────────────────────────────────

migrate_receipts() {
    local receipts_file="$1"
    [[ -f "$receipts_file" ]] || return 0

    local count=0
    local batch=""

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue

        local session agent started_at duration_ms user_prompt
        local tool_calls tokens_prompt tokens_completion tokens_total
        local tokens_cached tokens_reasoning model_calls reply_summary
        local model_id estimated_cost call_details

        session=$(echo "$line" | jq -r '.session // empty')                || continue
        agent=$(echo "$line" | jq -r '.agent // empty')                    || continue
        started_at=$(echo "$line" | jq -r '.started_at // 0')             || continue
        duration_ms=$(echo "$line" | jq -r '.duration_ms // 0')           || continue
        user_prompt=$(echo "$line" | jq -r '.user_prompt // ""')          || continue
        tool_calls=$(echo "$line" | jq -c '.tool_calls // []')            || continue
        tokens_prompt=$(echo "$line" | jq -r '.tokens.prompt_tokens // 0')           || continue
        tokens_completion=$(echo "$line" | jq -r '.tokens.completion_tokens // 0')   || continue
        tokens_total=$(echo "$line" | jq -r '.tokens.total_tokens // 0')             || continue
        tokens_cached=$(echo "$line" | jq -r '.tokens.cached_tokens // 0')           || continue
        tokens_reasoning=$(echo "$line" | jq -r '.tokens.reasoning_tokens // 0')     || continue
        model_calls=$(echo "$line" | jq -r '.model_calls // 0')           || continue
        reply_summary=$(echo "$line" | jq -r '.reply_summary // ""')      || continue
        model_id=$(echo "$line" | jq -r '.model_id // ""')                || continue
        estimated_cost=$(echo "$line" | jq -r '.estimated_cost_usd // "null"')       || continue
        call_details=$(echo "$line" | jq -c '.call_details // []')        || continue

        [[ -z "$agent" ]] && continue

        # Map "null" string to SQL NULL
        local cost_sql="NULL"
        [[ "$estimated_cost" != "null" ]] && cost_sql="$estimated_cost"

        batch+="INSERT INTO receipts (
                session_id, agent_id, started_at, duration_ms, user_prompt,
                tool_calls_json, prompt_tokens, completion_tokens, total_tokens,
                cached_tokens, reasoning_tokens, model_calls, reply_summary,
                model_id, estimated_cost_usd, call_details_json
            ) VALUES (
                '$(sql_escape "$session")', '$(sql_escape "$agent")',
                $started_at, $duration_ms, '$(sql_escape "$user_prompt")',
                '$(sql_escape "$tool_calls")', $tokens_prompt, $tokens_completion,
                $tokens_total, $tokens_cached, $tokens_reasoning,
                $model_calls, '$(sql_escape "$reply_summary")',
                '$(sql_escape "$model_id")', $cost_sql,
                '$(sql_escape "$call_details")');
"
        ((count++)) || true

        if (( count % 200 == 0 )); then
            sqlite3 "$DB" "BEGIN; $batch COMMIT;"
            batch=""
        fi
    done < "$receipts_file"

    if [[ -n "$batch" ]]; then
        sqlite3 "$DB" "BEGIN; $batch COMMIT;"
    fi

    RECEIPTS_MIGRATED=$((RECEIPTS_MIGRATED + count))
    (( count > 0 )) && log "  → $count receipts from $(basename "$receipts_file")"
}

# ── 5. Cron jobs (cron_jobs.json) ───────────────────────────────────────

migrate_cron_jobs() {
    local cron_file="$1"
    [[ -f "$cron_file" ]] || return 0

    log "Migrating cron jobs: $cron_file"
    local count=0

    # cron_jobs.json is a JSON array
    local len
    len=$(jq 'length' "$cron_file" 2>/dev/null) || return 0

    for (( i=0; i<len; i++ )); do
        local agent_id name schedule message kind depends_on
        local max_retries retry_delay_secs condition retry_count last_status

        agent_id=$(jq -r ".[$i].agent_id // empty" "$cron_file")
        name=$(jq -r ".[$i].name // empty" "$cron_file")
        schedule=$(jq -r ".[$i].schedule // empty" "$cron_file")
        message=$(jq -r ".[$i].message // empty" "$cron_file")
        kind=$(jq -c ".[$i].kind // \"\\\"Recurring\\\"\"" "$cron_file")
        depends_on=$(jq -c ".[$i].depends_on // null" "$cron_file")
        max_retries=$(jq -r ".[$i].max_retries // \"null\"" "$cron_file")
        retry_delay_secs=$(jq -r ".[$i].retry_delay_secs // \"null\"" "$cron_file")
        condition=$(jq -r ".[$i].condition // empty" "$cron_file")
        retry_count=$(jq -r ".[$i].retry_count // 0" "$cron_file")
        last_status=$(jq -r ".[$i].last_status // empty" "$cron_file")

        [[ -z "$agent_id" || -z "$name" ]] && continue

        # Normalise kind to JSON string (Rust serde format)
        case "$kind" in
            '"Recurring"'|'"OneShot"') ;;  # already correct
            'Recurring')  kind='"Recurring"' ;;
            'OneShot')    kind='"OneShot"' ;;
            *)            kind='"Recurring"' ;;
        esac

        local depends_sql="NULL"
        [[ "$depends_on" != "null" ]] && depends_sql="'$(sql_escape "$depends_on")'"
        local max_retries_sql="NULL"
        [[ "$max_retries" != "null" ]] && max_retries_sql="$max_retries"
        local delay_sql="NULL"
        [[ "$retry_delay_secs" != "null" ]] && delay_sql="$retry_delay_secs"

        sqlite3 "$DB" "INSERT OR REPLACE INTO cron_jobs
            (agent_id, name, schedule, message, kind, depends_on, max_retries,
             retry_delay_secs, condition, retry_count, last_status)
            VALUES (
                '$(sql_escape "$agent_id")', '$(sql_escape "$name")',
                '$(sql_escape "$schedule")', '$(sql_escape "$message")',
                '$(sql_escape "$kind")', $depends_sql, $max_retries_sql,
                $delay_sql, '$(sql_escape "$condition")',
                $retry_count, '$(sql_escape "$last_status")');"
        ((count++)) || true
    done

    CRON_JOBS_MIGRATED=$((CRON_JOBS_MIGRATED + count))
    log "  → $count cron jobs"
}

# ── 6. Cron events (cron_events/*.json) ─────────────────────────────────

migrate_cron_events() {
    local events_dir="$1"
    [[ -d "$events_dir" ]] || return 0

    log "Migrating cron events: $events_dir"
    local count=0

    for events_file in "$events_dir"/*.json; do
        [[ -f "$events_file" ]] || continue

        # Each file is a JSON array of JobRun objects
        local len
        len=$(jq 'length' "$events_file" 2>/dev/null) || continue

        local batch=""
        for (( i=0; i<len; i++ )); do
            local id job_id scheduled_at executed_at completed_at
            local status output_preview error duration_ms

            id=$(jq -r ".[$i].id // empty" "$events_file")
            job_id=$(jq -r ".[$i].job_id // empty" "$events_file")
            scheduled_at=$(jq -r ".[$i].scheduled_at // 0" "$events_file")
            executed_at=$(jq -r ".[$i].executed_at // \"null\"" "$events_file")
            completed_at=$(jq -r ".[$i].completed_at // \"null\"" "$events_file")
            status=$(jq -c ".[$i].status" "$events_file")
            output_preview=$(jq -r ".[$i].output_preview // empty" "$events_file")
            error=$(jq -r ".[$i].error // empty" "$events_file")
            duration_ms=$(jq -r ".[$i].duration_ms // \"null\"" "$events_file")

            [[ -z "$id" || -z "$job_id" ]] && continue

            # Status: Rust serde enums → JSON string for DB
            local status_str
            status_str=$(echo "$status" | jq -c '.' 2>/dev/null) || status_str="\"PENDING\""

            local exec_sql="NULL"
            [[ "$executed_at" != "null" ]] && exec_sql="$executed_at"
            local comp_sql="NULL"
            [[ "$completed_at" != "null" ]] && comp_sql="$completed_at"
            local dur_sql="NULL"
            [[ "$duration_ms" != "null" ]] && dur_sql="$duration_ms"

            batch+="INSERT OR IGNORE INTO cron_events
                (id, job_id, scheduled_at, executed_at, completed_at, status, output_preview, error, duration_ms)
                VALUES (
                    '$(sql_escape "$id")', '$(sql_escape "$job_id")',
                    $scheduled_at, $exec_sql, $comp_sql,
                    '$(sql_escape "$status_str")', '$(sql_escape "$output_preview")',
                    '$(sql_escape "$error")', $dur_sql);
"
            ((count++)) || true
        done

        if [[ -n "$batch" ]]; then
            sqlite3 "$DB" "BEGIN; $batch COMMIT;"
        fi
    done

    CRON_EVENTS_MIGRATED=$((CRON_EVENTS_MIGRATED + count))
    log "  → $count cron event records"
}

# ── 7. Heartbeat status ────────────────────────────────────────────────

migrate_heartbeat() {
    local hb_file="$1"
    [[ -f "$hb_file" ]] || return 0

    log "Migrating heartbeat status: $hb_file"

    local agent_id enabled health last_tick next_tick interval_secs
    local message_preview latest_session

    agent_id=$(jq -r '.agent_id // empty' "$hb_file")        || return 0
    enabled=$(jq -r '.enabled // true' "$hb_file")            || return 0
    health=$(jq -c '.health // "\"OK\""' "$hb_file")          || return 0
    last_tick=$(jq -r '.last_tick // "null"' "$hb_file")       || return 0
    next_tick=$(jq -r '.next_tick // "null"' "$hb_file")       || return 0
    interval_secs=$(jq -r '.interval_secs // "null"' "$hb_file") || return 0
    message_preview=$(jq -r '.message_preview // empty' "$hb_file") || return 0
    latest_session=$(jq -r '.latest_session // empty' "$hb_file")   || return 0

    [[ -z "$agent_id" ]] && return 0

    local enabled_int=1
    [[ "$enabled" == "false" ]] && enabled_int=0

    local health_str
    health_str=$(echo "$health" | jq -c '.' 2>/dev/null) || health_str="\"OK\""

    local lt_sql="NULL" nt_sql="NULL" is_sql="NULL"
    [[ "$last_tick" != "null" ]]      && lt_sql="$last_tick"
    [[ "$next_tick" != "null" ]]      && nt_sql="$next_tick"
    [[ "$interval_secs" != "null" ]]  && is_sql="$interval_secs"

    sqlite3 "$DB" "INSERT OR REPLACE INTO heartbeat_status
        (agent_id, enabled, health, last_tick, next_tick, interval_secs, message_preview, latest_session)
        VALUES (
            '$(sql_escape "$agent_id")', $enabled_int,
            '$(sql_escape "$health_str")', $lt_sql, $nt_sql, $is_sql,
            '$(sql_escape "$message_preview")', '$(sql_escape "$latest_session")');"

    ((HEARTBEATS_MIGRATED++)) || true
    log "  → heartbeat for $agent_id"
}

# ══════════════════════════════════════════════════════════════════════════
# Main migration
# ══════════════════════════════════════════════════════════════════════════

log "Starting migration…"
log ""

# ── Global session index ────────────────────────────────────────────────

GLOBAL_INDEX="$PINCHY_HOME/sessions/index.jsonl"
migrate_session_index "$GLOBAL_INDEX"

# ── Per-agent data ──────────────────────────────────────────────────────

if [[ -d "$AGENTS_DIR" ]]; then
    for agent_dir in "$AGENTS_DIR"/*/; do
        [[ -d "$agent_dir" ]] || continue
        agent_id=$(basename "$agent_dir")
        log ""
        log "── Agent: $agent_id ──"

        ws="$agent_dir/workspace"

        # CURRENT_SESSION
        migrate_current_session "$agent_id" "$ws"

        # Session JSONL files
        sessions_dir="$ws/sessions"
        if [[ -d "$sessions_dir" ]]; then
            for jsonl in "$sessions_dir"/*.jsonl; do
                [[ -f "$jsonl" ]] || continue
                fname=$(basename "$jsonl" .jsonl)
                # Skip index.jsonl (already handled globally)
                [[ "$fname" == "index" ]] && continue
                # Skip receipts files — handled separately
                [[ "$fname" == *.receipts ]] && continue

                # Ensure session exists in sessions table (may not be in index.jsonl)
                sqlite3 "$DB" "INSERT OR IGNORE INTO sessions (session_id, agent_id, created_at, title)
                    VALUES ('$(sql_escape "$fname")', '$(sql_escape "$agent_id")', 0, NULL);"

                migrate_session_exchanges "$fname" "$jsonl"
            done

            # Receipt files (*.receipts.jsonl)
            for receipts_file in "$sessions_dir"/*.receipts.jsonl; do
                [[ -f "$receipts_file" ]] || continue
                migrate_receipts "$receipts_file"
            done
        fi

        # Cron jobs
        for cron_file in "$agent_dir/cron_jobs.json" "$ws/cron_jobs.json"; do
            [[ -f "$cron_file" ]] && migrate_cron_jobs "$cron_file"
        done

        # Cron events
        for events_dir in "$agent_dir/cron_events" "$ws/cron_events"; do
            [[ -d "$events_dir" ]] && migrate_cron_events "$events_dir"
        done

        # Heartbeat status
        for hb_file in "$agent_dir/heartbeat_status.json" "$ws/heartbeat_status.json"; do
            [[ -f "$hb_file" ]] && migrate_heartbeat "$hb_file"
        done
    done
fi

# Also check for a top-level cron_jobs.json / heartbeat_status.json
[[ -f "$PINCHY_HOME/cron_jobs.json" ]] && migrate_cron_jobs "$PINCHY_HOME/cron_jobs.json"
[[ -f "$PINCHY_HOME/heartbeat_status.json" ]] && migrate_heartbeat "$PINCHY_HOME/heartbeat_status.json"

# ══════════════════════════════════════════════════════════════════════════
# Clean up: move old files to _legacy_backup/
# ══════════════════════════════════════════════════════════════════════════

log ""
log "Migration complete. Moving old files to $BACKUP/"
mkdir -p "$BACKUP"

move_if_exists() {
    local src="$1" dest_parent="$2"
    if [[ -e "$src" ]]; then
        mkdir -p "$dest_parent"
        mv "$src" "$dest_parent/"
        ((FILES_CLEANED++)) || true
    fi
}

# Global session index directory
move_if_exists "$PINCHY_HOME/sessions/index.jsonl" "$BACKUP/sessions"

# Top-level legacy files
move_if_exists "$PINCHY_HOME/cron_jobs.json"        "$BACKUP"
move_if_exists "$PINCHY_HOME/heartbeat_status.json"  "$BACKUP"

# Per-agent cleanup
if [[ -d "$AGENTS_DIR" ]]; then
    for agent_dir in "$AGENTS_DIR"/*/; do
        [[ -d "$agent_dir" ]] || continue
        agent_id=$(basename "$agent_dir")
        agent_backup="$BACKUP/agents/$agent_id"
        ws="$agent_dir/workspace"

        # CURRENT_SESSION
        move_if_exists "$ws/CURRENT_SESSION" "$agent_backup/workspace"

        # Session JSONL + receipt files
        if [[ -d "$ws/sessions" ]]; then
            for f in "$ws/sessions"/*.jsonl; do
                [[ -f "$f" ]] || continue
                move_if_exists "$f" "$agent_backup/workspace/sessions"
            done
            # Remove empty sessions dir
            rmdir "$ws/sessions" 2>/dev/null || true
        fi

        # Cron files
        move_if_exists "$agent_dir/cron_jobs.json"    "$agent_backup"
        move_if_exists "$ws/cron_jobs.json"           "$agent_backup/workspace"

        # Cron events directories
        if [[ -d "$agent_dir/cron_events" ]]; then
            move_if_exists "$agent_dir/cron_events" "$agent_backup"
        fi
        if [[ -d "$ws/cron_events" ]]; then
            move_if_exists "$ws/cron_events" "$agent_backup/workspace"
        fi

        # Heartbeat status
        move_if_exists "$agent_dir/heartbeat_status.json" "$agent_backup"
        move_if_exists "$ws/heartbeat_status.json"        "$agent_backup/workspace"
    done
fi

# ── Summary ─────────────────────────────────────────────────────────────

log ""
log "═══════════════════════════════════════"
log "  Migration summary"
log "═══════════════════════════════════════"
log "  Sessions:     $SESSIONS_MIGRATED"
log "  Exchanges:    $EXCHANGES_MIGRATED"
log "  Receipts:     $RECEIPTS_MIGRATED"
log "  Cron jobs:    $CRON_JOBS_MIGRATED"
log "  Cron events:  $CRON_EVENTS_MIGRATED"
log "  Heartbeats:   $HEARTBEATS_MIGRATED"
log "  Files moved:  $FILES_CLEANED"
log "═══════════════════════════════════════"
log ""
log "Old files backed up to: $BACKUP/"
log "Once verified, remove with: rm -rf $BACKUP"
log ""
log "Done ✓"
