# Pinchy

Lightweight Rust agent daemon. HTTP/WebSocket gateway + scheduler + Discord connector.

## Quick Ref

| Command | Purpose |
|---------|---------|
| `make dev` | Start Next.js HMR + Rust backend |
| `cargo fmt` | Format code (must pass before push) |
| `cargo clippy --no-default-features` | Lint (must pass before push) |
| `cargo test --no-default-features --lib` | Run tests |

## Rules

- Ship the smallest thing that works. Cut scope.
- **Always run `cargo fmt` and `cargo clippy` before committing.** Fix all warnings.
- Never `unwrap()` in production paths — use `?` or explicit error handling.
- Keep TypeScript (web/) and Rust (src/) type boundaries in sync.

## Web UI Rules

These rules apply to all work under `web/` and are mandatory.

### Core Principle

- Prefer full page or section rewrites over incremental styling patches when a UI is bloated.
- Preserve behavioral parity with the backend and user workflows, not visual parity with the old UI.
- Build the UI as an orchestration of shadcn components, not raw HTML styled to look like components.

### Allowed UI Building Blocks

- Use shadcn primitives and local wrappers in `web/components/ui/` for all UI elements.
- Allowed examples: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Button`, `Badge`, `Input`, `Textarea`, `Checkbox`, `Select`, `Table`, `Dialog`, `Skeleton`, `Separator`, and small approved wrappers such as `GlassCard` and `FormLabel`.
- If a needed pattern repeats, create or extend a reusable shadcn-based component in `web/components/ui/` instead of rebuilding it inline in a route.

### Forbidden Patterns

- Do not build custom cards, buttons, badges, pills, inputs, panels, banners, modals, or tables with raw `<div>`, `<button>`, `<input>`, `<textarea>`, `<span>`, or custom CSS.
- Do not use Tailwind to recreate component appearance that should come from a shadcn component.
- Do not leave dense utility-class blobs in route files for visual styling.
- Do not use `!important`-style Tailwind overrides such as `!h-7`, `!px-2`, `!w-6` on shadcn components.
- Do not preserve old markup just because it already works if a cleaner shadcn composition is possible.

### Raw HTML Policy

- Raw HTML is allowed only for minimal structural layout: page containers, `flex`, `grid`, spacing, and composition wrappers.
- Raw HTML must not be used as a visual or interactive component.
- If a wrapper has borders, background, radius, shadow, hover state, pressed state, or looks like a component, it should almost always be replaced by a shadcn component.

### Styling Policy

- Keep route-level Tailwind usage minimal and mostly structural.
- Prefer shadcn `variant`, `size`, and composition over custom class strings.
- When styling is needed repeatedly, move it into an approved reusable ui component instead of duplicating classes across pages.
- Favor simpler, modern layouts with fewer visual treatments.

### Page Refactor Policy

- For major UI work, first understand the page purpose, API calls, mutations, real-time behavior, and user tasks.
- Then redesign the page around a smaller set of sections and shadcn components.
- Optimize for clarity, simpler hierarchy, and easier maintenance.
- A successful refactor removes complexity from route files rather than just changing a few elements.

### Verification Requirements

- After any significant `web/` UI change, verify the actual file contents, not just the plan or subagent summary.
- Check that route files do not contain custom component-like HTML wrappers or overloaded Tailwind class strings.
- Run `npx tsc --noEmit` in `web/` after meaningful UI rewrites.
- If subagents are used, inspect the generated files before considering the task complete.

### Subagent Instructions

- When delegating `web/` UI work, explicitly instruct subagents to do complete rewrites when needed.
- Require them to preserve behavior, API integration, and navigation, but not the previous design.
- Require them to use only shadcn components and approved local wrappers for all visual UI.
- Reject work that still contains custom card-like or button-like `div` structures, custom spinners, or heavy inline Tailwind styling.

## Architecture

Single-binary Rust daemon:

1. **Gateway** — Axum HTTP/WS server (`:3131`)
2. **Scheduler** — Heartbeat + cron jobs
3. **Discord connector** — if `DISCORD_TOKEN` set

### Module Map

| Module | Purpose |
|---|---|
| `config/` | Config loading |
| `agent/` | Agent runtime, prompt building, tool loop |
| `models/` | `ModelProvider` trait + implementations |
| `tools/` | Tool registry, `AUTO_PLUCK_RULES` |
| `tools/builtins/` | Tool implementations |
| `skills/` | Skill registry — `SKILL.md` manifests |
| `memory/` | SQLite + FTS5 persistent memory |
| `session/` | Session store (`pinchy.db`) |
| `context/` | Context window management |
| `scheduler/` | Cron jobs, retries, dependencies |
| `gateway/` | Axum routes + WebSocket + static files |
| `slash/` | Slash command registry |
| `auth/` | GitHub device-flow, Copilot tokens |
| `secrets/` | AES-256-GCM encrypted store |

### Tool System

**Core tools** (always in prompt): `read_file`, `write_file`, `edit_file`, `list_files`, `exec_shell`, `save_memory`, `recall_memory`, `forget_memory`, `activate_skill`

**Deferred tools**: Keyword-triggered via `AUTO_PLUCK_RULES` — scans last 5 user messages for domain keywords.

### Context Management

Budget-based using `tiktoken-rs` (`o200k_base`):
- 120k tokens max, prune at 80k, compact at 100k

## CI Pipeline

`.github/workflows/ci.yml`:
1. `cargo fmt -- --check` + `cargo clippy --no-default-features`
2. `cargo test --no-default-features --lib`
3. Cross-platform release builds
4. Auto-tag, GitHub Release, crates.io publish

## MCP Best Practices

Pinchy uses a **skill-based MCP approach** (more token-efficient than native MCP):

1. **Browser automation**: Use the `browser` skill with `playwright-cli` via `exec_shell`
2. **External tools**: Use the `mcp` skill with `mcptools` CLI
3. **Progressive disclosure**: Activate skills on-demand rather than loading all tools upfront

See `src/skills/default_skills/` for examples.

## Agent Workspaces

Each agent gets `agents/<id>/workspace/`:
- `SOUL.md` — personality / system prompt
- `TOOLS.md` — tool usage instructions
- `HEARTBEAT.md` — heartbeat prompt
- `memory.db` — SQLite memory
- `skills/*/SKILL.md` — skill manifests

Sessions, receipts, cron jobs live in `pinchy.db` (shared).

## Specialized Agents

| Task | Agent File |
|------|------------|
| Backend Rust work | [`.kilo/agent/backend.md`](.kilo/agent/backend.md) |
| Frontend React work | [`.kilo/agent/frontend.md`](.kilo/agent/frontend.md) |
| Skill development | [`.kilo/agent/skills.md`](.kilo/agent/skills.md) |

## Key Patterns

- **Provider fallback**: `ProviderManager` with retry/fallback chain
- **Progressive disclosure**: Skills load full instructions on `activate_skill`
- **Auto-pluck**: Deferred tools via keywords in recent messages
- **Receipt tracking**: `ToolCallRecord` for observability
- **Session isolation**: Cron jobs run in isolated sessions

## Copilot Provider

Direct HTTP to Copilot API proxy. Auth: GitHub device-flow + token exchange. Supports OpenAI-compatible and Anthropic Messages API formats.

## Provider Authentication

All providers are configured in `config.yaml` under the `models` key. Auth status is visible in the web UI at `/config` under **Provider Connections**.

| Provider | Env Var | Notes |
|----------|---------|-------|
| OpenAI | `OPENAI_API_KEY` | API key authentication |
| Anthropic | `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` | Messages API with SSE streaming |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, or `AWS_BEARER_TOKEN_BEDROCK` | AWS credential chain or bearer token |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` | Deployment-based routing |
| GitHub Copilot | `COPILOT_TOKEN` or `~/.pinchy/copilot-token` | GitHub device-flow via `pinchy copilot login` |
| GitLab | `GITLAB_TOKEN` | PAT for GitLab integration |
| Discord | `DISCORD_TOKEN` | Bot token for gateway connector |

**Backend API:** `GET /api/providers/status` returns auth status for all configured and common providers.

**Config validation:** `pinchy start` warns about models missing API keys (except `copilot`, `ollama`, `lmstudio`, `vllm`, `anthropic` which use env vars).

## Development

```bash
# Install web dependencies (if fresh clone)
cd web && npm install --legacy-peer-deps

# Start dev mode
make dev

# Or manually:
cargo run  # Backend only
```
