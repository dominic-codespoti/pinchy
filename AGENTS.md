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

## Type Safety Guidelines

All work must maintain strict type safety across the Rust backend and TypeScript frontend.

### Backend (Rust)

**Strongly Typed API Responses**
- All HTTP API response types must be defined as structs in `src/gateway/types.rs`
- **Never use `serde_json::json!()` for HTTP responses** - always use typed `Json(ResponseStruct)`
- Use `ErrorResponse` struct for all error responses (consistent error format)
- Use `#[serde(skip_serializing_if = "Option::is_none")]` for optional fields
- Use `#[serde(skip_serializing_if = "Vec::is_empty")]` for optional vectors

**Example Pattern:**
```rust
// ✅ Correct: Typed response
Json(AgentListResponse { agents })

// ❌ Wrong: Ad-hoc JSON
Json(serde_json::json!({ "agents": agents }))
```

**API Request Bodies**
- Define `#[derive(serde::Deserialize)]` structs for request bodies
- Avoid `Json<serde_json::Value>` except for truly dynamic endpoints (webhooks)

### Frontend (TypeScript)

**Strict Mode Compliance**
- **Never use `any` type** - use `unknown` for truly dynamic data
- Enable `strict: true` in tsconfig.json (already configured)
- All API responses must be validated with Zod schemas in `web/lib/validation/schemas.ts`
- Export inferred types using `z.infer<typeof Schema>`

**Appropriate `unknown` Usage:**
- Tool call arguments (`ToolCall.arguments: Record<string, unknown>`)
- Log metadata (`LogEntry.metadata?: Record<string, unknown>`)
- Dynamic JSON from external APIs

**Zod Schema Pattern:**
```typescript
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Optional fields
  description: z.string().optional(),
  // Nullable fields from backend
  max_turns: z.number().nullable().optional(),
});

export type Agent = z.infer<typeof AgentSchema>;
```

### Type Synchronization

When modifying API responses:
1. Update the Rust struct in `src/gateway/types.rs`
2. Update the Zod schema in `web/lib/validation/schemas.ts`
3. Run `cargo check --no-default-features` to verify Rust types
4. Run `npx tsc --noEmit` in `web/` to verify TypeScript types
5. Keep field naming consistent (Rust: snake_case, TS: camelCase where appropriate)

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

#### UI Work Subagent Instructions

When delegating `web/` UI work to subagents, in addition to the above requirements:

- **Require verification via agent-browser testing** — See the [UI Verification Requirements](#ui-verification-requirements) section for the full verification protocol. Subagents must perform browser automation testing before completing UI work.
- **Require screenshots at key states** — Subagents must capture screenshots at: initial page load, after user interactions (clicks, form submissions), and error states. Use descriptive filenames.
- **Require documentation of visual issues or UX problems found** — Any layout issues, accessibility problems, or UX concerns discovered during testing must be documented in the work summary.
- **For bug fixes: Require before/after screenshots showing the fix** — Visual regression documentation is mandatory; the before/after comparison must clearly demonstrate the issue is resolved.

## UI Verification Requirements

**This is a mandatory step for all UI work. Do not skip.**

Every feature that touches the UI must be verified via browser automation testing before being considered complete.

### Required Verification Steps

1. **Browser automation testing using agent-browser**
   - Open the relevant page(s) with `agent-browser open <url>`
   - Wait for full page load with `agent-browser wait --load networkidle`
   - Interact with the UI as a user would (forms, buttons, navigation)

2. **UI snapshots at key interaction points**
   - Take interactive snapshots: `agent-browser snapshot -i`
   - Capture DOM state, accessibility tree, and computed styles
   - Verify elements are present, accessible, and properly labeled

3. **Screenshots at critical states**
   - Initial page load: `agent-browser screenshot <path>`
   - After user interactions (clicks, form submissions)
   - Error states and edge cases
   - Use descriptive filenames: `page-load.png`, `after-submit.png`, `error-state.png`

4. **Responsive behavior verification** (if applicable)
   - Test multiple viewport sizes: `agent-browser set viewport <width> <height>`
   - Common breakpoints: mobile (375x667), tablet (768x1024), desktop (1280x800)
   - Verify layout doesn't break at any size

5. **Visual regression documentation**
   - For bug fixes: Take before/after screenshots to verify the fix
   - For new features: Document the expected appearance
   - Note any visual issues or UX problems found in testing

### Reference Commands

```bash
# Open a page
agent-browser open http://localhost:3131/agents

# Wait for full load
agent-browser wait --load networkidle

# Take interactive snapshot (DOM + accessibility)
agent-browser snapshot -i

# Capture screenshot
agent-browser screenshot /tmp/verification.png

# Set viewport for responsive testing
agent-browser set viewport 1280 800
```

### Success Criteria

- Page loads without console errors
- All interactive elements are accessible
- Layout renders correctly at all tested viewport sizes
- No visual regressions from baseline (for existing features)
- Screenshots are attached to the work summary for review

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
| `session/` | Session store (`pinchy.db`). JSONL fallback files in this dir. |
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

## MCP Best Practices

Pinchy uses a **skill-based MCP approach** (more token-efficient than native MCP):

1. **Browser automation**: Use the `browser` skill with `playwright-cli` via `exec_shell`
2. **External tools**: Use the `mcp` skill with `mcptools` CLI
3. **Progressive disclosure**: Activate skills on-demand rather than loading all tools upfront

See `src/skills/default_skills/` for examples.

## Agent Workspaces

Each agent gets:
- `agents/<id>/workspace/`:
  - `SOUL.md` — personality / system prompt
  - `TOOLS.md` — tool usage instructions
  - `HEARTBEAT.md` — heartbeat prompt
  - `memory.db` — SQLite memory
- `agents/<id>/skills/*/SKILL.md` — skill manifests

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

**Discord Gateway:** `DISCORD_TOKEN` (set under `channels.discord.token`, not `models`)

**GitLab Integration:** `GITLAB_TOKEN` — used for integration features, not a model provider

**Backend API:** `GET /api/providers/status` returns auth status for all configured and common providers.

**Config validation:** `pinchy config validate` warns about models missing API keys (except `copilot`, `ollama`, `lmstudio`, `vllm`, `anthropic` which use env vars).

## Development

```bash
# Install web dependencies (if fresh clone)
cd web && npm install --legacy-peer-deps

# Start dev mode
make dev

# Or manually:
cargo run  # Backend only
```
