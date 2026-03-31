.PHONY: dev dev-clean build web run update install release lint setup backup backup-list restore publish watch

# Start everything: Next.js HMR + Rust backend (auto-rebuild if cargo-watch installed)
dev:
	@bash dev.sh

# Force clean rebuild and start
dev-clean:
	@echo "🧹 Cleaning build artifacts…"
	@cargo clean
	@rm -f web/.next/dev/types/validator.ts 2>/dev/null || true
	@bash dev.sh

# Install cargo-watch for backend hot reloading
watch:
	@cargo install cargo-watch
	@echo "✅ cargo-watch installed. Run 'make dev' for hot reloading."

# Build React frontend into static/react/
web:
	@cd web && [ -d node_modules ] || npm install --legacy-peer-deps
	@cd web && npm run build

# Build Rust backend (rebuilds frontend first)
build: web
	cargo build

# Production-style: build frontend then cargo run
run: web
	cargo run

# Pull + rebuild release binary
update:
	git pull --ff-only
	@$(MAKE) web
	cargo build --release
	@echo "✅ target/release/pinchy"

# Full deploy: update + install + restart service
install: update
	sudo cp target/release/pinchy /opt/pinchy/pinchy
	sudo mkdir -p /opt/pinchy/static
	sudo cp -r static/react /opt/pinchy/static/
	sudo systemctl restart pinchy
	@echo "✅ Installed and restarted"

# Release build only (no git pull)
release: web
	cargo build --release

# Run the same lint + format checks as CI
lint:
	cargo fmt -- --check
	cargo clippy --no-default-features -- -D warnings

# Install git pre-commit hook so lint errors are caught before push
setup:
	@ln -sf ../../scripts/pre-commit .git/hooks/pre-commit
	@echo "✅ Pre-commit hook installed"

# Snapshot PINCHY_HOME into a .tar.gz
backup:
	cargo run -- backup

# List existing backups
backup-list:
	cargo run -- backup --list

# Restore a backup (usage: make restore F=path/to/backup.tar.gz)
restore:
	@test -n "$(F)" || (echo "Usage: make restore F=<backup.tar.gz>" && exit 1)
	cargo run -- restore "$(F)"

# Publish to crates.io (builds web first, uses --allow-dirty for gitignored build artifacts)
publish: web
	cargo publish --allow-dirty
	@echo "✅ Published to crates.io"
