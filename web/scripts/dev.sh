#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"

stop_existing_next() {
	local pid cwd

	while IFS= read -r pid; do
		[[ -n "$pid" ]] || continue
		cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"

		if [[ "$cwd" == "$WEB_DIR" ]]; then
			echo "🧹 Stopping existing Next dev server (pid $pid)..."
			kill "$pid" 2>/dev/null || true
			wait_for_exit "$pid"
		fi
	done < <(pgrep -f "next-server" || true)
}

wait_for_exit() {
	local pid="$1"
	local attempts=0

	while kill -0 "$pid" 2>/dev/null; do
		if ((attempts >= 50)); then
			echo "⚠️ Force killing stuck Next dev server (pid $pid)..."
			kill -9 "$pid" 2>/dev/null || true
			break
		fi

		sleep 0.1
		((attempts += 1))
	done
}

stop_existing_next

echo "🧹 Resetting Next dev cache..."
rm -rf "$WEB_DIR/.next/dev"

cd "$WEB_DIR"
exec node --no-addons ./node_modules/.bin/next dev --port 3000 --hostname 127.0.0.1
