.PHONY: dev build web run update install release

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
	@echo "✅ target/release/mini_claw"

# Full deploy: update + install + restart service
install: update
	sudo cp target/release/mini_claw /opt/pinchy/mini_claw
	sudo systemctl restart pinchy
	@echo "✅ Installed and restarted"

# Release build only (no git pull)
release: web
	cargo build --release
