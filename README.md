# mini_claw

Lightweight Rust agent platform designed to run on a Raspberry Pi. Connects to Discord, calls LLMs, runs tools, and supports heartbeat + cron proactive triggers.

[![CI](https://github.com/<owner>/pinchy/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/pinchy/actions/workflows/ci.yml)

## Quick Start

### 1. Set environment variables

```bash
export OPENAI_API_KEY="sk-..."      # Required – OpenAI API key
export DISCORD_TOKEN="..."          # Required – Discord bot token
export RUST_LOG="info"              # Optional – log level (debug, trace, mini_claw=trace)
```

### 2. Build

```bash
cargo build --release
```

### 3. Run

```bash
# Start the daemon (loads ~/.pinchy/config.yaml by default)
cargo run --release

# Use a custom config path
cargo run --release -- --config path/to/config.yaml
```

### 4. Scaffold a new agent

```bash
cargo run --release -- agent new my_agent
```

### 5. Debug CLI

Run with verbose logging to troubleshoot:

```bash
RUST_LOG=debug cargo run -- --config ~/.pinchy/config.yaml
```

## Configuration

A minimal config looks like:

```yaml
models:
  - id: openai-default
    provider: openai
    model: gpt-4o
    api_key: $OPENAI_API_KEY

channels:
  discord:
    token: $DISCORD_TOKEN

agents:
  - id: assistant
    workspace: ./agents/assistant
    model: openai-default
    heartbeat_secs: 300
```

## Environment Variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for model calls |
| `DISCORD_TOKEN` | Discord bot token |
| `RUST_LOG` | Logging filter (e.g. `info`, `debug`, `mini_claw=trace`) |

## Project Structure

```
src/
├── main.rs          # Entry point, wires everything
├── config/          # Config loading & validation
├── discord/         # Discord channel connector
├── agent/           # Agent runtime, prompt building, sessions
├── models/          # LLM provider trait + implementations
├── tools/           # Built-in tools (read, write, exec)
└── scheduler/       # Heartbeat + cron scheduling
```

## Development

```bash
cargo fmt          # Format code
cargo clippy       # Lint
cargo test         # Run tests
cargo build --release --target=aarch64-unknown-linux-gnu  # Cross-compile for Pi
```

## CI

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

1. `cargo fmt -- --check`
2. `cargo test`
3. `cargo build --release`


Agents now use a canonical per-agent workspace at agents/<id>/workspace. Each workspace contains agent-specific files (`SOUL.md`, `TOOLS.md`, `HEARTBEAT.md`, `sessions/`) and a `BOOTSTRAP.md` template to document onboarding. See CONSOLIDATION.md and agents/default/BOOTSTRAP.md for the consolidation plan and bootstrap template.

## React Admin UI (In Progress)

A new React frontend is being migrated under `web/`.

```bash
cd web
npm install
npm run dev
npm run build
```

Production build artifacts are emitted to `static/react/` and can be opened at `/react/index.html` while the legacy UI remains at `/`.
