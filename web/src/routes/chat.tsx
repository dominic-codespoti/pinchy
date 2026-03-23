import {
  Show,
  For,
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  on,
} from "solid-js";
import { Effect } from "effect";
import { useParams, useSearchParams } from "@solidjs/router";
import { createMutation, createQuery } from "@/api/use-api";
import {
  deleteSession,
  fetchAgent,
  fetchSessions,
  fetchCurrentSession,
  fetchSessionMessages,
  qk,
} from "@/api/queries";
import { onGatewayEvent, sendOneShot } from "@/api/gateway";
import { invalidateQueries } from "@/api/use-api";
import type { SessionSummary, SessionMessage } from "@/api/schemas";
import type { WsEvent } from "@/api/ws-schemas";
import { Sparkles, Bot, Trash2, Send } from "@/components/icons";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { toText, formatTimestamp, truncateMiddle, formatRelativeTime } from "@/lib/utils";
import { toast } from "@/components/toast";

// ── Types ────────────────────────────────────────────

interface ToolCall {
  readonly tool: string;
  readonly status: string;
  readonly argsSummary: string;
  readonly resultSummary: string;
  readonly error: string;
  readonly durationMs: number | null;
}

// ── useAgentChat (Solid version) ─────────────────────

function useAgentChat(agentId: () => string) {
  const [streamingContent, setStreamingContent] = createSignal("");
  const [isTyping, setIsTyping] = createSignal(false);
  const [toolCalls, setToolCalls] = createSignal<ToolCall[]>([]);

  const unsubscribe = onGatewayEvent((event: WsEvent) => {
    if ("agent_id" in event && event.agent_id !== agentId()) return;

    switch (event.type) {
      case "agent_chunk":
        if (event.done) {
          setIsTyping(false);
        } else {
          setStreamingContent((prev) => prev + event.content);
        }
        break;

      case "agent_message":
        setStreamingContent("");
        setIsTyping(false);
        setToolCalls([]);
        break;

      case "tool_activity":
        setToolCalls((prev) => [
          ...prev,
          {
            tool: event.tool,
            status: event.status,
            argsSummary: event.args_summary ?? "",
            resultSummary: event.result_summary ?? "",
            error: event.error ?? "",
            durationMs: event.duration_ms ?? null,
          },
        ]);
        break;

      case "typing":
        setIsTyping(event.is_typing);
        break;
    }
  });

  onCleanup(unsubscribe);

  // Reset on agent change
  createEffect(
    on(agentId, () => {
      setStreamingContent("");
      setIsTyping(false);
      setToolCalls([]);
    }),
  );

  function send(message: string) {
    setStreamingContent("");
    setToolCalls([]);
    setIsTyping(true);
    void sendOneShot(message, agentId());
  }

  return { streamingContent, isTyping, toolCalls, send };
}

// ── SessionSidebar ───────────────────────────────────

function ChatSessionSidebar(props: {
  agentId: string;
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onClearSession: () => void;
}) {
  const sessions = createQuery({
    key: qk.sessions(props.agentId),
    fn: () => fetchSessions(props.agentId),
    refetchInterval: 15_000,
  });

  const [deletingId, setDeletingId] = createSignal<string | null>(null);

  const deleteMut = createMutation({
    fn: (sessionId: string) => deleteSession(props.agentId, sessionId),
    onSuccess: (_data, sessionId) => {
      setDeletingId(null);
      invalidateQueries(qk.sessions(props.agentId));
      invalidateQueries(qk.currentSession(props.agentId));
      if (props.currentSessionId === sessionId) props.onClearSession();
      toast.success("Session deleted");
    },
    onError: (msg) => {
      setDeletingId(null);
      toast.error(msg);
    },
  });

  createEffect(() => {
    props.agentId;
    sessions.refetch();
  });

  const sorted = createMemo(() =>
    [...(sessions.data?.sessions ?? [])].sort(
      (a, b) => (b.modified ?? 0) - (a.modified ?? 0),
    ),
  );

  // Group sessions by date
  const grouped = createMemo(() => {
    const now = Date.now();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    const today: SessionSummary[] = [];
    const yesterday: SessionSummary[] = [];
    const older: SessionSummary[] = [];

    for (const s of sorted()) {
      const ts = (s.modified ?? 0) > 1e12 ? (s.modified ?? 0) : (s.modified ?? 0) * 1000;
      if (ts >= todayStart.getTime()) today.push(s);
      else if (ts >= yesterdayStart.getTime()) yesterday.push(s);
      else older.push(s);
    }

    return { today, yesterday, older };
  });

  async function handleNewSession() {
    await sendOneShot("/new", props.agentId);
    invalidateQueries(qk.sessions(props.agentId));
    invalidateQueries(qk.currentSession(props.agentId));
  }

  function handleDeleteSession(sessionId: string) {
    if (!window.confirm("Delete this session?")) return;
    setDeletingId(sessionId);
    deleteMut.mutate(sessionId);
  }

  return (
    <aside class="chat-sidebar">
      <div class="chat-sidebar-header">
        <span class="chat-sidebar-agent">{props.agentId}</span>
        <button
          class="btn btn-sm btn-secondary"
          style={{ width: "100%", "justify-content": "flex-start", gap: "var(--space-2)" }}
          onClick={() => void handleNewSession()}
        >
          + New chat
        </button>
      </div>

      <div class="chat-sidebar-sessions">
        <Show when={sessions.isLoading}>
          <p style={{ padding: "var(--space-3)", "font-size": "var(--text-xs)", color: "var(--muted-foreground)" }}>
            Loading...
          </p>
        </Show>

        <Show when={!sessions.isLoading && sorted().length === 0}>
          <p style={{ padding: "var(--space-3)", "font-size": "var(--text-sm)", color: "var(--muted-foreground)" }}>
            No chats yet.
          </p>
        </Show>

        <Show when={grouped().today.length > 0}>
          <SessionGroup
            label="Today"
            sessions={grouped().today}
            currentId={props.currentSessionId}
            onSelect={props.onSelectSession}
            onDelete={handleDeleteSession}
            deletingId={deletingId()}
          />
        </Show>

        <Show when={grouped().yesterday.length > 0}>
          <SessionGroup
            label="Yesterday"
            sessions={grouped().yesterday}
            currentId={props.currentSessionId}
            onSelect={props.onSelectSession}
            onDelete={handleDeleteSession}
            deletingId={deletingId()}
          />
        </Show>

        <Show when={grouped().older.length > 0}>
          <SessionGroup
            label="Older"
            sessions={grouped().older}
            currentId={props.currentSessionId}
            onSelect={props.onSelectSession}
            onDelete={handleDeleteSession}
            deletingId={deletingId()}
          />
        </Show>
      </div>
    </aside>
  );
}

function SessionGroup(props: {
  label: string;
  sessions: SessionSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  return (
    <div class="chat-sidebar-group">
      <div class="chat-sidebar-group-label">{props.label}</div>
      <For each={props.sessions}>
        {(session) => {
          const title = () => session.title ?? truncateMiddle(session.session_id, 12, 4);
          const isActive = () => session.session_id === props.currentId;
          return (
            <div class={`session-row ${isActive() ? "session-row-active" : ""}`}>
              <button
                type="button"
                class="session-row-main"
                onClick={() => props.onSelect(session.session_id)}
              >
                <span class="session-row-title">{title()}</span>
                <span class="session-row-time">{formatRelativeTime(session.modified)}</span>
              </button>
              <button
                type="button"
                class="session-row-delete"
                disabled={props.deletingId === session.session_id}
                aria-label="Delete session"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDelete(session.session_id);
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        }}
      </For>
    </div>
  );
}

// ── MessageRow ───────────────────────────────────────

function MessageRow(props: { message: SessionMessage }) {
  const role = () => props.message.role;
  const content = createMemo(() => toText(props.message.content));

  const roleLabel = () => {
    if (role() === "user") return "You";
    if (role() === "system") return "System";
    return "Agent";
  };

  const avatarClass = () => {
    if (role() === "user") return "message-avatar message-avatar-user";
    if (role() === "system") return "message-avatar message-avatar-system";
    return "message-avatar message-avatar-assistant";
  };

  const roleClass = () => {
    if (role() === "user") return "message-role message-role-user";
    if (role() === "system") return "message-role message-role-system";
    return "message-role message-role-assistant";
  };

  return (
    <Show when={content().trim().length > 0}>
      <div class="message-row">
        <div class={avatarClass()}>{roleLabel().charAt(0)}</div>
        <div class="message-content">
          <div class="message-meta">
            <span class={roleClass()}>{roleLabel()}</span>
            <Show when={props.message.timestamp != null}>
              <span class="message-time">{formatTimestamp(props.message.timestamp!)}</span>
            </Show>
          </div>
          <Show
            when={role() !== "user" && role() !== "system"}
            fallback={
              <p class={`message-text ${role() === "system" ? "message-text-system" : ""}`}>
                {content()}
              </p>
            }
          >
            <MarkdownRenderer content={content()} class="message-text" />
          </Show>
        </div>
      </div>
    </Show>
  );
}

// ── ToolActivityBlock ────────────────────────────────

function ToolActivityBlock(props: {
  toolCalls: ReadonlyArray<ToolCall>;
}) {
  return (
    <Show when={props.toolCalls.length > 0}>
      <div class="tool-activity">
        <div class="tool-activity-header">
          <span>Tool Activity</span>
          <span>{props.toolCalls.length}</span>
        </div>
        <div style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
          <For each={props.toolCalls}>
            {(call) => (
              <div class={`tool-call-row ${call.status === "error" ? "tool-call-row-error" : ""}`}>
                <Show when={call.status === "success"}>
                  <span class="status-dot status-dot-success" />
                </Show>
                <Show when={call.status === "error"}>
                  <span class="status-dot status-dot-error" />
                </Show>
                <Show when={call.status !== "success" && call.status !== "error"}>
                  <span class="spinner spinner-sm" />
                </Show>
                <span class="tool-call-name badge badge-outline">{call.tool}</span>
                <Show when={call.argsSummary.length > 0}>
                  <span class="tool-call-args">{call.argsSummary}</span>
                </Show>
                <Show when={call.resultSummary.length > 0}>
                  <span class="tool-call-result">{call.resultSummary}</span>
                </Show>
                <Show when={call.durationMs !== null}>
                  <span class="tool-call-duration">
                    {call.durationMs! >= 1000
                      ? `${(call.durationMs! / 1000).toFixed(1)}s`
                      : `${call.durationMs}ms`}
                  </span>
                </Show>
                <Show when={call.error.length > 0}>
                  <span class="tool-call-error">{call.error}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

// ── Chat (default export) ────────────────────────────

export default function Chat() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const agentId = () => params.agentId || "default";
  const sessionIdFromSearch = () =>
    typeof searchParams.session === "string" ? searchParams.session : "";

  const agent = createQuery({
    key: qk.agent(agentId()),
    fn: () => fetchAgent(agentId()),
  });

  const currentSession = createQuery({
    key: qk.currentSession(agentId()),
    fn: () => fetchCurrentSession(agentId()),
  });

  const activeSessionId = createMemo(() =>
    sessionIdFromSearch().length > 0
      ? sessionIdFromSearch()
      : (currentSession.data?.session_id ?? ""),
  );

  const messagesQuery = createQuery({
    key: qk.sessionMessages(agentId(), activeSessionId()),
    fn: () => activeSessionId().length > 0
      ? fetchSessionMessages(agentId(), activeSessionId())
      : Effect.succeed({ file: "", messages: [] }),
  });

  const { streamingContent, isTyping, toolCalls, send } = useAgentChat(agentId);

  createEffect(() => {
    agentId();
    agent.refetch();
    currentSession.refetch();
  });

  createEffect(() => {
    agentId();
    activeSessionId();
    messagesQuery.refetch();
  });

  // Auto-scroll
  let bottomRef!: HTMLDivElement;
  let messagesContainer!: HTMLDivElement;
  const [userScrolledUp, setUserScrolledUp] = createSignal(false);

  function handleScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    setUserScrolledUp(scrollHeight - scrollTop - clientHeight > 100);
  }

  createEffect(() => {
    // Track reactive deps for auto-scroll
    const _msgs = messagesQuery.data?.messages?.length;
    const _stream = streamingContent();
    const _typing = isTyping();
    if (!userScrolledUp() && bottomRef) {
      bottomRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  // Input state
  const [draft, setDraft] = createSignal("");
  let textareaRef!: HTMLTextAreaElement;

  function handleSend() {
    const trimmed = draft().trim();
    if (trimmed.length === 0 || isTyping()) return;
    send(trimmed);
    setDraft("");
    textareaRef?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSelectSession(sessionId: string) {
    setSearchParams({ session: sessionId });
  }

  function handleSessionCleared() {
    setSearchParams({ session: undefined });
  }

  createEffect(() => {
    if (messagesQuery.isError && activeSessionId().length > 0) {
      handleSessionCleared();
      invalidateQueries(qk.sessions(agentId()));
      invalidateQueries(qk.currentSession(agentId()));
    }
  });

  const agentLabel = () => agent.data?.id ?? agentId();
  const modelLabel = () => agent.data?.model ?? null;
  const messageList = () => messagesQuery.data?.messages ?? [];
  const isPageLoading = () => agent.isLoading || (activeSessionId().length > 0 && messagesQuery.isLoading);

  return (
    <div class="chat-layout">
      <ChatSessionSidebar
        agentId={agentId()}
        currentSessionId={activeSessionId().length > 0 ? activeSessionId() : null}
        onSelectSession={handleSelectSession}
        onClearSession={handleSessionCleared}
      />

      <div class="chat-main">
        {/* Header */}
        <header class="chat-header">
          <span class="chat-header-icon">
            <Sparkles size={12} />
          </span>
          <div class="chat-header-info">
            <div class="chat-header-agent">{agentLabel()}</div>
            <Show when={modelLabel()}>
              <div class="chat-header-model">{modelLabel()}</div>
            </Show>
          </div>
          <Show when={activeSessionId().length > 0}>
            <span class="chat-header-session">{activeSessionId().slice(0, 24)}</span>
          </Show>
        </header>

        {/* Messages */}
        <div
          class="chat-messages"
          ref={messagesContainer!}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
        >
          <Show
            when={!isPageLoading()}
            fallback={
              <div style={{ padding: "var(--space-6)", display: "flex", "flex-direction": "column", gap: "var(--space-4)" }}>
                <div class="skeleton" style={{ height: "48px", width: "75%" }} />
                <div class="skeleton" style={{ height: "32px", width: "50%" }} />
                <div class="skeleton" style={{ height: "64px", width: "85%" }} />
              </div>
            }
          >
            <Show
              when={messageList().length > 0 || streamingContent().length > 0 || isTyping()}
              fallback={
                <div class="chat-empty">
                  <div class="chat-empty-icon">
                    <Sparkles size={24} />
                  </div>
                  <h2 class="chat-empty-title">Chat with {agentLabel()}</h2>
                  <p class="chat-empty-description">Send a message to start a conversation.</p>
                </div>
              }
            >
              <div class="chat-messages-inner">
                <For each={messageList()}>
                  {(msg) => <MessageRow message={msg} />}
                </For>

                <Show when={streamingContent().length > 0}>
                  <div class="message-row">
                    <div class="message-avatar message-avatar-assistant" style={{ animation: "status-pulse 2s ease-in-out infinite" }}>
                      A
                    </div>
                    <div class="message-content">
                      <div class="message-meta">
                        <span class="message-role message-role-assistant">Agent</span>
                        <span class="message-streaming-label">streaming...</span>
                      </div>
                      <MarkdownRenderer content={streamingContent()} class="message-text" />
                    </div>
                  </div>
                </Show>

                <Show when={isTyping() && streamingContent().length === 0}>
                  <div class="message-row">
                    <div class="message-avatar message-avatar-assistant">
                      <Bot size={12} />
                    </div>
                    <div class="message-content">
                      <div class="typing-indicator">
                        <span class="typing-dot" />
                        <span class="typing-dot" />
                        <span class="typing-dot" />
                        <span class="typing-label">Thinking...</span>
                      </div>
                    </div>
                  </div>
                </Show>

                <Show when={toolCalls().length > 0}>
                  <div style={{ padding: "var(--space-2) 0" }}>
                    <ToolActivityBlock toolCalls={toolCalls()} />
                  </div>
                </Show>

                <div ref={bottomRef!} style={{ height: "var(--space-4)" }} />
              </div>
            </Show>
          </Show>
        </div>

        {/* Input */}
        <div class="chat-input-area">
          <div class="chat-input-inner">
            <div class="chat-input-box">
              <textarea
                ref={textareaRef!}
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the agent to do something..."
                disabled={isTyping()}
                rows={1}
                class="chat-textarea"
              />
              <button
                class="btn btn-sm btn-secondary btn-icon"
                onClick={handleSend}
                disabled={isTyping() || draft().trim().length === 0}
                aria-label="Send message"
              >
                <Send size={14} />
              </button>
            </div>
            <p class="chat-input-hint">
              <kbd>Enter</kbd> send / <kbd>Shift+Enter</kbd> newline
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
