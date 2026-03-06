.PHONY: dev build web run update install release lint setup backup backup-list restore

# Start everything: Vite HMR + Rust backend (auto-rebuild if cargo-watch installed)
dev:
	@bash dev.sh

# Build React frontend into static/react/
web:
	@cd web && pnpm run build

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
