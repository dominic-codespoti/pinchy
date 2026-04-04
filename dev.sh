#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB="$ROOT/web"

# Clean static build to force regeneration and enable dev mode proxy
echo "🧹 Cleaning static/react for dev mode..."
rm -rf "$ROOT/static/react"

# Create minimal placeholder for Rust embed in dev mode
echo "📝 Creating placeholder for Rust embed..."
mkdir -p "$ROOT/static/react"
echo '<!DOCTYPE html><html><head><title>Pinchy Dev</title></head><body>Dev Mode - see localhost:3000</body></html>' >"$ROOT/static/react/index.html"

echo "🧹 Cleaning up stale processes…"
# Kill any existing pinchy processes
pkill -f "target/debug/pinchy" 2>/dev/null || true
pkill -f "target/release/pinchy" 2>/dev/null || true

# Clean up Next.js cache files that can cause type errors
rm -f "$WEB/.next/dev/types/validator.ts" 2>/dev/null || true

# Wait for ports to be free
for port in 3131 3132; do
	while lsof -i :$port 2>/dev/null | grep -q LISTEN; do
		echo "  Waiting for port $port to be free…"
		sleep 0.5
	done
done

echo "🔨 Ensuring fresh Rust build…"
# Touch main source files to force recompile
touch "$ROOT/src/main.rs"
touch "$ROOT/src/models_dev/mod.rs"
touch "$ROOT/src/gateway/mod.rs"

# Do an initial build to ensure binary exists and is fresh
if ! PINCHY_DEV_MODE=1 cargo build; then
	echo "❌ Build failed"
	exit 1
fi
echo "✅ Build complete"

cleanup() {
	trap - EXIT INT TERM
	echo ""
	echo "🦀 Shutting down…"
	# Kill the entire process group
	kill -- -$$ 2>/dev/null || true
	wait 2>/dev/null || true
	exit 0
}
trap cleanup EXIT INT TERM

# ── 1. Start Next.js dev server (HMR on :3000) ──
echo "🔥 Starting Next.js dev server (http://localhost:3000)…"
(cd "$WEB" && npx next dev --port 3000) &

# ── 2. Start Rust backend with cargo-watch (auto-rebuild on changes) ──
if command -v cargo-watch &>/dev/null; then
	echo "👀 Starting cargo watch (auto-rebuild on Rust changes)…"
	echo "   Tip: Install cargo-watch with 'cargo install cargo-watch'"
	(cd "$ROOT" && PINCHY_DEV_MODE=1 cargo watch -x run -w src -w Cargo.toml --delay 0.5) &
else
	echo "🦀 Starting cargo run (install cargo-watch for auto-rebuild: cargo install cargo-watch)…"
	(cd "$ROOT" && PINCHY_DEV_MODE=1 cargo run) &
fi

echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  Pinchy Dev Mode                            │"
echo "│                                             │"
echo "│  Frontend (HMR):  http://localhost:3000     │"
echo "│  Backend  (API):  http://localhost:3131    │"
echo "│                                             │"
echo "│  Press Ctrl+C to stop both                  │"
echo "└─────────────────────────────────────────────┘"
echo ""

wait
