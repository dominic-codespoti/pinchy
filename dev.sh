#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB="$ROOT/web"

cleanup() {
  trap - EXIT INT TERM
  echo ""
  echo "🦀 Shutting down…"
  kill 0 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# ── 1. Build the React frontend once (fast if unchanged) ──
echo "⚡ Building React frontend…"
(cd "$WEB" && pnpm run build)

# ── 2. Start Vite dev server (HMR on :5173) ──
echo "🔥 Starting Vite dev server (http://localhost:5173/react/)…"
(cd "$WEB" && pnpm exec vite --clearScreen false) &
VITE_PID=$!

# ── 3. Start Rust backend with cargo-watch (auto-rebuild on changes) ──
if command -v cargo-watch &>/dev/null; then
  echo "👀 Starting cargo watch (auto-rebuild on Rust changes)…"
  (cd "$ROOT" && cargo watch -x run -w src -w Cargo.toml --why) &
else
  echo "🦀 Starting cargo run (install cargo-watch for auto-rebuild: cargo install cargo-watch)…"
  (cd "$ROOT" && cargo run) &
fi
RUST_PID=$!

echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  Pinchy Dev Mode                            │"
echo "│                                             │"
echo "│  Frontend (HMR):  http://localhost:5173/react/  │"
echo "│  Backend  (API):  http://localhost:3131      │"
echo "│                                             │"
echo "│  Press Ctrl+C to stop both                  │"
echo "└─────────────────────────────────────────────┘"
echo ""

wait
