import { createSignal, createMemo, Show, For } from "solid-js";
import { A } from "@solidjs/router";
import {
  Layers, ChevronRight, Trash2, RefreshCw, HardDrive, MessageSquare, Clock, Cpu, Code, Sparkles,
} from "@/components/icons";
import { PageShell, PageTitle } from "@/components/layout";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { createQuery, createMutation, invalidateQueries } from "@/api/use-api";
import {
  qk, fetchAgents, fetchSessions, fetchSessionMessages, fetchSessionReceipts, deleteSession,
} from "@/api/queries";
import type { SessionSummary, SessionMessage, RawReceipt, ModelCallDetail } from "@/api/schemas";
import {
  humanBytes, estimateMessages, formatRelativeTime, formatTimestamp, formatDateTime, toText,
} from "@/lib/utils";
import { toast } from "@/components/toast";

type TimelineItem =
  | { kind: "message"; id: string; time: number; index: number; message: SessionMessage }
  | { kind: "receipt"; id: string; time: number; index: number; receipt: RawReceipt };

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function MetricChip(props: { label: string; value: string }) {
  return (
    <span class="session-chip">
      <span class="session-chip-label">{props.label}</span>
      <span>{props.value}</span>
    </span>
  );
}

function JsonPanel(props: { title: string; value: unknown }) {
  return (
    <div class="session-panel-block">
      <div class="session-panel-title">
        <Code size={12} />
        <span>{props.title}</span>
      </div>
      <pre class="session-json">{toPrettyJson(props.value)}</pre>
    </div>
  );
}

function NestedPanel(props: {
  title: string;
  summary?: string;
  children: unknown;
  defaultOpen?: boolean;
}) {
  return (
    <details class="session-subpanel" open={props.defaultOpen}>
      <summary class="session-subpanel-summary">
        <span>{props.title}</span>
        <Show when={props.summary}>
          <span class="session-subpanel-meta">{props.summary}</span>
        </Show>
      </summary>
      <div class="session-subpanel-body">{props.children as any}</div>
    </details>
  );
}

function MessageTimelineCard(props: { item: Extract<TimelineItem, { kind: "message" }> }) {
  const msg = () => props.item.message;
  const roleLabel = () =>
    msg().role === "user" ? "User"
    : msg().role === "assistant" ? "Assistant"
    : msg().role === "tool" ? "Tool"
    : "System";
  const roleClass = () =>
    msg().role === "user" ? "message-role message-role-user"
    : msg().role === "assistant" ? "message-role message-role-assistant"
    : msg().role === "tool" ? "message-role" : "message-role message-role-system";
  const avatarClass = () =>
    msg().role === "user" ? "message-avatar message-avatar-user"
    : msg().role === "assistant" ? "message-avatar message-avatar-assistant"
    : msg().role === "tool" ? "message-avatar" : "message-avatar message-avatar-system";
  const content = () => toText(msg().content);
  const toolCalls = () => msg().tool_calls ?? [];
  const hasMeta = () => msg().metadata != null;
  const hasImages = () => (msg().images?.length ?? 0) > 0;

  return (
    <details class="session-node session-node-message">
      <summary class="session-node-summary">
        <div class="session-node-leading">
          <div class={avatarClass()}>{roleLabel().charAt(0)}</div>
          <div class="session-node-heading">
            <div class="session-node-titleline">
              <span class={roleClass()}>{roleLabel()}</span>
              <span class="session-node-time">{msg().timestamp != null ? formatDateTime(msg().timestamp!) : "No timestamp"}</span>
            </div>
            <div class="session-node-preview">{content() || (toolCalls().length > 0 ? "Assistant tool call envelope" : "Empty message")}</div>
          </div>
        </div>

        <div class="session-node-chips">
          <Show when={toolCalls().length > 0}>
            <MetricChip label="tool calls" value={String(toolCalls().length)} />
          </Show>
          <Show when={msg().tool_call_id != null}>
            <MetricChip label="tool id" value={msg().tool_call_id ?? "-"} />
          </Show>
          <Show when={hasMeta()}>
            <MetricChip label="meta" value="yes" />
          </Show>
          <Show when={hasImages()}>
            <MetricChip label="images" value={String(msg().images?.length ?? 0)} />
          </Show>
        </div>
      </summary>

      <div class="session-node-body">
        <Show
          when={msg().role === "assistant"}
          fallback={
            <pre class={`session-node-text ${msg().role === "tool" ? "session-node-text-code" : ""}`}>{content()}</pre>
          }
        >
          <div class="session-node-markdown markdown-body">
            <MarkdownRenderer content={content()} />
          </div>
        </Show>

        <Show when={toolCalls().length > 0}>
          <NestedPanel title="Tool calls" summary={`${toolCalls().length} item${toolCalls().length === 1 ? "" : "s"}`}>
            <For each={toolCalls()}>
              {(toolCall, index) => (
                <NestedPanel title={`Tool call ${index() + 1}`} summary={typeof toolCall === "object" && toolCall !== null && "function" in (toolCall as Record<string, unknown>) ? String(((toolCall as Record<string, unknown>).function as Record<string, unknown> | undefined)?.name ?? "function") : undefined}>
                  <JsonPanel title="Call payload" value={toolCall} />
                </NestedPanel>
              )}
            </For>
          </NestedPanel>
        </Show>
        <Show when={hasMeta()}>
          <NestedPanel title="Metadata">
            <JsonPanel title="Message metadata" value={msg().metadata} />
          </NestedPanel>
        </Show>
        <NestedPanel title="Raw exchange">
          <JsonPanel title="Exchange JSON" value={msg()} />
        </NestedPanel>
      </div>
    </details>
  );
}

function ModelCallCard(props: { detail: ModelCallDetail }) {
  return (
    <div class="session-call-card">
      <div class="session-call-title">{props.detail.model}</div>
      <div class="session-call-grid">
        <MetricChip label="latency" value={formatDuration(props.detail.latency_ms)} />
        <MetricChip label="prompt" value={String(props.detail.prompt_tokens)} />
        <MetricChip label="completion" value={String(props.detail.completion_tokens)} />
        <Show when={props.detail.cached_tokens > 0}>
          <MetricChip label="cached" value={String(props.detail.cached_tokens)} />
        </Show>
        <Show when={props.detail.reasoning_tokens > 0}>
          <MetricChip label="reasoning" value={String(props.detail.reasoning_tokens)} />
        </Show>
        <Show when={props.detail.cost_usd != null}>
          <MetricChip label="cost" value={formatUsd(props.detail.cost_usd)} />
        </Show>
      </div>
    </div>
  );
}

function ReceiptTimelineCard(props: { item: Extract<TimelineItem, { kind: "receipt" }> }) {
  const receipt = () => props.item.receipt;
  const toolCalls = () => receipt().tool_calls ?? [];
  const callDetails = () => receipt().call_details ?? [];
  const totalTokens = () =>
    receipt().tokens?.total_tokens
    ?? receipt().total_tokens
    ?? ((receipt().tokens?.prompt_tokens ?? 0) + (receipt().tokens?.completion_tokens ?? 0));

  return (
    <details class="session-node session-node-receipt">
      <summary class="session-node-summary">
        <div class="session-node-leading">
          <div class="session-node-icon">
            <Cpu size={14} />
          </div>
          <div class="session-node-heading">
            <div class="session-node-titleline">
              <span class="message-role message-role-assistant">Turn receipt</span>
              <span class="session-node-time">
                {receipt().started_at != null ? formatDateTime(receipt().started_at!) : "No timestamp"}
              </span>
            </div>
            <div class="session-node-preview">{receipt().reply_summary ?? receipt().user_prompt ?? "Receipt"}</div>
          </div>
        </div>

        <div class="session-node-chips">
          <Show when={(receipt().model_id ?? "").length > 0}>
            <MetricChip label="model" value={receipt().model_id ?? ""} />
          </Show>
          <MetricChip label="duration" value={formatDuration(receipt().duration_ms)} />
          <MetricChip label="tokens" value={String(totalTokens())} />
          <MetricChip label="tools" value={String(toolCalls().length)} />
          <Show when={receipt().estimated_cost_usd != null}>
            <MetricChip label="cost" value={formatUsd(receipt().estimated_cost_usd)} />
          </Show>
        </div>
      </summary>

      <div class="session-node-body">
        <div class="session-receipt-grid">
          <div class="session-panel-block">
            <div class="session-panel-title">
              <MessageSquare size={12} />
              <span>User prompt</span>
            </div>
            <div class="session-panel-text">{receipt().user_prompt ?? "-"}</div>
          </div>

          <div class="session-panel-block">
            <div class="session-panel-title">
              <Sparkles size={12} />
              <span>Reply summary</span>
            </div>
            <div class="session-panel-text">{receipt().reply_summary ?? "-"}</div>
          </div>
        </div>

        <div class="session-call-grid">
          <MetricChip label="model calls" value={String(receipt().model_calls ?? 0)} />
          <MetricChip label="prompt" value={String(receipt().tokens?.prompt_tokens ?? receipt().prompt_tokens ?? 0)} />
          <MetricChip label="completion" value={String(receipt().tokens?.completion_tokens ?? receipt().completion_tokens ?? 0)} />
          <Show when={(receipt().tokens?.cached_tokens ?? 0) > 0}>
            <MetricChip label="cached" value={String(receipt().tokens?.cached_tokens ?? 0)} />
          </Show>
          <Show when={(receipt().tokens?.reasoning_tokens ?? 0) > 0}>
            <MetricChip label="reasoning" value={String(receipt().tokens?.reasoning_tokens ?? 0)} />
          </Show>
        </div>

        <Show when={toolCalls().length > 0}>
          <NestedPanel title="Tool calls" summary={`${toolCalls().length} recorded`}>
            <div class="session-tool-list">
              <For each={toolCalls()}>
                {(call, index) => (
                  <NestedPanel
                    title={`${index() + 1}. ${call.tool ?? "tool"}`}
                    summary={`${call.success === false ? "failed" : "ok"} · ${formatDuration(call.duration_ms)}`}
                  >
                    <div class="session-tool-row">
                      <div class="session-tool-main">
                        <span class="session-tool-name">{call.tool ?? "tool"}</span>
                        <span class={`session-chip ${call.success === false ? "session-chip-danger" : ""}`}>
                          {call.success === false ? "failed" : "ok"}
                        </span>
                        <span class="session-tool-duration">{formatDuration(call.duration_ms)}</span>
                      </div>
                      <Show when={call.args_summary}>
                        <div class="session-tool-args">{call.args_summary}</div>
                      </Show>
                      <Show when={call.error}>
                        <div class="session-tool-error">{call.error}</div>
                      </Show>
                      <JsonPanel title="Tool call JSON" value={call} />
                    </div>
                  </NestedPanel>
                )}
              </For>
            </div>
          </NestedPanel>
        </Show>

        <Show when={callDetails().length > 0}>
          <NestedPanel title="Model call details" summary={`${callDetails().length} call${callDetails().length === 1 ? "" : "s"}`}>
            <div class="session-model-calls">
              <For each={callDetails()}>
                {(detail, index) => (
                  <NestedPanel title={`${index() + 1}. ${detail.model}`} summary={`${formatDuration(detail.latency_ms)} · ${detail.prompt_tokens + detail.completion_tokens} tokens`}>
                    <ModelCallCard detail={detail} />
                    <JsonPanel title="Call detail JSON" value={detail} />
                  </NestedPanel>
                )}
              </For>
            </div>
          </NestedPanel>
        </Show>

        <div class="session-note">
          Provider request/response payloads are not currently persisted; this view shows all stored receipt metadata and raw JSON.
        </div>
        <NestedPanel title="Raw receipt">
          <JsonPanel title="Receipt JSON" value={receipt()} />
        </NestedPanel>
      </div>
    </details>
  );
}

function SessionPreview(props: { agentId: string; sessionId: string }) {
  const messagesQ = createQuery({
    key: qk.sessionMessages(props.agentId, props.sessionId),
    fn: () => fetchSessionMessages(props.agentId, props.sessionId),
  });

  const receiptsQ = createQuery({
    key: qk.receiptsSession(props.agentId, props.sessionId),
    fn: () => fetchSessionReceipts(props.agentId, props.sessionId),
  });

  const messages = createMemo<readonly SessionMessage[]>(() => messagesQ.data?.messages ?? []);
  const receipts = createMemo<readonly RawReceipt[]>(() =>
    [...(receiptsQ.data?.receipts ?? [])].sort((a, b) => (a.started_at ?? 0) - (b.started_at ?? 0))
  );
  const totalToolCalls = createMemo(() =>
    receipts().reduce((sum, receipt) => sum + (receipt.tool_calls?.length ?? 0), 0)
  );

  const timeline = createMemo<readonly TimelineItem[]>(() => {
    const messageItems: TimelineItem[] = messages().map((message, index) => ({
      kind: "message",
      id: `message-${index}`,
      time: message.timestamp ?? index,
      index,
      message,
    }));
    const receiptItems: TimelineItem[] = receipts().map((receipt, index) => ({
      kind: "receipt",
      id: `receipt-${index}`,
      time: receipt.started_at ?? (messages().length + index),
      index,
      receipt,
    }));

    return [...messageItems, ...receiptItems].sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      if (a.kind !== b.kind) return a.kind === "message" ? -1 : 1;
      return a.index - b.index;
    });
  });

  return (
    <div class="session-preview">
      <Show when={messagesQ.isLoading || receiptsQ.isLoading}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-2)", padding: "var(--space-2) 0" }}>
          <div class="skeleton" style={{ height: "20px", width: "40%" }} />
          <div class="skeleton" style={{ height: "72px" }} />
          <div class="skeleton" style={{ height: "72px" }} />
        </div>
      </Show>

      <Show when={messagesQ.isError || receiptsQ.isError}>
        <p style={{ "font-size": "var(--text-sm)", color: "var(--destructive)", padding: "var(--space-2) 0" }}>
          Failed to load session history details.
        </p>
      </Show>

      <Show when={!messagesQ.isLoading && !receiptsQ.isLoading && !messagesQ.isError && !receiptsQ.isError && timeline().length === 0}>
        <p style={{ "font-size": "var(--text-xs)", color: "var(--muted-foreground)", opacity: 0.6, padding: "var(--space-2) 0" }}>
          No history in this session.
        </p>
      </Show>

      <Show when={!messagesQ.isLoading && !receiptsQ.isLoading && !messagesQ.isError && !receiptsQ.isError && timeline().length > 0}>
        <div class="session-preview-summary">
          <MetricChip label="messages" value={String(messages().length)} />
          <MetricChip label="turn receipts" value={String(receipts().length)} />
          <MetricChip label="tool calls" value={String(totalToolCalls())} />
        </div>

        <div class="session-note">
          Expand each item to inspect stored metadata, tool calls, token usage, and raw JSON for the session timeline.
        </div>

        <div class="session-preview-messages session-timeline">
          <For each={timeline()}>
            {(item) => (
              <div class="session-timeline-item">
                <div class="session-timeline-rail" />
                <Show when={item.kind === "message"} fallback={<ReceiptTimelineCard item={item as Extract<TimelineItem, { kind: "receipt" }>} />}>
                  <MessageTimelineCard item={item as Extract<TimelineItem, { kind: "message" }>} />
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="session-preview-actions">
          <A
            href={`/chat/${props.agentId}?session=${encodeURIComponent(props.sessionId)}`}
            class="btn btn-secondary btn-sm"
            style={{ "text-decoration": "none" }}
          >
            <MessageSquare size={14} />
            Open in Chat
          </A>
        </div>
      </Show>
    </div>
  );
}

function SessionRow(props: {
  session: SessionSummary;
  agentId: string;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  const deleteMut = createMutation({
    fn: (sessionId: string) => deleteSession(props.agentId, sessionId),
    onSuccess: () => {
      invalidateQueries(qk.sessions(props.agentId));
      setConfirmDelete(false);
      toast.success("Session deleted");
    },
    onError: (msg) => toast.error(msg),
  });

  const title = () => props.session.title ?? props.session.session_id;

  return (
    <>
      <div
        class={`session-list-row ${props.isActive ? "session-list-row-active" : ""}`}
        onClick={() => props.onToggle()}
      >
        <span class={`session-list-chevron ${props.isExpanded ? "session-list-chevron-open" : ""}`}>
          <ChevronRight size={14} />
        </span>

        <span class="session-list-title">{title()}</span>

        <div class="session-list-meta">
          <Show when={props.session.size != null}>
            <span class="session-list-stat">
              <HardDrive size={12} />
              {humanBytes(props.session.size!)}
            </span>
            <span class="session-list-stat">
              <MessageSquare size={12} />
              ~{estimateMessages(props.session.size!)}
            </span>
          </Show>

          <span class="session-list-time">
            {formatRelativeTime(props.session.modified)}
          </span>

          <Show when={!confirmDelete()}>
            <button
              class="session-list-delete"
              title="Delete session"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={14} />
            </button>
          </Show>

          <Show when={confirmDelete()}>
            <div class="session-delete-confirm" onClick={(e) => e.stopPropagation()}>
              <button
                class="btn btn-ghost btn-sm"
                style={{ color: "var(--destructive)", "font-size": "var(--text-xs)" }}
                disabled={deleteMut.isLoading}
                onClick={() => deleteMut.mutate(props.session.session_id)}
              >
                {deleteMut.isLoading ? "..." : "Confirm"}
              </button>
              <button
                class="btn btn-ghost btn-sm"
                style={{ color: "var(--muted-foreground)", "font-size": "var(--text-xs)" }}
                disabled={deleteMut.isLoading}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          </Show>
        </div>
      </div>

      <Show when={props.isExpanded}>
        <SessionPreview agentId={props.agentId} sessionId={props.session.session_id} />
      </Show>
    </>
  );
}

export default function Sessions() {
  const [selectedAgent, setSelectedAgent] = createSignal("default");
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const agentsQ = createQuery({
    key: qk.agents,
    fn: fetchAgents,
  });

  const agentIds = createMemo(() =>
    (agentsQ.data?.agents ?? []).map((a) => a.id),
  );

  const activeAgent = createMemo(() => {
    const ids = agentIds();
    const sel = selectedAgent();
    return ids.includes(sel) ? sel : ids[0] ?? "default";
  });

  const sessionsQ = createQuery({
    key: qk.sessions(activeAgent()),
    fn: () => fetchSessions(activeAgent()),
  });

  const sessions = createMemo<readonly SessionSummary[]>(() =>
    (sessionsQ.data?.sessions ?? [])
      .filter((s) => !s.file.endsWith(".receipts.jsonl"))
      .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0)),
  );

  return (
    <PageShell
      maxWidth="5xl"
      header={
        <PageTitle icon={<Layers size={14} />} title="Sessions">
          <div class="separator-vertical" style={{ height: "20px" }} />
          <select
            class="select"
            style={{ width: "144px" }}
            value={activeAgent()}
            onChange={(e) => setSelectedAgent(e.currentTarget.value)}
          >
            <For each={agentIds().length > 0 ? agentIds() : ["default"]}>
              {(id) => <option value={id}>{id}</option>}
            </For>
          </select>
          <button
            class="btn btn-ghost btn-icon btn-sm"
            title="Refresh"
            onClick={() => sessionsQ.refetch()}
          >
            <RefreshCw size={14} class={sessionsQ.isLoading ? "icon-spin" : ""} />
          </button>
          <span style={{ "font-size": "10px", color: "var(--muted-foreground)", "font-variant-numeric": "tabular-nums" }}>
            {sessions().length} sessions
          </span>
        </PageTitle>
      }
    >
      <div class="route-enter sessions-stack">
        <Show when={sessionsQ.isLoading}>
          <div class="card" style={{ padding: "var(--space-4)" }}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
              <div class="skeleton" style={{ height: "48px" }} />
              <div class="skeleton" style={{ height: "48px" }} />
              <div class="skeleton" style={{ height: "48px" }} />
            </div>
          </div>
        </Show>

        <Show when={sessionsQ.isError}>
          <p style={{ "font-size": "var(--text-sm)", color: "var(--destructive)", "margin-top": "var(--space-4)" }}>
            Failed to load sessions.
          </p>
        </Show>

        <Show when={!sessionsQ.isLoading && !sessionsQ.isError && sessions().length === 0}>
          <div class="empty-state">
            <Layers size={24} />
            <p>No sessions found</p>
            <span style={{ "font-size": "var(--text-xs)", color: "var(--muted-foreground)" }}>
              Sessions appear here as agents interact.
            </span>
          </div>
        </Show>

        <Show when={!sessionsQ.isLoading && sessions().length > 0}>
          <div class="card" style={{ padding: 0, overflow: "hidden" }}>
            <For each={sessions()}>
              {(session) => (
                <SessionRow
                  session={session}
                  agentId={activeAgent()}
                  isExpanded={expandedId() === session.session_id}
                  isActive={false}
                  onToggle={() =>
                    setExpandedId(
                      expandedId() === session.session_id ? null : session.session_id,
                    )}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </PageShell>
  );
}
