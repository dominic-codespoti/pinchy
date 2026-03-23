import { createSignal, createMemo, Show, For, createEffect, onCleanup } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { Bot, Plus, Copy, Trash2, Heart, Brain, Clock, ChevronRight, X, MessageSquare } from "@/components/icons";
import { PageShell, PageTitle } from "@/components/layout";
import { createQuery, createMutation, invalidateQueries } from "@/api/use-api";
import { qk, fetchAgents, createAgent, deleteAgent, cloneAgent } from "@/api/queries";
import type { AgentListItem } from "@/api/schemas";
import { HttpError } from "@/api/http";
import { toast } from "@/components/toast";

// ── Helpers ──────────────────────────────────────────

function getAgentIdIssue(id: string, existing: readonly string[]): string | null {
  if (id.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return "Use letters, numbers, hyphens, or underscores.";
  if (existing.some((e) => e.toLowerCase() === id.toLowerCase())) return "That agent ID already exists.";
  return null;
}

function suggestAgentId(existing: readonly string[]): string {
  let i = 1;
  let c = `agent_${i}`;
  while (existing.some((e) => e.toLowerCase() === c.toLowerCase())) {
    i++;
    c = `agent_${i}`;
  }
  return c;
}

function suggestCloneId(src: string, existing: readonly string[]): string {
  let candidate = `${src}_copy`;
  if (!existing.some((e) => e.toLowerCase() === candidate.toLowerCase())) return candidate;
  let i = 2;
  candidate = `${src}_copy_${i}`;
  while (existing.some((e) => e.toLowerCase() === candidate.toLowerCase())) {
    i++;
    candidate = `${src}_copy_${i}`;
  }
  return candidate;
}

function getMutationMessage(error: unknown): string {
  if (error instanceof HttpError) {
    try {
      const parsed = JSON.parse(error.body) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.length > 0) return parsed.error;
    } catch { /* ignore */ }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

// ── Component ────────────────────────────────────────

export default function AgentsList() {
  const navigate = useNavigate();

  const agentsQ = createQuery({
    key: qk.agents,
    fn: fetchAgents,
    refetchInterval: 30_000,
  });

  const agents = createMemo<readonly AgentListItem[]>(() => agentsQ.data?.agents ?? []);
  const existingIds = createMemo(() => agents().map((a) => a.id));

  // ── Create ──
  const [showCreate, setShowCreate] = createSignal(false);
  const [newId, setNewId] = createSignal("");
  const [createErr, setCreateErr] = createSignal<string | undefined>();

  const createMut = createMutation({
    fn: (payload: { id: string }) => createAgent(payload),
    onSuccess: (_data, args) => {
      invalidateQueries(qk.agents);
      setShowCreate(false);
      setNewId("");
      setCreateErr(undefined);
      toast.success(`Agent "${args.id}" created`);
      navigate(`/agents/${args.id}`);
    },
    onError: (msg) => {
      setCreateErr(msg);
      toast.error(msg);
    },
  });

  const trimmedNewId = createMemo(() => newId().trim());
  const createIssue = createMemo(() => getAgentIdIssue(trimmedNewId(), existingIds()));

  function handleCreate() {
    const id = trimmedNewId();
    if (id.length === 0 || createIssue() != null) return;
    setCreateErr(undefined);
    createMut.mutate({ id });
  }

  // ── Delete ──
  const [deleteId, setDeleteId] = createSignal<string | null>(null);

  const deleteMut = createMutation({
    fn: (id: string) => deleteAgent(id),
    onSuccess: (_data, id) => {
      invalidateQueries(qk.agents);
      setDeleteId(null);
      toast.success(`Agent "${id}" deleted`);
    },
    onError: (msg) => toast.error(msg),
  });

  // ── Clone ──
  const [cloneSrc, setCloneSrc] = createSignal<string | null>(null);
  const [cloneNewId, setCloneNewId] = createSignal("");
  const [cloneErr, setCloneErr] = createSignal<string | undefined>();

  const cloneMut = createMutation({
    fn: (args: { id: string; newId: string }) => cloneAgent(args.id, args.newId),
    onSuccess: (_data, args) => {
      invalidateQueries(qk.agents);
      setCloneSrc(null);
      setCloneNewId("");
      setCloneErr(undefined);
      toast.success(`Agent "${args.newId}" cloned`);
      navigate(`/agents/${args.newId}`);
    },
    onError: (msg) => {
      setCloneErr(msg);
      toast.error(msg);
    },
  });

  const trimmedCloneId = createMemo(() => cloneNewId().trim());
  const cloneIssue = createMemo(() => getAgentIdIssue(trimmedCloneId(), existingIds()));

  createEffect(() => {
    if (!showCreate() && deleteId() == null && cloneSrc() == null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowCreate(false);
      setDeleteId(null);
      setCloneSrc(null);
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  function handleClone() {
    const src = cloneSrc();
    const id = trimmedCloneId();
    if (src == null || id.length === 0 || cloneIssue() != null) return;
    setCloneErr(undefined);
    cloneMut.mutate({ id: src, newId: id });
  }

  return (
    <PageShell
      maxWidth="4xl"
      header={
        <PageTitle icon={<Bot size={16} />} title="Agents">
          <button
            class="btn btn-primary btn-sm"
            onClick={() => {
              setShowCreate(true);
              setNewId("");
              setCreateErr(undefined);
            }}
          >
            <Plus size={14} />
            Create
          </button>
        </PageTitle>
      }
    >
      <div class="route-enter agents-list-container">
        {/* Summary strip */}
        <div class="agents-summary" style={{ "flex-direction": "row", gap: "var(--space-4)" }}>
          <span>{agents().length} agents</span>
          <span>{agents().filter((a) => (a.cron_jobs_count ?? a.cron_job_count ?? 0) > 0).length} with cron</span>
          <span>{agents().filter((a) => a.heartbeat_secs != null).length} with heartbeat</span>
        </div>

        {/* Agent list */}
        <Show when={!agentsQ.isLoading} fallback={
          <div class="card" style={{ padding: "var(--space-4)" }}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
              <div class="skeleton" style={{ height: "52px" }} />
              <div class="skeleton" style={{ height: "52px" }} />
              <div class="skeleton" style={{ height: "52px" }} />
            </div>
          </div>
        }>
          <Show when={agentsQ.isError}>
            <div class="empty-state">
              <Bot size={24} />
              <p>Couldn't load agents</p>
              <button class="btn btn-secondary btn-sm" onClick={() => agentsQ.refetch()}>Retry</button>
            </div>
          </Show>

          <Show when={!agentsQ.isError && agents().length === 0}>
            <div class="empty-state">
              <Bot size={24} />
              <p>No agents yet</p>
            </div>
          </Show>

          <Show when={!agentsQ.isError && agents().length > 0}>
            <div class="card" style={{ padding: 0, overflow: "hidden" }}>
              <For each={agents()}>
                {(agent) => {
                  const cronCount = () => agent.cron_job_count ?? agent.cron_jobs_count ?? 0;
                  const skillCount = () => agent.enabled_skills?.length ?? 0;

                  return (
                    <div class="agent-row">
                      <A href={`/agents/${agent.id}`} class="agent-row-info" style={{ "text-decoration": "none", color: "inherit" }}>
                        <span class="agent-row-name">{agent.id}</span>
                        <div class="agent-row-meta">
                          <span class="agent-row-model">{agent.model ?? "Default"}</span>
                          <div class="agent-row-dots">
                            <span class={`status-dot ${agent.has_soul ? "status-dot-success" : "status-dot-idle"}`} title="SOUL.md" />
                            <span class={`status-dot ${agent.has_tools ? "status-dot-success" : "status-dot-idle"}`} title="TOOLS.md" />
                            <span class={`status-dot ${agent.has_heartbeat ? "status-dot-success" : "status-dot-idle"}`} title="HEARTBEAT.md" />
                          </div>
                        </div>
                        <span class="agent-row-stats">
                          {cronCount()} cron &middot; {skillCount()} skills
                          {agent.heartbeat_secs ? ` · ${agent.heartbeat_secs}s heartbeat` : ""}
                        </span>
                      </A>

                      <div class="agent-row-actions">
                        <A
                          href={`/chat/${agent.id}`}
                          class="btn btn-ghost btn-sm btn-icon"
                          title="Chat"
                          style={{ "text-decoration": "none" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MessageSquare size={14} />
                        </A>
                        <button
                          class="btn btn-ghost btn-sm btn-icon"
                          title="Clone"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCloneSrc(agent.id);
                            setCloneNewId(suggestCloneId(agent.id, existingIds()));
                            setCloneErr(undefined);
                          }}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          class="btn btn-ghost btn-sm btn-icon"
                          title="Delete"
                          style={{ color: "var(--destructive)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(agent.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <A href={`/agents/${agent.id}`} class="agent-row-chevron" style={{ "text-decoration": "none" }}>
                        <ChevronRight size={16} />
                      </A>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      {/* Create Dialog */}
      <Show when={showCreate()}>
        <div class="overlay" onClick={() => setShowCreate(false)} />
        <div class="dialog">
          <div class="dialog-header" style={{ display: "flex", "align-items": "flex-start", "justify-content": "space-between", gap: "var(--space-3)" }}>
            <h2 class="dialog-title">Create agent</h2>
            <button class="btn btn-ghost btn-sm btn-icon" type="button" onClick={() => setShowCreate(false)} aria-label="Close dialog">
              <X size={14} />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <div class="form-field" style={{ "margin-bottom": "var(--space-3)" }}>
              <label class="form-label">Agent ID</label>
              <input
                class="input"
                autofocus
                placeholder="support_bot"
                value={newId()}
                onInput={(e) => {
                  setNewId(e.currentTarget.value);
                  setCreateErr(undefined);
                }}
              />
              <Show when={createIssue() || createErr()}>
                <span class="form-error">{createIssue() ?? createErr()}</span>
              </Show>
            </div>
            <div class="dialog-footer">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => {
                  setNewId(suggestAgentId(existingIds()));
                  setCreateErr(undefined);
                }}
              >
                Suggest ID
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn btn-primary btn-sm"
                disabled={createMut.isLoading || trimmedNewId().length === 0 || createIssue() != null}
              >
                <Plus size={14} />
                {createMut.isLoading ? "Creating..." : "Create and open"}
              </button>
            </div>
          </form>
        </div>
      </Show>

      {/* Delete Dialog */}
      <Show when={deleteId() !== null}>
        <div class="overlay" onClick={() => setDeleteId(null)} />
        <div class="dialog">
          <div class="dialog-header" style={{ display: "flex", "align-items": "flex-start", "justify-content": "space-between", gap: "var(--space-3)" }}>
            <div>
              <h2 class="dialog-title">Delete {deleteId()}?</h2>
              <p class="dialog-description">
                This removes the agent configuration and workspace files.
              </p>
            </div>
            <button class="btn btn-ghost btn-sm btn-icon" type="button" onClick={() => setDeleteId(null)} aria-label="Close dialog">
              <X size={14} />
            </button>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary btn-sm" onClick={() => setDeleteId(null)}>Cancel</button>
            <button
              class="btn btn-destructive btn-sm"
              disabled={deleteMut.isLoading}
              onClick={() => {
                const id = deleteId();
                if (id) deleteMut.mutate(id);
              }}
            >
              {deleteMut.isLoading ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Show>

      {/* Clone Dialog */}
      <Show when={cloneSrc() !== null}>
        <div class="overlay" onClick={() => setCloneSrc(null)} />
        <div class="dialog">
          <div class="dialog-header" style={{ display: "flex", "align-items": "flex-start", "justify-content": "space-between", gap: "var(--space-3)" }}>
            <h2 class="dialog-title">Clone {cloneSrc()}</h2>
            <button class="btn btn-ghost btn-sm btn-icon" type="button" onClick={() => setCloneSrc(null)} aria-label="Close dialog">
              <X size={14} />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleClone();
            }}
          >
            <div class="form-field" style={{ "margin-bottom": "var(--space-3)" }}>
              <label class="form-label">New agent ID</label>
              <input
                class="input"
                autofocus
                placeholder="new-agent-id"
                value={cloneNewId()}
                onInput={(e) => {
                  setCloneNewId(e.currentTarget.value);
                  setCloneErr(undefined);
                }}
              />
              <Show when={cloneIssue() || cloneErr()}>
                <span class="form-error">{cloneIssue() ?? cloneErr()}</span>
              </Show>
            </div>
            <div class="dialog-footer">
              <button type="button" class="btn btn-secondary btn-sm" onClick={() => setCloneSrc(null)}>Cancel</button>
              <button
                type="submit"
                class="btn btn-primary btn-sm"
                disabled={cloneMut.isLoading || trimmedCloneId().length === 0 || cloneIssue() != null}
              >
                {cloneMut.isLoading ? "Cloning..." : "Clone and open"}
              </button>
            </div>
          </form>
        </div>
      </Show>
    </PageShell>
  );
}
