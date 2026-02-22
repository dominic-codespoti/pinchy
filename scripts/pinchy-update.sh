#!/usr/bin/env bash
# pinchy-update.sh — standalone self-update script
#
# Spawned detached by the running Pinchy process. Pulls latest code,
# rebuilds, swaps the binary, and the systemd service auto-restarts.
set -euo pipefail

REPO="${1:?Usage: pinchy-update.sh <repo_dir>}"
SERVICE="${PINCHY_SERVICE:-pinchy}"
BIN_DIR="${PINCHY_BIN_DIR:-/opt/pinchy}"
LOG="$REPO/update.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== Pinchy self-update started ==="
cd "$REPO"

# 1. Pull
log "Pulling latest…"
if ! git pull --ff-only >> "$LOG" 2>&1; then
    log "ERROR: git pull failed. Aborting."
    exit 1
fi
COMMIT=$(git rev-parse --short HEAD)
log "At commit $COMMIT"

# 2. Web frontend
if [[ -f web/package.json ]]; then
    log "Building web frontend…"
    (cd web && pnpm run build >> "$LOG" 2>&1) || log "WARNING: web build failed"
fi

# 3. Rust release build
log "Building release binary…"
if ! cargo build --release >> "$LOG" 2>&1; then
    log "ERROR: cargo build failed. Old binary untouched."
    exit 1
fi

# 4. Swap binary (if deployed to /opt/pinchy)
NEW_BIN="$REPO/target/release/mini_claw"
OLD_BIN="$BIN_DIR/mini_claw"
if [[ -d "$BIN_DIR" ]] && [[ "$BIN_DIR" != "$REPO" ]]; then
    log "Installing binary to $BIN_DIR…"
    cp "$NEW_BIN" "$OLD_BIN.new"
    mv "$OLD_BIN.new" "$OLD_BIN"
fi

# 5. Restart service (systemd Restart=always handles this too)
if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
    log "Restarting $SERVICE…"
    systemctl restart "$SERVICE" 2>> "$LOG" || true
fi

log "=== Update complete ($COMMIT) ==="
