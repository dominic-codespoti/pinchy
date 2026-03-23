import { createSignal, createMemo, createEffect, Show, For } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import {
  Bot, MessageSquare, ArrowLeft, Heart, Brain, Clock, Cpu,
  Save, Search, Trash2, X, Settings, Copy,
} from "@/components/icons";
import { PageShell } from "@/components/layout";
import { FormField } from "@/components/layout";
import { createQuery, createMutation, invalidateQueries } from "@/api/use-api";
import {
  qk, fetchAgent, fetchAgentFile, saveAgentFile,
  updateAgent, fetchMemory, deleteMemory,
} from "@/api/queries";
import type { MemoryEntry, UpdateAgentPayload } from "@/api/schemas";
import { toast } from "@/components/toast";

// ── Types ────────────────────────────────────────────

type DetailTab = "overview" | "files" | "settings" | "memory";
const TABS: readonly DetailTab[] = ["overview", "files", "settings", "memory"];
const FILE_NAMES = ["SOUL.md", "TOOLS.md", "HEARTBEAT.md"] as const;

// ── Component ────────────────────────────────────────

export default function AgentDetail() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const navigate = useNavigate();

  const agentQ = createQuery({
    key: qk.agent(agentId),
    fn: () => fetchAgent(agentId),
  });

  const [tab, setTab] = createSignal<DetailTab>("overview");

  return (
    <PageShell
      maxWidth="5xl"
      header={
        <A href="/agents" class="agent-back-link">
          <ArrowLeft size={14} />
          Agents
        </A>
      }
    >
      {/* Loading */}
      <Show when={agentQ.isLoading}>
        <div style={{ padding: "var(--space-6)" }}>
          <div class="skeleton" style={{ height: "160px", "border-radius": "var(--radius-lg)" }} />
        </div>
      </Show>

      {/* Error */}
      <Show when={agentQ.isError}>
        <div class="empty-state">
          <Bot size={24} />
          <p>Couldn't load agent</p>
          <button class="btn btn-secondary btn-sm" onClick={() => agentQ.refetch()}>Retry</button>
        </div>
      </Show>

      {/* No data */}
      <Show when={!agentQ.isLoading && !agentQ.isError && !agentQ.data}>
        <div class="empty-state">
          <Bot size={24} />
          <p>Agent not found</p>
          <A href="/agents" class="btn btn-secondary btn-sm">Back to agents</A>
        </div>
      </Show>

      {/* Main content */}
      <Show when={agentQ.data}>
        {(() => {
          const data = agentQ.data!;
          return (
            <div class="route-enter agent-detail-stack">
              {/* Identity block */}
              <div class="agent-identity">
                <div class="agent-identity-left">
                  <div class="agent-identity-header">
                    <div class="agent-identity-icon">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h1 class="agent-identity-name">{agentId}</h1>
                      <p class="agent-identity-model">{data.model ?? "Default"}</p>
                    </div>
                  </div>
                  <div class="agent-identity-chips">
                    <span class="agent-chip">
                      <Heart size={14} />
                      {data.heartbeat_secs ? `${data.heartbeat_secs}s heartbeat` : "Heartbeat off"}
                    </span>
                    <span class="agent-chip">
                      <Clock size={14} />
                      {data.cron_job_count ?? 0} cron
                    </span>
                    <span class="agent-chip">
                      <Brain size={14} />
                      {data.enabled_skills?.length ?? 0} skills
                    </span>
                  </div>
                </div>
                <div class="agent-identity-actions">
                  <A href={`/chat/${agentId}`} class="btn btn-primary btn-sm" style={{ "text-decoration": "none" }}>
                    <MessageSquare size={14} />
                    Chat
                  </A>
                  <button class="btn btn-secondary btn-sm" onClick={() => setTab("files")}>
                    Edit files
                  </button>
                  <button class="btn btn-secondary btn-sm" onClick={() => setTab("settings")}>
                    <Settings size={14} />
                    Settings
                  </button>
                </div>
              </div>

              {/* Tab bar */}
              <div class="agent-tabs">
                <For each={TABS}>
                  {(t) => (
                    <button
                      class={`agent-tab ${tab() === t ? "agent-tab-active" : "agent-tab-inactive"}`}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  )}
                </For>
              </div>

              {/* Tab content */}
              <Show when={tab() === "overview"}>
                <OverviewTab
                  model={data.model ?? "Default model"}
                  heartbeat={data.heartbeat_secs ?? null}
                  cronCount={data.cron_job_count ?? 0}
                  sessionCount={data.session_count ?? 0}
                  skillCount={data.enabled_skills?.length ?? 0}
                />
              </Show>
              <Show when={tab() === "files"}>
                <FilesTab agentId={agentId} />
              </Show>
              <Show when={tab() === "settings"}>
                <SettingsTab
                  agentId={agentId}
                  model={data.model ?? undefined}
                  heartbeatSecs={data.heartbeat_secs ?? undefined}
                  maxToolIter={data.max_tool_iterations ?? undefined}
                  maxTurns={data.max_turns ?? undefined}
                  histMsgs={data.history_messages ?? undefined}
                  effort={data.reasoning_effort ?? undefined}
                />
              </Show>
              <Show when={tab() === "memory"}>
                <MemoryTab agentId={agentId} />
              </Show>
            </div>
          );
        })()}
      </Show>
    </PageShell>
  );
}

// ── Overview Tab ─────────────────────────────────────

function OverviewTab(props: {
  model: string;
  heartbeat: number | null;
  cronCount: number;
  sessionCount: number;
  skillCount: number;
}) {
  const stats = () => [
    { label: "Model", value: props.model, Icon: Cpu },
    { label: "Heartbeat", value: props.heartbeat ? `${props.heartbeat}s` : "Off", Icon: Heart },
    { label: "Cron jobs", value: String(props.cronCount), Icon: Clock },
    { label: "Sessions", value: String(props.sessionCount), Icon: Settings },
  ];

  return (
    <div class="agent-overview">
      <div class="card">
        <h2 class="card-title" style={{ "margin-bottom": "var(--space-4)" }}>Overview</h2>
        <div class="agent-stat-grid">
          <For each={stats()}>
            {(item) => (
              <div class="agent-stat-cell">
                <div class="agent-stat-label">
                  <item.Icon size={14} />
                  {item.label}
                </div>
                <p class="agent-stat-value">{item.value}</p>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="card">
        <p class="card-title" style={{ "margin-bottom": "var(--space-3)" }}>State</p>
        <div class="agent-state-badges">
          <span class="badge badge-outline" style={{ "border-radius": "var(--radius-xl)", padding: "4px 10px" }}>
            {props.skillCount} skills enabled
          </span>
          <span class="badge badge-outline" style={{ "border-radius": "var(--radius-xl)", padding: "4px 10px" }}>
            {props.heartbeat ? `${props.heartbeat}s heartbeat` : "Heartbeat off"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Files Tab ────────────────────────────────────────

function FilesTab(props: { agentId: string }) {
  const [activeFile, setActiveFile] = createSignal<string>(FILE_NAMES[0]);

  return (
    <div class="agent-files">
      <div class="card">
        <div class="agent-file-picker">
          <For each={FILE_NAMES}>
            {(filename) => (
              <button
                class={`agent-file-btn ${activeFile() === filename ? "agent-file-btn-active" : "agent-file-btn-inactive"}`}
                onClick={() => setActiveFile(filename)}
              >
                {filename}
              </button>
            )}
          </For>
        </div>
      </div>

      <FileEditor agentId={props.agentId} filename={activeFile()} />
    </div>
  );
}

function FileEditor(props: { agentId: string; filename: string }) {
  const fileQ = createQuery({
    key: qk.agentFile(props.agentId, props.filename),
    fn: () => fetchAgentFile(props.agentId, props.filename),
  });

  const [content, setContent] = createSignal("");
  const [initialized, setInitialized] = createSignal(false);

  // Reset content when file data loads or filename changes
  createEffect(() => {
    const c = fileQ.data?.content;
    if (c != null) {
      setContent(c);
      setInitialized(true);
    }
  });

  const isDirty = createMemo(() => {
    if (!initialized()) return false;
    return content() !== (fileQ.data?.content ?? "");
  });

  const saveMut = createMutation({
    fn: (args: { filename: string; content: string }) =>
      saveAgentFile(props.agentId, args.filename, args.content),
    onSuccess: (_data, args) => {
      invalidateQueries(qk.agentFile(props.agentId, props.filename));
      invalidateQueries(qk.agent(props.agentId));
      toast.success(`${args.filename} saved`);
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <Show when={!fileQ.isLoading} fallback={
      <div class="skeleton" style={{ height: "420px", "border-radius": "var(--radius-lg)" }} />
    }>
      <div class="card">
        <div class="agent-file-editor-header">
          <div style={{ display: "flex", "align-items": "center" }}>
            <h2 class="agent-file-editor-title">{props.filename}</h2>
            <Show when={isDirty()}>
              <span class="agent-file-editor-dirty">Unsaved</span>
            </Show>
          </div>
          <button
            class="btn btn-primary btn-sm"
            disabled={saveMut.isLoading}
            onClick={() => saveMut.mutate({ filename: props.filename, content: content() })}
          >
            <Save size={14} />
            {saveMut.isLoading ? "Saving..." : "Save"}
          </button>
        </div>
        <textarea
          class="agent-file-textarea"
          value={content()}
          onInput={(e) => setContent(e.currentTarget.value)}
          style={{ "margin-top": "var(--space-3)" }}
        />
      </div>
    </Show>
  );
}

// ── Settings Tab ─────────────────────────────────────

function SettingsTab(props: {
  agentId: string;
  model: string | undefined;
  heartbeatSecs: number | undefined;
  maxToolIter: number | undefined;
  maxTurns: number | undefined;
  histMsgs: number | undefined;
  effort: string | undefined;
}) {
  const [model, setModel] = createSignal(props.model ?? "");
  const [hb, setHb] = createSignal(props.heartbeatSecs != null ? String(props.heartbeatSecs) : "");
  const [iter, setIter] = createSignal(String(props.maxToolIter ?? 15));
  const [turns, setTurns] = createSignal(String(props.maxTurns ?? 20));
  const [hist, setHist] = createSignal(String(props.histMsgs ?? 40));
  const [effort, setEffort] = createSignal(props.effort ?? "");

  const updateMut = createMutation({
    fn: (payload: UpdateAgentPayload) => updateAgent(props.agentId, payload),
    onSuccess: () => {
      invalidateQueries(qk.agent(props.agentId));
      invalidateQueries(qk.agents);
      invalidateQueries(qk.heartbeatAgent(props.agentId));
      invalidateQueries(qk.heartbeat);
      toast.success("Settings saved");
    },
    onError: (msg) => toast.error(msg),
  });

  function handleSave() {
    updateMut.mutate({
      model: model() || undefined,
      ...(hb().length > 0 ? { heartbeat_secs: Number(hb()) } : {}),
      max_tool_iterations: Number(iter()) || undefined,
      max_turns: Number(turns()) || undefined,
      history_messages: Number(hist()) || undefined,
      reasoning_effort: effort() || undefined,
    });
  }

  const fields: readonly { label: string; get: () => string; set: (v: string) => void; type?: string; placeholder?: string }[] = [
    { label: "Model", get: model, set: setModel },
    { label: "Heartbeat (secs)", get: hb, set: setHb, type: "number", placeholder: "off" },
    { label: "Max tool iterations", get: iter, set: setIter, type: "number" },
    { label: "Max turns", get: turns, set: setTurns, type: "number" },
    { label: "History messages", get: hist, set: setHist, type: "number" },
    { label: "Reasoning effort", get: effort, set: setEffort },
  ];

  return (
    <div class="card">
      <h2 class="card-title" style={{ "margin-bottom": "var(--space-4)" }}>Settings</h2>
      <div class="agent-settings-grid">
        <For each={fields}>
          {(field) => (
            <FormField label={field.label}>
              <input
                class="input"
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                value={field.get()}
                onInput={(e) => field.set(e.currentTarget.value)}
              />
            </FormField>
          )}
        </For>
      </div>
      <div class="agent-settings-footer">
        <button
          class="btn btn-primary btn-sm"
          disabled={updateMut.isLoading}
          onClick={handleSave}
        >
          <Save size={14} />
          {updateMut.isLoading ? "Saving..." : "Save settings"}
        </button>
      </div>
    </div>
  );
}

// ── Memory Tab ───────────────────────────────────────

function MemoryTab(props: { agentId: string }) {
  const [search, setSearch] = createSignal("");
  const [debouncedQ, setDebouncedQ] = createSignal("");

  // Debounce search
  let searchTimeout: number | undefined;
  createEffect(() => {
    const val = search();
    clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => setDebouncedQ(val), 300);
  });

  const memoryQ = createQuery({
    key: qk.memory(props.agentId, debouncedQ()),
    fn: () => fetchMemory(props.agentId, {
      q: debouncedQ() || undefined,
      limit: 100,
    }),
  });

  const entries = createMemo<readonly MemoryEntry[]>(() => memoryQ.data?.entries ?? []);

  const deleteMut = createMutation({
    fn: (key: string) => deleteMemory(props.agentId, key),
    onSuccess: () => {
      invalidateQueries(qk.memory(props.agentId));
      toast.success("Memory entry deleted");
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <div class="card">
      <div class="memory-header">
        <h2 class="card-title">Memory</h2>
        <div class="memory-search">
          <span class="memory-search-icon"><Search size={14} /></span>
          <input
            class="input memory-search-input"
            placeholder="Search memory"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <Show when={search().length > 0}>
            <button class="memory-search-clear" onClick={() => setSearch("")}>
              <X size={14} />
            </button>
          </Show>
        </div>
      </div>

      <div style={{ "margin-top": "var(--space-4)" }}>
        <Show when={memoryQ.isLoading}>
          <div class="skeleton" style={{ height: "96px", "border-radius": "var(--radius-lg)" }} />
        </Show>

        <Show when={!memoryQ.isLoading && entries().length === 0}>
          <div class="empty-state">
            <Brain size={24} />
            <p>{debouncedQ() ? "No matches" : "No memory yet"}</p>
          </div>
        </Show>

        <Show when={!memoryQ.isLoading && entries().length > 0}>
          <div class="memory-list">
            <For each={entries()}>
              {(entry) => (
                <div class="memory-entry">
                  <div class="memory-entry-header">
                    <span class="memory-entry-key">{entry.key}</span>
                    <button
                      class="memory-entry-delete"
                      title="Delete"
                      onClick={() => deleteMut.mutate(entry.key)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p class="memory-entry-value">{entry.value}</p>
                  <Show when={entry.tags.length > 0}>
                    <div class="memory-entry-tags">
                      <For each={entry.tags}>
                        {(tag) => (
                          <span class="badge badge-outline" style={{ "border-radius": "var(--radius-xl)", padding: "2px 8px", "font-size": "10px" }}>
                            {tag}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <span class="memory-entry-timestamp">{entry.timestamp}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
