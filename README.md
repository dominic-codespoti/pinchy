# pinchy

Lightweight Rust agent platform that runs on anything from a Raspberry Pi to a cloud VM.
Connects to Discord, exposes a WebSocket + REST gateway, calls LLMs through
pluggable providers, runs 31 built-in tools, and supports heartbeat, cron,
skills, persistent memory, and MCP (Model Context Protocol) server integration.

## Quick Start

```bash
# 1. Build
cargo build --release

# 2. Interactive onboarding (creates config, sets up first agent)
cargo run --release -- onboard

# 3. Start the daemon
cargo run --release
```

Or scaffold a new agent manually:

```bash
cargo run --release -- agent new my_agent
```

## Configuration

Config lives at `~/.pinchy/config.yaml` (override with `--config`).

```yaml
models:
  - id: default
    provider: openai          # openai | azure-openai | copilot | openai-compat
    model: gpt-4o
    api_key: $OPENAI_API_KEY

channels:
  discord:
    token: "@DISCORD_TOKEN"   # @ = read from env / secrets store

agents:
  - id: assistant
    model: default
    heartbeat_secs: 300
```

### Model Providers

| Provider | Config `provider` value | Notes |
|---|---|---|
| OpenAI | `openai` | Default endpoint `api.openai.com` |
| Azure OpenAI | `azure-openai` | Requires `endpoint`, `api_version`, optional `embedding_deployment` |
| GitHub Copilot | `copilot` | Device-flow auth via `pinchy copilot login` |
| OpenAI-compatible | `openai-compat` | Works with OpenRouter, Ollama, Groq, Together, Fireworks, Mistral, LM Studio, vLLM, DeepSeek, xAI |

Fallback chains are supported: configure `fallback_models` on an agent and the
`ProviderManager` will retry through them automatically. A built-in
`FallbackProvider` auto-selects the best available backend (Copilot → OpenAI → stub echo).

## Environment Variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `DISCORD_TOKEN` | Discord bot token |
| `PINCHY_HOME` | Root directory (default: CWD) |
| `PINCHY_GATEWAY_ADDR` | Gateway listen address (default `0.0.0.0:3131`) |
| `PINCHY_GATEWAY` | Set `"0"` to disable the gateway |
| `PINCHY_API_TOKEN` | Bearer token for API auth |
| `PINCHY_SECRET_KEY` | Passphrase for AES-256-GCM encrypted secrets |
| `PINCHY_SCHEDULER` | Set `"1"` to force-enable scheduler |
| `PINCHY_HEARTBEAT_SECS` | Override heartbeat interval |
| `PINCHY_CHROMIUM_PATH` | Override system browser path for Playwright |
| `PINCHY_DUMP_PAYLOAD` | Debug: dump raw LLM request payloads |
| `RUST_LOG` | Log level filter (`info`, `debug`, `pinchy=trace`) |

## CLI

```
pinchy start                        Start daemon (gateway + scheduler + Discord)
pinchy onboard                      Interactive setup wizard
pinchy status                       Check if daemon is running
pinchy update                       Pull + rebuild (--restart to restart service)

pinchy agent new <id>               Scaffold a new agent
pinchy agent list                   List agents
pinchy agent show <id>              Display agent config
pinchy agent set-model <id>         Change agent model
pinchy agent edit <id> <section>    Edit SOUL/TOOLS/HEARTBEAT
pinchy agent apply <id> <manifest>  Apply YAML manifest
pinchy agent configure <id>         Interactive agent config

pinchy debug run                    Run a single agent turn

pinchy copilot login                GitHub device-flow auth
pinchy copilot logout               Remove stored Copilot token

pinchy secrets set <key>            Store an encrypted secret

pinchy service install|uninstall    Manage systemd service
pinchy service start|stop|restart   Control service
pinchy service status|logs          View service state
```

## Tools

### Core (always available)

`read_file` · `write_file` · `edit_file` · `list_files` · `exec_shell` ·
`save_memory` · `recall_memory` · `forget_memory` · `activate_skill`

### Deferred (auto-injected when keywords detected)

Tools are automatically plucked into the function-calling context when the
conversation mentions relevant keywords:

| Keywords | Tools |
|---|---|
| skill, plugin, capability | `create_skill`, `edit_skill`, `delete_skill`, `list_skills` |
| cron, schedule, timer, periodic | `list_cron_jobs`, `create_cron_job`, `update_cron_job`, `delete_cron_job`, `run_cron_job`, `cron_job_history` |
| agent, bot | `list_agents`, `get_agent`, `create_agent` |
| session, conversation, chat history | `session_list`, `session_status`, `session_send`, `session_spawn` |
| update, upgrade, version | `self_update` |
| browser, web, url, scrape | `browser` |
| message, discord, notify | `send_message` |
| mcp, model context protocol | `mcp` |

## MCP Client

Pinchy includes a built-in MCP (Model Context Protocol) client powered by the
[rmcp](https://crates.io/crates/rmcp) SDK with Streamable HTTP transport.

Configure servers in `config/mcp.json` (or `mcporter.json` / `.mcp.json`)
inside the agent workspace:

```json
{
  "servers": {
    "my-server": {
      "url": "https://example.com/mcp",
      "headers": { "X-ApiKey": "secret" }
    }
  }
}
```

Actions: `list_servers`, `list_tools`, `call_tool`, `add_server`, `remove_server`.

## Skills

Declarative tool bundles described by `SKILL.md` manifests (YAML front-matter +
markdown instructions). Follows the [Agent Skills](https://agentskills.io/specification)
open format. Skills live at `agents/<id>/skills/*/SKILL.md` and are
progressively disclosed — only name + description are injected at boot; full
instructions are loaded on demand via `activate_skill`.

## Memory

SQLite-backed persistent memory with FTS5 full-text search (BM25 ranking).
Stored at `agents/<id>/workspace/memory.db`. Tools: `save_memory`,
`recall_memory`, `forget_memory`.

## Gateway API

When the daemon is running, a REST + WebSocket gateway is served (default `:3131`).

Key endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Daemon status |
| `GET` | `/api/health` | Health check |
| `GET/PUT` | `/api/config` | Read/update config |
| `GET/POST` | `/api/agents` | List/create agents |
| `GET/PUT/DELETE` | `/api/agents/:id` | Agent CRUD |
| `GET/POST` | `/api/cron/jobs` | Cron job management |
| `GET` | `/api/skills` | List skills |
| `POST` | `/api/webhook/:agent_id` | Webhook ingest |
| `GET` | `/ws` | WebSocket event stream |
| `GET` | `/ws/logs` | Live log streaming |

React admin UI served at `/` (built from `web/`).

## Project Structure

```
src/
├── main.rs           Entry point
├── lib.rs            Crate root
├── config/           Config loading & validation
├── agent/            Agent runtime, prompt building, tool loops
├── models/           LLM provider trait + OpenAI, Azure, Copilot, compat
├── tools/            31 built-in tools + auto-pluck system
│   └── builtins/     Tool implementations (mcp, browser, skill_author, …)
├── skills/           Skill registry, progressive disclosure
├── memory/           SQLite + FTS5 persistent memory
├── session/          Session store (JSONL), session index
├── context/          Context window management (tiktoken, pruning, compaction)
├── scheduler/        Heartbeat + cron (tokio_cron_scheduler)
├── discord/          Discord channel connector
├── comm/             Channel-agnostic message bus
├── gateway/          Axum REST API + WebSocket + static file serving
│   └── handlers/     Route handlers (agents, config, cron, health, …)
├── slash/            Slash command registry (/new, /status, /cron, …)
├── auth/             GitHub device flow, Copilot token exchange
├── secrets/          AES-256-GCM encrypted file-backed secret store
├── utils/            Browser detection, helpers
└── logs.rs           Tracing setup
```

## Development

```bash
make dev              # Vite HMR + Rust auto-rebuild
make build            # Build web + cargo
make release          # Production build
cargo fmt             # Format
cargo clippy          # Lint
cargo test            # Run tests (22 integration test files)
```

## CI

GitHub Actions on every push/PR to `main`:

1. **Check** — `cargo fmt --check` + `cargo clippy`
2. **Test** — `cargo test --lib`
3. **Build** — Cross-platform release builds (x86_64 + aarch64 Linux, x86_64 + aarch64 macOS)
4. **Release** — Auto-tag, GitHub Release with binaries, crates.io publish

## Systemd Service

```bash
pinchy service install    # Install + enable systemd unit
pinchy service start      # Start the service
pinchy service logs -f    # Follow logs
```
