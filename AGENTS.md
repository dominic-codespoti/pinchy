# AGENTS.md

Guidelines for AI agents working on the Pinchy codebase.

## Rules

- Ship the smallest thing that works. Cut scope, don't add features "just in case".
- **Always run `cargo fmt` and `cargo clippy` before committing.** Fix all warnings. No exceptions.
- Never `unwrap()` in production paths — use `?` or explicit error handling.
- Keep TypeScript (web/) and Rust (src/) type boundaries in sync.

## Architecture Overview

Pinchy is a single-binary Rust daemon. On start it launches:
1. **Gateway** — Axum HTTP/WS server (default `:3131`)
2. **Scheduler** — Heartbeat ticks + cron jobs via `tokio_cron_scheduler`
3. **Discord connector** — if configured

### Module Map

| Module | Purpose |
|---|---|
| `config/` | Serde config loading, `Config`/`AgentConfig`/`ModelConfig` structs |
| `agent/` | Agent runtime: prompt building, tool loop, session management |
| `models/` | `ModelProvider` trait + `OpenAI`, `AzureOpenAI`, `Copilot`, `OpenAICompat` providers; `ProviderManager` with retry/fallback |
| `tools/` | 30 built-in tools, `ToolRegistry`, `AUTO_PLUCK_RULES` keyword-based deferred injection |
| `tools/builtins/` | Tool implementations: `exec_shell`, `edit_file`, `skill_author`, `delegate`, etc. |
| `skills/` | `SkillRegistry` — discovers `SKILL.md` manifests, progressive disclosure via `activate_skill` |
| `memory/` | SQLite + FTS5 persistent memory (`save_memory`, `recall_memory`, `forget_memory`) |
| `session/` | JSONL-backed session store, session index |
| `context/` | Context window management — tiktoken (`o200k_base`), pruning, LLM-powered compaction |
| `scheduler/` | Heartbeat + cron (persisted `cron_jobs.json`, retries, dependencies, per-agent timezone) |
| `discord/` | Discord `ChannelConnector` |
| `comm/` | Channel-agnostic `IncomingMessage` / `RichMessage` bus, connector registry |
| `gateway/` | Axum REST routes + WebSocket + static serving; handler sub-modules |
| `slash/` | Slash command registry (`/new`, `/status`, `/cron`, `/compact`, etc.) |
| `auth/` | GitHub device-flow login, Copilot token exchange (direct HTTP — no SDK) |
| `secrets/` | AES-256-GCM encrypted file-backed secret store (via `ring`) |
| `watcher/` | File-system watcher for config hot-reload (`notify-debouncer-mini`) |

### Agent Workspace

Each agent gets a workspace at `agents/<id>/workspace/` containing:
- `SOUL.md` — personality / system prompt
- `TOOLS.md` — tool usage instructions
- `HEARTBEAT.md` — heartbeat prompt
- `sessions/*.jsonl` — conversation history
- `memory.db` — SQLite persistent memory
- `skills/*/SKILL.md` — skill manifests

File tools are sandboxed to the agent workspace unless explicitly configured otherwise.

### Tool System

Tools are registered in `src/tools/mod.rs`. Two categories:

- **Core tools** (always in prompt): `read_file`, `write_file`, `edit_file`, `list_files`, `exec_shell`, `save_memory`, `recall_memory`, `forget_memory`, `activate_skill`
- **Deferred tools** (auto-plucked by keywords in recent conversation): managed by `AUTO_PLUCK_RULES` — scans last 5 user messages + current message for domain keywords, then injects matching tools into the function-calling payload

### Browser Automation

Browser automation is handled via a **skill** (`skills/default_skills/browser.md`) that uses `playwright-cli` through `exec_shell`. This is more token-efficient than dedicated browser tools — it avoids loading large tool schemas and accessibility trees into context.

### Context Management

`src/context/mod.rs` — budget-based context window management using `tiktoken-rs` (`o200k_base`).
Default budget: 120k tokens max, prune at 80k, compact at 100k.
Pruning strips old tool results; compaction summarises oldest messages via an LLM call.

### Copilot Provider

The Copilot provider (`src/models/copilot.rs`) talks to GitHub Copilot via **direct HTTP** to the Copilot API proxy. Auth uses GitHub device-flow (`src/auth/github_device.rs`) + token exchange (`src/auth/copilot_token.rs`). Supports both OpenAI-compatible and Anthropic Messages API formats (Claude models route through `/v1/messages` SSE).

## CI Pipeline

`.github/workflows/ci.yml` runs on push/PR to `main`:

1. `cargo fmt -- --check` + `cargo clippy --no-default-features`
2. `cargo test --no-default-features --lib`
3. Cross-platform release builds (x86_64 + aarch64 Linux, x86_64 + aarch64 macOS)
4. Auto-tag (patch bump on main), GitHub Release, crates.io publish

## Development Workflow

```bash
make dev        # Vite HMR + Rust auto-rebuild
cargo fmt       # Must pass before push
cargo clippy    # Must be clean before push
cargo test      # 21 integration test files in tests/
```

## Key Patterns

- **Provider fallback**: `ProviderManager` wraps a primary provider with `fallback_models` chain and a safety-net `FallbackProvider`
- **Progressive disclosure**: Skills inject only name+description at boot; `activate_skill` loads full instructions on demand
- **Auto-pluck**: Deferred tools are keyword-triggered — see `AUTO_PLUCK_RULES` in `src/tools/mod.rs`. The pluck scan covers recent history (last 5 user messages) so follow-up messages still get relevant tools
- **Receipt tracking**: Every tool call in a turn is recorded as a `ToolCallRecord` for observability
- **Session isolation**: Cron jobs run in isolated sessions; session expiry is configurable