# Pinchy Web UI — Comprehensive Gap Analysis

## Executive Summary

The UI is well-built with consistent styling, good loading/error states, and a solid component library. The main gaps are: unused API functions, the skills page being read-only, missing WebSocket reconnection logic, no `/health` endpoint in the dashboard, and several UX refinements needed across pages.

---

## 1. API Client (`client.ts`) — Unused Functions

These API functions are defined but **never imported by any route**:

| Function | Defined | Used By |
|---|---|---|
| `getStatus()` | ✅ | dashboard only |
| `getHealth()` | ✅ | dashboard only |
| `listCronJobsByAgent(agentId)` | ✅ | **NOWHERE** — agents page could use it to show per-agent cron jobs |
| `getCurrentSession(agentId)` | ✅ | chat.tsx |
| `updateSession(agentId, sessionId, messages)` | ✅ | sessions.tsx |
| `deleteSession(agentId, sessionId)` | ✅ | sessions.tsx |
| `getHeartbeatStatusOne(agentId)` | ✅ | **NOWHERE** — agent detail page could show per-agent heartbeat |
| `listReceipts(agentId)` | ✅ | dashboard.tsx |
| `getReceipts(agentId, sessionId)` | ✅ | dashboard.tsx, chat.tsx |
| `listSlashCommands()` | ✅ | chat.tsx |

**Actionable:**
- **`listCronJobsByAgent`** — Use on agent detail page to show that agent's cron jobs in a tab or in the existing settings panel.
- **`getHeartbeatStatusOne`** — Use on agent detail page to show real-time heartbeat health indicator.

---

## 2. Per-Route Analysis

### 2.1 Skills (`skills.tsx`)

**What it does well:**
- Clean card grid layout, loading skeletons, empty state
- Shows operator badge, version, scope
- Responsive grid (1/2/3 columns)

**Gaps & Improvements:**
- ⚠️ **Read-only** — No ability to install, uninstall, toggle, or edit skills. It's purely a viewer.
- ⚠️ **No skill detail view** — Clicking a card does nothing. Should at minimum show the skill's tools/commands.
- ⚠️ **No per-agent context** — Doesn't show which agents have which skills enabled.
- ⚠️ **No refresh button** — No way to manually re-fetch skills.
- ⚠️ **Error state is below the grid** — If there are skills AND an error, both show. Error should be more prominent.
- 💡 Add a search/filter input for skills when the list grows.

### 2.2 Logs (`logs.tsx`)

**What it does well:**
- Real-time WebSocket streaming with auto-reconnect (2s retry)
- Pause/resume with queued message count
- Level filtering, text search, target filter
- Keyboard shortcut (`/` to focus search)
- Level count pills, line count
- Auto-scroll with smart detection (stops auto-scroll when user scrolls up)
- Proper `MAX_LINES` cap (2000)

**Gaps & Improvements:**
- ⚠️ **No export/download** — Can't export filtered logs to file.
- ⚠️ **No timestamp range filter** — Can only filter by level and text, not time range.
- ⚠️ **Fixed grid column widths** — `grid-cols-[90px_55px_200px_1fr]` doesn't work well for very long targets or messages. Consider making target column collapsible or adjustable.
- ⚠️ **No regex search** — Text filter is plain substring match only.
- ⚠️ **No "scroll to bottom" button** — When user scrolls up and wants to jump back to latest, no explicit button.
- 💡 Consider virtualized list for performance with 2000+ entries.

### 2.3 Config (`config.tsx`)

**What it does well:**
- Dual mode: structured form + raw YAML
- Form validation with zod/react-hook-form
- YAML↔JSON round-trip with custom parser
- Reset YAML button
- Agents summary section
- Toast notifications for save success/failure

**Gaps & Improvements:**
- ⚠️ **Custom YAML parser is fragile** — The hand-rolled `yamlToJson`/`jsonToYaml` will break on multi-line strings, complex nested structures, anchors/aliases. Consider using `js-yaml` library.
- ⚠️ **No validation on YAML save** — Beyond parse checking, no schema validation before saving.
- ⚠️ **No unsaved changes warning** — In form mode, no dirty tracking. User can navigate away losing edits.
- ⚠️ **No diff view** — When switching between form and YAML modes, changes in one don't sync to the other until saved.
- ⚠️ **Agent section is read-only** — Lists agents but says "Edit agent settings in the Agents page." Should link to agents page.
- ⚠️ **No API key masking** — API keys are shown in plain text in the form. Should be masked with a show/hide toggle.
- 💡 Add a "Test Connection" button for each model provider.

### 2.4 Cron (`cron.tsx`)

**What it does well:**
- Full CRUD (create, list, delete, edit navigation)
- Schedule preview (next 5 fires)
- Run history panel with status, duration, output preview
- Cron expression validation regex
- Responsive: table (desktop) / cards (mobile)
- Run Now via WebSocket
- One-shot option

**Gaps & Improvements:**
- ⚠️ **Schedule preview is simplistic** — Only handles minute + hour fields. Day-of-month, month, day-of-week, and `@` shortcuts show no preview.
- ⚠️ **`computeNextFires` is duplicated** — Same function exists in both `cron.tsx` and `cron-edit.tsx`. Should be extracted to a shared utility.
- ⚠️ **No pagination for run history** — Only slices first 20 runs. Should have a "load more" button.
- ⚠️ **No filter/sort for job table** — Can't filter by agent, status, or search by name.
- ⚠️ **Run history panel opens inline** — When viewing runs for one job, can't see runs for another without closing first.
- 💡 Add cron expression helper/builder (dropdown for common patterns).
- 💡 Show last run time on the job card/row.

### 2.5 Cron Edit (`cron-edit.tsx`)

**What it does well:**
- Clean detail view with back navigation
- Dirty tracking with "Unsaved changes" indicator
- Save, Delete, Run Now, History all accessible
- AI Enhance prompt feature with accept/decline dialog
- One-shot toggle
- Loading and not-found states

**Gaps & Improvements:**
- ✅ **Fully functional** — All core features work (update, delete, run, enhance, history).
- ⚠️ **No job name editing** — Can edit schedule and message, but can't rename the job.
- ⚠️ **No depends_on editing** — The `CronJob` schema supports `depends_on`, `max_retries`, `retry_delay_secs` but none of these are editable in the UI.
- ⚠️ **`computeNextFires` duplicated** — (see cron.tsx above)
- ⚠️ **No confirmation before navigating away with unsaved changes** — Only has visual indicator.
- 💡 Show the job's agent_id as a non-editable field for reference.

### 2.6 Agents (`agents.tsx`)

**What it does well:**
- Full CRUD (create, list, detail, delete)
- Tabbed detail view: Settings, Skills, Sessions, and file editors (SOUL.md, TOOLS.md, etc.)
- File editor with save for markdown files
- Skill toggle with checkboxes
- Fallback to config-based agent list when API fails
- Agent card grid with key stats (model, heartbeat, skills, cron jobs)

**Gaps & Improvements:**
- ⚠️ **No heartbeat status display** — `getHeartbeatStatusOne(agentId)` exists but isn't used. Agent detail should show current heartbeat health, last tick, next tick.
- ⚠️ **No cron jobs tab** — `listCronJobsByAgent(agentId)` exists but isn't used. Should add a "Cron" tab showing the agent's cron jobs.
- ⚠️ **No agent clone/duplicate** — Can't create a new agent based on an existing one.
- ⚠️ **File editor lacks syntax highlighting** — Plain textarea for markdown files. Consider a basic code editor or at least monospaced font with line numbers.
- ⚠️ **File editor has no dirty tracking** — User can navigate tabs and lose unsaved file content without warning.
- ⚠️ **BOOTSTRAP.md in tab list** — Listed in `fileTabs` but might not exist for every agent, shows error.
- ⚠️ **Sessions tab has no search** — List of sessions is unsorted or has no filter.
- 💡 Add agent status indicator (online/offline based on heartbeat).
- 💡 Show token usage/cost summary per agent (from receipts).

### 2.7 Placeholder (`placeholder.tsx`)

**Status:** Simple stub component with `title` prop. Only used as a fallback. Currently NOT imported by any route — the router has all routes pointing to real components. **Can be deleted** or kept for future scaffolding.

---

## 3. Router (`router.tsx`)

**What it does well:**
- Lazy-loaded routes with Suspense
- Command palette (Cmd+K) with fuzzy search
- WebSocket connection status indicator in header
- Responsive sidebar with mobile overlay
- Hash-based routing (good for static file serving)
- NotFound and Error boundary components
- Route animations

**Gaps & Improvements:**
- ⚠️ **No dead routes** — All routes point to real components. Good.
- ⚠️ **No breadcrumbs** — Nested routes (agent detail, session detail, cron edit) have back buttons but no breadcrumb trail.
- ⚠️ **Command palette can't navigate to detail routes** — Only top-level nav items. Can't jump to a specific agent or cron job.
- ⚠️ **No route preloading of data** — `defaultPreload: "intent"` is set but no `loader` functions defined on routes. Could preload query data on hover.
- ⚠️ **Mobile sidebar doesn't show active route** — Uses `activeProps` but when sidebar opens on mobile, the current active state might not be visually clear.
- 💡 Add a "recent pages" section to command palette.

---

## 4. WebSocket (`ws.ts`)

**What it does well:**
- Simple, focused hook for gateway status

**Gaps & Improvements:**
- ⚠️ **No reconnection logic** — If the WebSocket disconnects, it stays disconnected. The `onclose` handler doesn't retry. The logs page has its own reconnection, but this global status socket doesn't.
- ⚠️ **No heartbeat/ping** — No keepalive mechanism to detect stale connections.
- ⚠️ **Single-purpose** — Each page that needs WebSocket creates its own connection (chat, logs, dashboard, cron run-now). Should consider a shared WebSocket provider or multiplexed connection.
- 💡 Add reconnection with exponential backoff.

---

## 5. State (`ui.ts`)

**What it does well:**
- Simple Zustand store, good separation

**Gaps & Improvements:**
- ⚠️ **`selectedAgent` is global but not used** — Defined in the store but routes manage their own agent selection via local state. This could be unified.
- ⚠️ **No persistence** — Selected agent, sidebar state, etc. reset on reload. Consider `zustand/middleware` persist.
- 💡 Add `sidebarOpen` state to the store instead of local state in router.
- 💡 Add theme preferences or display settings.

---

## 6. Components (`ui.tsx`)

**What it does well:**
- Comprehensive set: Button, Badge, Card, Input, TextArea, Select, Checkbox, Dialog, Tabs, ScrollArea, Tooltip, Skeleton, EmptyState
- Consistent glass/neon dark theme
- CVA for variant management
- Good a11y with Radix primitives

**Gaps & Improvements:**
- ⚠️ **No ConfirmDialog** — Every deletion uses `window.confirm()`. Should have a styled modal confirmation dialog.
- ⚠️ **No Toast component** — Uses `sonner` directly. Fine, but could benefit from a wrapper for consistent styling.
- ⚠️ **EmptyState component exists but is rarely used** — Most pages inline their empty states instead of using the shared component.
- ⚠️ **No DropdownMenu** — Several places would benefit from action dropdowns instead of multiple inline buttons.
- ⚠️ **No Progress/Loading component** — Several pages duplicate the spinner markup.
- 💡 Extract the spinning loader to a `<Spinner />` component.

---

## 7. Styles (`global.css`)

**What it does well:**
- Custom scrollbar styling
- Blueprint grid background
- Glass/neon component classes
- Chat bubble styling
- Markdown rendering styles
- Various animations (shimmer, glow-pulse, status-pulse, bounce, route-enter)

**Gaps & Improvements:**
- ⚠️ **No responsive breakpoints for font sizes** — Text can feel small on mobile.
- ⚠️ **Stagger fade animation is disabled** — `.stagger-fade > *` sets `animation: none`. Dead code?
- ⚠️ **No light mode** — Purely dark theme. Acceptable for dev tools but could add a toggle.
- 💡 The `text-mute` class is used in router.tsx but appears to be a Tailwind custom utility not defined. Should verify it works.

---

## 8. Cross-Cutting Issues

### 8.1 Error Handling
- ✅ Most pages have error states for query failures
- ⚠️ **No retry buttons on errors** — Error messages show but no way to retry without reloading
- ⚠️ **No offline detection** — The WS status shows connected/disconnected but API calls don't show offline state

### 8.2 Loading States
- ✅ Most pages have loading skeletons or spinners
- ⚠️ **Skills page shows skeleton grid AND real grid simultaneously** during loading (both render, skeleton should be conditional)

### 8.3 Data Freshness
- ⚠️ **No refetchInterval on most queries** — Dashboard refetches heartbeat/health every 20-30s, but agents, cron jobs, skills are stale until manually navigated to.
- 💡 Add subtle stale data indicators.

---

## 9. Priority Action Items

### High Priority
1. **Fix WS reconnection in `ws.ts`** — Add reconnection with backoff
2. **Add `listCronJobsByAgent` to agent detail** — New "Cron" tab
3. **Add `getHeartbeatStatusOne` to agent detail** — Show heartbeat health
4. **Replace `window.confirm` with styled ConfirmDialog** — 5+ locations
5. **Extract `computeNextFires` to shared util** — Duplicated in cron.tsx and cron-edit.tsx
6. **Extract spinner to `<Spinner />` component** — Duplicated in 6+ locations

### Medium Priority
7. **Skills page: add detail view** — Click skill to see its tools/commands
8. **Config: mask API keys** — Show/hide toggle
9. **Cron edit: expose depends_on, max_retries, retry_delay_secs fields**
10. **Agent detail: file editor dirty tracking** — Warn before tab switch
11. **Logs: add "scroll to bottom" button**
12. **Improve schedule preview** — Support day-of-month, month, day-of-week
13. **Add error retry buttons** — "Try again" on failed queries

### Low Priority
14. **Use EmptyState component consistently** — Replace inline empty states
15. **Unify agent selection** — Use zustand `selectedAgent` store-wide
16. **Add route data preloading** — Use TanStack Router loaders
17. **Skills page: add search/filter**
18. **Config: use `js-yaml` instead of hand-rolled parser**
19. **Delete `placeholder.tsx`** — No longer used
20. **Add DropdownMenu component** for action buttons
