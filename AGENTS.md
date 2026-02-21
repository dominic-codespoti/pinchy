# AGENTS.md

Goal: build a tiny Rust daemon that can run on a Pi, talks via channels such as Discord, calls LLMs, runs tools, and supports heartbeat + cron proactive triggers.

## Rules
- Ship the smallest thing that works. Cut scope, don’t add features “just in case”.

## MVP (in this order)
1) Load `config.yaml` (agents, discord token, model providers)
2) Connect Discord bot, receive messages, send replies (generic pattern to allow for future channels)
3) Agent runtime: build prompt from workspace markdown + short session history
4) LLM provider trait + OpenAI implementation (API key first; OAuth later)
5) Tool runner: only `read`, `write`, `exec` in workspace
6) Heartbeat: `tokio::time::interval` + `HEARTBEAT.md` + `HEARTBEAT_OK`
7) Cron: persisted jobs + `cron` scheduler + dispatch to agent

## Workspace contract
Per agent workspace contains optional:
- `SOUL.md`, `TOOLS.md`, `HEARTBEAT.md`
- `skills/` (later)
- `sessions/*.jsonl`

Never read/write outside the agent workspace unless explicitly configured.

## Code shape
Crates/modules:
- `config` (serde load + validate)
- `discord` (connector)
- `agent` (prompt build, session store)
- `models` (provider trait + openai + azure_openai)
- `tools` (builtin tools + sandbox rules)
- `tools/memory_tool` (save/recall persistent memory)
- `tools/skill_author_tool` (create_skill/list_skills)
- `scheduler` (heartbeat + cron)
- `main` (wires everything)

## "Done" criteria for a milestone
- Works end-to-end on a Pi with `cargo run --release`
- Logs are readable; failures don't crash the whole process
- No hidden background magic: all actions are explicit and observable

## Stretch-goals (keep in mind)
- Web UI, websockets, pairing flows, multi-channel routing, mobile nodes

## Inspiration
Pull from and take inspiration from the project "https://github.com/openclaw/openclaw" if needed via search tools.

Agents now use a canonical per-agent workspace at agents/<id>/workspace. Each workspace contains agent-specific files (`SOUL.md`, `TOOLS.md`, `HEARTBEAT.md`, `sessions/`) and a `BOOTSTRAP.md` template to document onboarding. See CONSOLIDATION.md and agents/default/BOOTSTRAP.md for the consolidation plan and bootstrap template.

---

## Phase 2 — Feature Plan

### F1: Persistent Memory (cross-session knowledge store)

**Why:** Sessions rotate — when one ends, the agent forgets everything.
Memory lets the agent accumulate knowledge that persists across sessions
(user preferences, project facts, recurring tasks).

**Design:**
- Storage: one JSONL file per agent at `agents/<id>/workspace/memory.jsonl`
- Each entry: `{ "key": "...", "value": "...", "tags": [...], "timestamp": <epoch_ms> }`
- Key is a short slug (e.g. `"user_timezone"`, `"project_stack"`); value is free-text
- Duplicate keys overwrite (last-write-wins on the slug)

**Two new tools registered in `tools/mod.rs`:**
- `save_memory { key, value, tags? }` — append/upsert to memory.jsonl
- `recall_memory { query?, tag?, limit? }` — search entries by substring or tag; returns top N
  - If `query` is provided and an embedding model is configured, use cosine similarity
  - Otherwise fall back to case-insensitive substring match on key+value

**Embedding support (optional, Azure path):**
- New trait method on `ModelProvider`: `async fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>`
  - Default impl returns `Err("not supported")`
  - `AzureOpenAIProvider` overrides with a call to the Azure embeddings endpoint
- `recall_memory` checks if an embedding provider is configured; if yes, embed the query
  and rank stored memories by cosine similarity; if no, substring search
- Embeddings are cached in `memory_embeddings.bin` (simple flat `Vec<f32>` per entry)
  to avoid re-embedding on every recall

**Prompt injection:**
- At prompt-build time (`agent/mod.rs`), load all memory entries and inject them
  as a `<memory>` block in the system prompt (after SOUL.md, before TOOLS.md)
- Cap at ~2K tokens worth of entries; prioritise by recency + relevance

**Files touched:**
- New: `src/tools/memory_tool.rs`
- Edit: `src/tools/mod.rs` (register + dispatch)
- Edit: `src/agent/mod.rs` (inject memory into prompt)
- Edit: `src/models/mod.rs` (add `embed()` default method to trait)

---

### F2: Azure OpenAI / Azure AI Foundry Provider

**Why:** User wants to use Azure-hosted models including embedding models.
Azure OpenAI uses a different endpoint pattern and auth header than vanilla OpenAI.

**Design:**
- New file: `src/models/azure_openai.rs`
- Struct `AzureOpenAIProvider`:
  - `endpoint: String` — e.g. `https://<resource>.openai.azure.com`
  - `api_key: String` — Azure API key
  - `deployment: String` — deployment name (replaces model in URL)
  - `api_version: String` — e.g. `"2024-10-21"`
  - `embedding_deployment: Option<String>` — separate deployment for embeddings
- Chat completions URL: `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}`
- Embeddings URL: `{endpoint}/openai/deployments/{embedding_deployment}/embeddings?api-version={api_version}`
- Auth header: `api-key: {api_key}` (NOT `Authorization: Bearer`)
- Implements `ModelProvider` trait including `send_chat`, `send_chat_with_functions`, and `embed()`

**Config extension:**
```yaml
models:
  - id: azure-gpt4
    provider: azure-openai
    model: gpt-4o                    # deployment name
    api_key: $AZURE_OPENAI_API_KEY
    endpoint: https://myresource.openai.azure.com
    api_version: "2024-10-21"        # optional, has default
  - id: azure-embeddings
    provider: azure-openai
    model: text-embedding-3-small
    api_key: $AZURE_OPENAI_API_KEY
    endpoint: https://myresource.openai.azure.com
```

**Config struct changes:**
- Add optional fields to `ModelConfig`: `endpoint`, `api_version`
- Remove `deny_unknown_fields` from `ModelConfig` (already blocks new fields)
- Wire into `build_provider()` match arm: `"azure-openai" | "azure_openai" | "azure"`

**Files touched:**
- New: `src/models/azure_openai.rs`
- Edit: `src/models/mod.rs` (add `embed()` to trait, `build_provider` arm, re-export)
- Edit: `src/config/mod.rs` (add `endpoint`, `api_version` to `ModelConfig`)

---

### F3: Webhook Ingest Endpoint

**Why:** External systems (GitHub, Sentry, Stripe, IFTTT, Home Assistant)
can POST events that trigger agent actions — the agent becomes reactive
to the real world, not just chat messages.

**Design:**
- New route: `POST /api/webhook/:agent_id`
- Accepts arbitrary JSON body
- Wraps it in an `IncomingMessage` with `source: "webhook"` and dispatches
  to the agent's message bus
- Agent receives it as a system message: `"Webhook received:\n```json\n{body}\n```"`
- Optional: `?secret=<token>` query param validated against a per-agent
  `webhook_secret` in config (simple shared secret, not HMAC for now)
- Returns `202 Accepted` with `{ "status": "dispatched", "agent": "<id>" }`

**Config extension:**
```yaml
agents:
  - id: default
    webhook_secret: $WEBHOOK_SECRET   # optional
```

**Files touched:**
- Edit: `src/gateway/mod.rs` (add route + handler)
- Edit: `src/config/mod.rs` (add `webhook_secret` to `AgentConfig`)
- Edit: `src/comm/mod.rs` (ensure IncomingMessage supports `source` field)

---

### F4: Skill Self-Authoring Tool

**Why:** The agent should be able to create new skills for itself at runtime,
just like OpenClaw agents do. "Build a skill that checks the weather" →
agent writes SKILL.md + skill.yaml → hot-reloads the registry.

**Design:**
- New tool: `create_skill { name, description, instructions, scope? }`
  - `scope` defaults to `"agent"` (per-agent skill)
  - Creates `agents/<id>/workspace/skills/<name>/SKILL.md` with proper frontmatter
  - Creates `agents/<id>/workspace/skills/<name>/skill.yaml`
  - Calls `SkillRegistry::reload()` to hot-reload
- New tool: `list_skills {}` — returns the agent's current skill list

**SkillRegistry changes:**
- Add `pub fn reload(&mut self)` that re-scans both global and agent skill dirs
- Expose a global `reload_skills()` function that acquires the registry lock and reloads
- These already have the scanning logic in `discover()` — reload just calls it again

**Files touched:**
- New: `src/tools/skill_author_tool.rs`
- Edit: `src/tools/mod.rs` (register + dispatch)
- Edit: `src/skills/mod.rs` (add `reload()` method)

---

### F5: Enhance `pinchy init` Wizard

**Why:** The existing wizard (`app_onboard`) handles config creation and
copilot login but doesn't guide through API key entry, Azure setup, or
webhook configuration. It should be the friction-free entry point.

**Enhancements:**
1. **Provider-aware key prompts:**
   - If user picks `openai` → prompt for `OPENAI_API_KEY`, save to secrets
   - If user picks `azure-openai` → prompt for endpoint, API key, deployment names
   - If user picks `copilot` → trigger device flow (already implemented)

2. **Discord setup step:**
   - Ask "Connect Discord?" → if yes, prompt for bot token, save to secrets

3. **Embedding model step:**
   - Ask "Configure an embedding model for memory search?" → if yes,
     prompt for provider + deployment, add to config.models

4. **Summary with next-steps:**
   - Print URLs: dashboard at `http://localhost:8080`
   - Print: "Send your first message: `pinchy chat hello`"

**Files touched:**
- Edit: `src/cli/mod.rs` (extend `app_onboard` + `interactive_onboard_tui`)
- Edit: `src/config/mod.rs` (if new fields needed)

---

## Implementation Order

```
 F2: Azure OpenAI Provider       ← unlocks embedding support
  │
  ▼
 F1: Persistent Memory           ← uses embeddings from F2 for recall
  │
  ▼
 F3: Webhook Ingest              ← independent, small surface area
  │
  ▼
 F4: Skill Self-Authoring        ← independent, builds on existing skill infra
  │
  ▼
 F5: Enhanced Init Wizard        ← ties all new features into onboarding
```

Each feature is designed to be independently shippable and testable.
F2 → F1 have a dependency (embeddings power semantic memory search).
F3, F4, F5 are independent of each other and can be reordered.

**Workspace additions:**
- `memory.jsonl` — persistent knowledge store
- `memory_embeddings.bin` — cached embedding vectors

## Remember
- Ensure strict type safety and error handling; avoid panics
- Ensure TypeScript / Rust boundary is well-defined and types are kept in sync