import React, { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Marked } from "marked";
import hljs from "highlight.js/lib/common";

import {
  type SessionMessage,
  type SlashCommand,
  type RawReceipt,
  getCurrentSession,
  getReceipts,
  getSession,
  listAgents,
  listSessions,
  listSlashCommands,
  queryKeys,
} from "@/api/client";
import { Badge, Button, Select, SelectItem, Separator, TextArea } from "@/components/ui";
import {
  Send,
  Plus,
  Activity,
  Bot,
  User,
  AlertCircle,
  Sparkles,
  Zap,
  Clock,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Terminal,
  MessageSquare,
  Wrench,
  Search,
  Download,
  WifiOff,
  ChevronRight,
  X,
  Layers,
  EyeOff,
  Minimize2,
} from "lucide-react";
import { useUiStore } from "@/state/ui";

const markedParser = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, text }) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    code({ text, lang }) {
      let highlighted: string;
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang }).value;
      } else {
        highlighted = hljs.highlightAuto(text).value;
      }
      return `<pre><code class="hljs${lang ? ` language-${lang}` : ""}">${highlighted}</code></pre>`;
    },
  },
});

type LiveMessage = {
  role: string;
  content: string;
  timestamp: number;
};

type ActivityKind = "tool" | "receipt" | "info" | "error";

type ActivityItem = {
  text: string;
  timestamp: number;
  kind: ActivityKind;
};

type ReceiptItem = {
  timestamp: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  durationMs: number | null;
  modelCalls: number | null;
  tools: Array<{
    tool: string;
    success: boolean;
    durationMs: number | null;
  }>;
  toolCalls?: Array<{
    name: string;
    args: string;
    success: boolean;
    duration: number;
    error?: string;
  }>;
  userPrompt?: string;
  replySummary?: string;
};

type GatewayEvent = {
  type?: string;
  agents?: string[];
  agent?: string;
  agent_id?: string;
  session?: string | null;
  session_id?: string | null;
  role?: string;
  content?: unknown;
  message?: unknown;
  response?: unknown;
  error?: unknown;
  delta?: string;
  done?: boolean;
  tool?: string;
  timestamp?: number;
  tokens?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  duration_ms?: number;
  model_calls?: number;
  tool_calls?: Array<{ tool?: string; success?: boolean; duration_ms?: number; args_summary?: string; error?: string }>;
  summary?: string;
  messages_compacted?: number;
  messages_kept?: number;
  started_at?: number;
  user_prompt?: string;
  reply_summary?: string;
};

export function ChatRoute() {
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState("default");
  const [selectedSession, setSelectedSession] = useState("");
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [typingLabel, setTypingLabel] = useState("Thinking…");
  const [showActivity, setShowActivity] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("pinchy-show-activity") === "1";
  });
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [otherSession, setOtherSession] = useState<{ id: string; detail: string } | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedReceipt, setExpandedReceipt] = useState<number | null>(null);
  const [collapsedOutOfContext, setCollapsedOutOfContext] = useState(true);
  const [expandedInlineReceipt, setExpandedInlineReceipt] = useState<number | null>(null);
  const [compactSummaries, setCompactSummaries] = useState<Array<{ summary: string; messagesCompacted: number; messagesKept: number; timestamp: number }>>([]);
  const [wsConnected, setWsConnectedLocal] = useState(true);
  const setWsConnectedGlobal = useUiStore((s) => s.setWsConnected);

  const wsReconnectRef = useRef<number | null>(null);
  const wsReconnectAttempts = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedAgentRef = useRef(selectedAgent);
  const selectedSessionRef = useRef(selectedSession);
  const seenKeysRef = useRef<Set<string>>(new Set());
  const streamBufferRef = useRef("");
  const otherSessionTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const userPickedSessionRef = useRef(false);

  // Streaming reveal state: we accumulate the full text in streamBufferRef,
  // but reveal it character-by-character via a rAF loop for smooth animation.
  const revealedLenRef = useRef(0);
  const [displayedStream, setDisplayedStream] = useState("");
  const revealRafRef = useRef<number | null>(null);
  const isStreamingRef = useRef(false);

  // Pending finalization callback: once reveal loop catches up, this runs.
  const pendingFinalizeRef = useRef<(() => void) | null>(null);

  // ── Auto-scroll helpers ──────────────────────────
  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isNearBottom()) return;
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "instant" as ScrollBehavior });
      } else if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    });
  }, []);

  // ── Character reveal loop ──────────────────────────
  useEffect(() => {
    const CHARS_PER_FRAME = 3; // reveal speed: ~180 chars/sec at 60fps

    const tick = () => {
      const full = streamBufferRef.current;
      if (revealedLenRef.current < full.length) {
        revealedLenRef.current = Math.min(revealedLenRef.current + CHARS_PER_FRAME, full.length);
        setDisplayedStream(full.slice(0, revealedLenRef.current));
        scrollToBottom(true);
        revealRafRef.current = requestAnimationFrame(tick);
      } else if (!isStreamingRef.current && full.length > 0) {
        // Stream ended AND reveal is complete — finalize
        revealRafRef.current = null;
        if (pendingFinalizeRef.current) {
          pendingFinalizeRef.current();
          pendingFinalizeRef.current = null;
        }
      } else if (isStreamingRef.current) {
        revealRafRef.current = requestAnimationFrame(tick);
      } else {
        revealRafRef.current = null;
      }
    };

    if (isStreamingRef.current || (streamBufferRef.current.length > 0 && revealedLenRef.current < streamBufferRef.current.length)) {
      if (!revealRafRef.current) {
        revealRafRef.current = requestAnimationFrame(tick);
      }
    }

    return () => {
      if (revealRafRef.current) {
        cancelAnimationFrame(revealRafRef.current);
        revealRafRef.current = null;
      }
    };
  }, [streamBuffer, scrollToBottom]);

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });

  const agentIds = useMemo(
    () => (agentsQuery.data?.agents ?? []).map((agent) => agent.id),
    [agentsQuery.data],
  );

  const slashQuery = useQuery({
    queryKey: queryKeys.slashCommands,
    queryFn: listSlashCommands,
    staleTime: 60_000,
  });

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);

  const filteredSlash = useMemo(() => {
    if (!slashOpen || !slashQuery.data) return [];
    const prefix = draft.startsWith("/") ? draft.slice(1).split(/\s/)[0].toLowerCase() : "";
    return slashQuery.data.filter((cmd) => cmd.name.toLowerCase().startsWith(prefix));
  }, [slashOpen, slashQuery.data, draft]);

  useEffect(() => {
    if (draft.startsWith("/") && !draft.includes("\n")) {
      const afterSlash = draft.slice(1);
      const hasSpace = afterSlash.includes(" ");
      const firstWord = afterSlash.split(/\s/)[0];
      const exactMatch = slashQuery.data?.some((c) => c.name === firstWord);
      if (exactMatch && (hasSpace || afterSlash === firstWord)) {
        setSlashOpen(false);
      } else {
        setSlashOpen(true);
        setSlashIdx(0);
      }
    } else {
      setSlashOpen(false);
    }
  }, [draft, slashQuery.data]);

  useEffect(() => { selectedAgentRef.current = selectedAgent; }, [selectedAgent]);
  useEffect(() => { selectedSessionRef.current = selectedSession; }, [selectedSession]);
  useEffect(() => { window.sessionStorage.setItem("pinchy-show-activity", showActivity ? "1" : "0"); }, [showActivity]);

  useEffect(() => {
    if (!agentIds.length) return;
    if (agentIds.includes(selectedAgent)) return;
    setSelectedAgent(agentIds[0]);
    userPickedSessionRef.current = false;
  }, [agentIds, selectedAgent]);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions(selectedAgent),
    queryFn: () => listSessions(selectedAgent),
    enabled: Boolean(selectedAgent),
  });

  const currentSessionQuery = useQuery({
    queryKey: queryKeys.currentSession(selectedAgent),
    queryFn: () => getCurrentSession(selectedAgent),
    enabled: Boolean(selectedAgent),
  });

  const sessions = useMemo(
    () =>
      (sessionsQuery.data?.sessions ?? [])
        .filter((session) => !session.file.endsWith(".receipts.jsonl"))
        .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0)),
    [sessionsQuery.data],
  );

  useEffect(() => {
    if (!sessions.length) { setSelectedSession(""); return; }
    // If the user manually picked a session and it still exists, don't override
    if (userPickedSessionRef.current && selectedSession && sessions.some((s) => s.session_id === selectedSession)) {
      return;
    }
    const currentSession = currentSessionQuery.data?.session_id;
    if (currentSession && sessions.some((s) => s.session_id === currentSession)) {
      setSelectedSession(currentSession);
      return;
    }
    if (!selectedSession || !sessions.some((s) => s.session_id === selectedSession)) {
      setSelectedSession(sessions[0].session_id);
    }
  }, [currentSessionQuery.data?.session_id, selectedSession, sessions]);

  const sessionQuery = useQuery({
    queryKey: queryKeys.sessionMessages(selectedAgent, selectedSession),
    queryFn: () => getSession(selectedAgent, selectedSession),
    enabled: Boolean(selectedAgent && selectedSession),
  });

  const receiptsQuery = useQuery({
    queryKey: ["receipts", selectedAgent, selectedSession],
    queryFn: () => getReceipts(selectedAgent, selectedSession!),
    enabled: Boolean(selectedAgent && selectedSession),
  });

  const persistedReceipts = useMemo<ReceiptItem[]>(() => {
    const raw = receiptsQuery.data?.receipts ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.map((r) => {
      const toolCalls = Array.isArray(r.tool_calls) ? r.tool_calls.map((tc) => ({
        name: tc.tool ?? "unknown",
        args: tc.args_summary ?? "",
        success: tc.success ?? true,
        duration: tc.duration_ms ?? 0,
        error: tc.error,
      })) : [];
      return {
        timestamp: typeof r.started_at === "number" ? (r.started_at > 1e12 ? r.started_at : r.started_at * 1000) : Date.now(),
        tokens: {
          prompt: r.tokens?.prompt_tokens ?? r.prompt_tokens ?? 0,
          completion: r.tokens?.completion_tokens ?? r.completion_tokens ?? 0,
          total: r.tokens?.total_tokens ?? r.total_tokens ?? 0,
        },
        durationMs: r.duration_ms ?? null,
        modelCalls: r.model_calls ?? null,
        tools: toolCalls.map((tc) => ({
          tool: tc.name,
          success: tc.success,
          durationMs: tc.duration ?? null,
        })),
        toolCalls,
        userPrompt: r.user_prompt ?? undefined,
        replySummary: r.reply_summary ?? undefined,
      };
    });
  }, [receiptsQuery.data]);

  const allReceipts = useMemo(() => {
    if (!persistedReceipts.length) return receipts;
    const persistedTs = new Set(persistedReceipts.map((r) => r.timestamp));
    const dedupedLive = receipts.filter((r) => !persistedTs.has(r.timestamp));
    return [...persistedReceipts, ...dedupedLive];
  }, [persistedReceipts, receipts]);

  const recentReceiptTokens = useMemo(
    () => allReceipts.slice(-6).reduce((sum, r) => sum + r.tokens.total, 0),
    [allReceipts],
  );

  const allMessages = useMemo<LiveMessage[]>(() => {
    const persisted = (sessionQuery.data?.messages ?? [])
      .filter((m) => m.role && m.content !== undefined && m.content !== null && m.content !== "")
      .map(normalizeMessage);
    if (!persisted.length) return liveMessages;
    if (!liveMessages.length) return persisted;
    const persistedKeys = new Set(persisted.map((m) => messageKey(m.role, m.content, m.timestamp)));
    const persistedBaseKeys = new Set(persisted.map((m) => messageBaseKey(m.role, m.content)));
    const dedupedLive = liveMessages.filter((m) => {
      if (persistedKeys.has(messageKey(m.role, m.content, m.timestamp))) return false;
      if (persistedBaseKeys.has(messageBaseKey(m.role, m.content))) return false;
      return true;
    });
    return [...persisted, ...dedupedLive];
  }, [sessionQuery.data, liveMessages]);

  // ── Auto-scroll triggers ──────────────────────────
  useEffect(() => { scrollToBottom(true); }, [allMessages.length, scrollToBottom]);
  useEffect(() => { if (typing) scrollToBottom(true); }, [typing, scrollToBottom]);
  useEffect(() => {
    const t = setTimeout(() => scrollToBottom(true), 80);
    return () => clearTimeout(t);
  }, [selectedAgent, selectedSession, sessionQuery.data, scrollToBottom]);

  useEffect(() => {
    setLiveMessages([]);
    setActivityItems([]);
    setReceipts([]);
    setCompactSummaries([]);
    seenKeysRef.current.clear();
    streamBufferRef.current = "";
    revealedLenRef.current = 0;
    isStreamingRef.current = false;
    pendingFinalizeRef.current = null;
    setStreamBuffer("");
    setDisplayedStream("");
    setTyping(false);
    setTypingLabel("Thinking…");
    setOtherSession(null);
    setExpandedInlineReceipt(null);
  }, [selectedAgent, selectedSession]);

  // ── WebSocket ──────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let ws: WebSocket | null = null;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        setWsConnectedLocal(true);
        setWsConnectedGlobal(true);
        wsReconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        let payload: GatewayEvent;
        try { payload = JSON.parse(event.data as string) as GatewayEvent; } catch { return; }

        const type = payload.type;
        if (!type) return;

        if (type === "agent_list" && Array.isArray(payload.agents)) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
          return;
        }

        const agent = payload.agent ?? payload.agent_id ?? "";
        if (agent !== selectedAgentRef.current) return;

        const eventSession = payload.session ?? payload.session_id ?? null;
        const currentSession = selectedSessionRef.current;
        if (eventSession && currentSession && eventSession !== currentSession) {
          let detail = "working...";
          if (type === "tool_start") detail = `running ${payload.tool ?? "tool"}`;
          else if (type === "stream_delta") detail = "responding...";
          else if (type === "typing_start") detail = "thinking...";
          else if (type === "turn_receipt") detail = "completed turn";
          setOtherSession({ id: eventSession, detail });
          if (otherSessionTimerRef.current) window.clearTimeout(otherSessionTimerRef.current);
          if (type === "turn_receipt" || type === "typing_stop" || (type === "stream_delta" && payload.done)) {
            otherSessionTimerRef.current = window.setTimeout(() => setOtherSession(null), 6000);
          }
          return;
        }

        if (type === "session_created") {
          void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(selectedAgentRef.current) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.currentSession(selectedAgentRef.current) });
          appendActivity(setActivityItems, "Session rotated", "info");
          return;
        }
        if (type === "typing_start") { setTyping(true); setTypingLabel("Thinking…"); return; }
        if (type === "typing_stop") { setTyping(false); setTypingLabel("Thinking…"); return; }
        if (type === "tool_start") {
          setTyping(true);
          setTypingLabel(`Running ${payload.tool ?? "tool"}…`);
          appendActivity(setActivityItems, `Tool start: ${payload.tool ?? "tool"}`, "tool");
          return;
        }
        if (type === "tool_end") {
          setTyping(true);
          setTypingLabel("Thinking…");
          appendActivity(setActivityItems, `Tool done: ${payload.tool ?? "tool"}`, "tool");
          return;
        }
        if (type === "tool_error") {
          setTyping(true);
          setTypingLabel("Tool error…");
          appendActivity(setActivityItems, `Tool error: ${payload.tool ?? "tool"} (${toText(payload.error || payload.message)})`, "error");
          return;
        }
        if (type === "stream_delta") {
          if (payload.delta) {
            streamBufferRef.current += payload.delta;
            isStreamingRef.current = true;
            setStreamBuffer(streamBufferRef.current); // trigger reveal loop re-check
          }
          if (payload.done) {
            isStreamingRef.current = false;
            const content = streamBufferRef.current.trim();

            // Register seen keys immediately so a subsequent session_message
            // for the same content is deduplicated even before the reveal
            // animation finishes.
            if (content) {
              const role = "assistant";
              seenKeysRef.current.add(messageBaseKey(role, content));
            }

            pendingFinalizeRef.current = () => {
              if (content) {
                const role = "assistant";
                const ts = Date.now();
                seenKeysRef.current.add(messageKey(role, content, ts));
                setLiveMessages((prev) => [...prev, { role, content, timestamp: ts }]);
              }
              streamBufferRef.current = "";
              revealedLenRef.current = 0;
              setStreamBuffer("");
              setDisplayedStream("");
              setTyping(false);
            };

            if (!streamBufferRef.current) {
              pendingFinalizeRef.current();
              pendingFinalizeRef.current = null;
            } else {
              setStreamBuffer(streamBufferRef.current);
            }
          }
          return;
        }
        if (type === "session_message") {
          const role = payload.role ?? "assistant";
          const content = toText(payload.content ?? payload.message ?? payload.response);
          const key = messageKey(role, content, payload.timestamp);
          const baseKey = messageBaseKey(role, content);
          if (seenKeysRef.current.has(key) || seenKeysRef.current.has(baseKey)) return;
          seenKeysRef.current.add(key);
          seenKeysRef.current.add(baseKey);
          setLiveMessages((prev) => [...prev, { role, content, timestamp: payload.timestamp ?? Date.now() }]);
          return;
        }
        if (type === "turn_receipt") {
          const toolCalls = Array.isArray(payload.tool_calls)
            ? payload.tool_calls.map((tc) => ({
                name: tc.tool ?? "unknown",
                args: tc.args_summary ?? "",
                success: tc.success ?? true,
                duration: tc.duration_ms ?? 0,
                error: tc.error,
              }))
            : [];
          const startedAt = payload.timestamp ?? payload.started_at;
          setReceipts((prev) => [
            ...prev,
            {
              timestamp:
                typeof startedAt === "number"
                  ? startedAt > 1e12
                    ? startedAt
                    : startedAt * 1000
                  : Date.now(),
              tokens: {
                prompt: payload.tokens?.prompt_tokens ?? 0,
                completion: payload.tokens?.completion_tokens ?? 0,
                total: payload.tokens?.total_tokens ?? 0,
              },
              durationMs: payload.duration_ms ?? null,
              modelCalls: payload.model_calls ?? null,
              tools: toolCalls.map((tc) => ({
                tool: tc.name,
                success: tc.success,
                durationMs: tc.duration ?? null,
              })),
              toolCalls,
              userPrompt: payload.user_prompt ?? undefined,
              replySummary: payload.reply_summary ?? undefined,
            },
          ]);
          appendActivity(setActivityItems, "Turn receipt", "receipt");
          return;
        }
        if (type === "slash_response") {
          setTyping(false);
          setLiveMessages((prev) => [...prev, { role: "system", content: toText(payload.response ?? payload.content), timestamp: Date.now() }]);
          appendActivity(setActivityItems, "Slash command completed", "info");
          return;
        }
        if (type === "slash_error") {
          setTyping(false);
          setLiveMessages((prev) => [...prev, { role: "system", content: `Error: ${toText(payload.error ?? payload.content)}`, timestamp: Date.now() }]);
          appendActivity(setActivityItems, "Slash command failed", "error");
          return;
        }
        if (type === "compact_summary") {
          setCompactSummaries((prev) => [...prev, {
            summary: toText(payload.summary),
            messagesCompacted: payload.messages_compacted ?? 0,
            messagesKept: payload.messages_kept ?? 0,
            timestamp: Date.now(),
          }]);
          appendActivity(setActivityItems, `Compacted ${payload.messages_compacted ?? 0} messages`, "info");
          return;
        }
      };

      ws.onclose = () => {
        if (!mounted) return;
        setWsConnectedLocal(false);
        setWsConnectedGlobal(false);
        wsRef.current = null;
        setTyping(false);
        const delay = Math.min(1000 * 2 ** wsReconnectAttempts.current, 15000);
        wsReconnectAttempts.current += 1;
        wsReconnectRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      mounted = false;
      if (wsReconnectRef.current) window.clearTimeout(wsReconnectRef.current);
      ws?.close();
      wsRef.current = null;
      setTyping(false);
      if (otherSessionTimerRef.current) window.clearTimeout(otherSessionTimerRef.current);
    };
  }, [queryClient]);

  const sendMessage = () => {
    const content = draft.trim();
    if (!content || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "client_command", command: content, target_agent: selectedAgent, session_id: selectedSession || undefined }));
    const key = messageKey("user", content, undefined);
    const baseKey = messageBaseKey("user", content);
    seenKeysRef.current.add(key);
    seenKeysRef.current.add(baseKey);
    setLiveMessages((prev) => [...prev, { role: "user", content, timestamp: Date.now() }]);
    setTyping(true);
    setTypingLabel("Thinking…");
    setDraft("");
  };

  const startNewSession = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "client_command", command: "/new", target_agent: selectedAgent }));
    setLiveMessages((prev) => [...prev, { role: "system", content: "New session started", timestamp: Date.now() }]);
    userPickedSessionRef.current = false;
    setTimeout(() => { void sessionsQuery.refetch(); void currentSessionQuery.refetch(); }, 600);
  };

  const jumpToOtherSession = () => {
    if (!otherSession) return;
    userPickedSessionRef.current = true;
    void sessionsQuery.refetch().then(() => { setSelectedSession(otherSession.id); setOtherSession(null); });
  };

  const copyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const acceptSlashCommand = useCallback((cmd: SlashCommand) => {
    const hasArgs = cmd.usage.includes("<") || cmd.usage.includes("[");
    setDraft(`/${cmd.name}${hasArgs ? " " : ""}`);
    setSlashOpen(false);
    inputRef.current?.focus();
  }, []);

  const exportSession = () => {
    const lines = allMessages.map((m) =>
      `[${new Date(m.timestamp).toLocaleString()}] ${m.role.toUpperCase()}\n${m.content}\n`
    );
    const blob = new Blob([lines.join("\n---\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedAgent}-${selectedSession || "session"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return allMessages;
    const q = searchQuery.toLowerCase();
    return allMessages.filter((m) => m.content.toLowerCase().includes(q));
  }, [allMessages, searchQuery]);

  const contextWindowSize = useMemo(() => {
    const agents = agentsQuery.data?.agents ?? [];
    const current = agents.find((a) => a.id === selectedAgent);
    return current?.history_messages ?? 40;
  }, [agentsQuery.data, selectedAgent]);

  const contextBoundary = useMemo(() => {
    if (filteredMessages.length <= contextWindowSize) return 0;
    return filteredMessages.length - contextWindowSize;
  }, [filteredMessages.length, contextWindowSize]);

  const outOfContextCount = contextBoundary;

  // Map receipt → the assistant message index it belongs to.
  // A receipt's started_at should fall between the previous user message and the
  // assistant reply, so we match each receipt to the next assistant message whose
  // timestamp is >= receipt.started_at.
  const receiptByMsgIndex = useMemo(() => {
    const map = new Map<number, ReceiptItem>();
    if (!allReceipts.length || !filteredMessages.length) return map;

    const assistants: Array<{ idx: number; ts: number }> = [];
    for (let i = 0; i < filteredMessages.length; i++) {
      if (filteredMessages[i].role.toLowerCase() === "assistant") {
        assistants.push({ idx: i, ts: filteredMessages[i].timestamp });
      }
    }
    if (!assistants.length) return map;

    const sortedReceipts = [...allReceipts].sort((a, b) => a.timestamp - b.timestamp);
    const usedAssistants = new Set<number>();

    for (const receipt of sortedReceipts) {
      const receiptEnd = receipt.timestamp + (receipt.durationMs ?? 0);
      let best: { idx: number; ts: number } | null = null;
      let bestDist = Infinity;
      for (const a of assistants) {
        if (usedAssistants.has(a.idx)) continue;
        // Prefer assistant messages that come after (or near) the receipt end
        const dist = Math.abs(a.ts - receiptEnd);
        if (dist < bestDist) {
          bestDist = dist;
          best = a;
        }
      }
      // Match within 5 minutes to handle long turns and timing skew
      if (best && bestDist < 300_000) {
        map.set(best.idx, receipt);
        usedAssistants.add(best.idx);
      }
    }
    return map;
  }, [allReceipts, filteredMessages]);

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 50);
      else setSearchQuery("");
      return !prev;
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashOpen && filteredSlash.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => (i + 1) % filteredSlash.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => (i - 1 + filteredSlash.length) % filteredSlash.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        acceptSlashCommand(filteredSlash[slashIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendMessage(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const compactSession = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "client_command", command: "/compact", target_agent: selectedAgent }));
    setLiveMessages((prev) => [...prev, { role: "system", content: "⏳ Compacting session history…", timestamp: Date.now() }]);
    setTyping(true);
    setTypingLabel("Compacting…");
  };

  const exampleCommands = [
    { icon: <Terminal className="h-4 w-4" />, label: "What's the current status?" },
    { icon: <Wrench className="h-4 w-4" />, label: "/health" },
    { icon: <MessageSquare className="h-4 w-4" />, label: "Summarize recent activity" },
    { icon: <Sparkles className="h-4 w-4" />, label: "Run a heartbeat check" },
  ];

  // ── Render ─────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Command</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <div className="flex items-center gap-1.5 min-w-0">
          <Select
            value={selectedAgent}
            onValueChange={(v) => { userPickedSessionRef.current = false; setSelectedAgent(v); }}
            icon={<Bot className="h-3 w-3" />}
            className="h-7 min-w-[90px] max-w-[180px] rounded-lg text-xs border-white/[0.06]"
          >
            {agentIds.map((id) => (
              <SelectItem key={id} value={id}>{id}</SelectItem>
            ))}
          </Select>
          <Select
            value={selectedSession}
            onValueChange={(v) => { userPickedSessionRef.current = true; setSelectedSession(v); }}
            disabled={!sessions.length}
            icon={<Clock className="h-3 w-3 text-slate-500" />}
            className="h-7 min-w-[120px] max-w-[260px] rounded-lg text-xs border-white/[0.06]"
          >
            {sessions.map((s) => (
              <SelectItem key={s.session_id} value={s.session_id}>
                {sessionLabel(s.session_id, s.modified)}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {!wsConnected && (
            <span className="inline-flex items-center gap-1 mr-2 rounded-md border border-rose-400/25 bg-rose-400/10 px-2 py-0.5 text-[10px] text-rose-300 animate-pulse">
              <WifiOff className="h-3 w-3" /> Reconnecting…
            </span>
          )}
          {allMessages.length > 0 && (
            <span className="hidden md:inline-flex items-center gap-1 mr-2 text-[10px] tabular-nums text-slate-500">
              {allMessages.length} msgs{contextBoundary > 0 && ` (${contextWindowSize} in ctx)`} · {recentReceiptTokens.toLocaleString()} tok
            </span>
          )}
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0" onClick={toggleSearch} title="Search messages (⌘F)">
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0" onClick={exportSession} title="Export session" disabled={!allMessages.length}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0" onClick={compactSession} title="Compact history" disabled={!allMessages.length}>
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0" onClick={startNewSession} title="New session">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0" onClick={() => setShowActivity((p) => !p)} title="Toggle activity">
            {showActivity ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* ── Search bar ───────────────────────────── */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") toggleSearch(); }}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none"
          />
          {searchQuery && (
            <span className="text-[10px] tabular-nums text-slate-500">
              {filteredMessages.length}/{allMessages.length}
            </span>
          )}
          <button onClick={toggleSearch} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Other-session banner ─────────────────── */}
      {otherSession && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-amber-400/15 bg-amber-400/[0.04] text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-amber-400" />
            <span>Active in <strong className="text-amber-100">{otherSession.id.slice(0, 18)}</strong> — {otherSession.detail}</span>
          </div>
          <button onClick={jumpToOtherSession} className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-100 transition-colors">
            Jump <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ── Messages ── fixed-height scrollable ──── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {allMessages.length === 0 && !sessionQuery.isLoading && !typing && !streamBuffer && !displayedStream ? (
          <div className="h-full flex flex-col items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
              <div className="h-14 w-14 rounded-2xl bg-emerald-400/10 flex items-center justify-center mx-auto mb-5">
                <Sparkles className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-100 mb-1.5">Pinchy Command</h2>
              <p className="text-sm text-slate-400 mb-8">
                Send commands to your agents, run slash commands, and monitor execution in real time.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {exampleCommands.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setDraft(q.label)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs rounded-xl border border-white/[0.06] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200"
                  >
                    <span className="text-emerald-400/60">{q.icon}</span>
                    <span>{q.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4">
            {sessionQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-12">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
                <span className="text-sm text-slate-500">Loading session…</span>
              </div>
            )}

            {/* ── Compact summary cards ──────── */}
            {compactSummaries.map((cs, i) => (
              <CompactSummaryCard key={`compact-${cs.timestamp}-${i}`} summary={cs} />
            ))}

            {/* ── Out-of-context collapse banner ──────── */}
            {contextBoundary > 0 && (
              <div className="py-3">
                <button
                  onClick={() => setCollapsedOutOfContext((p) => !p)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-400/15 bg-purple-400/[0.04] text-xs text-purple-300 hover:bg-purple-400/[0.08] transition-colors"
                >
                  <EyeOff className="h-3.5 w-3.5 text-purple-400/60" />
                  <span>
                    {collapsedOutOfContext
                      ? `${outOfContextCount} older messages outside context window${compactSummaries.length > 0 ? " (summarised above)" : ""} — click to show`
                      : `Showing ${outOfContextCount} out-of-context messages — click to hide`}
                  </span>
                  {collapsedOutOfContext ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronUp className="h-3 w-3 ml-auto" />}
                </button>
              </div>
            )}

            {filteredMessages.map((message, index) => {
              const role = message.role.toLowerCase();
              const isUser = role === "user";
              const isSystem = role === "system";
              const isOutOfContext = contextBoundary > 0 && index < contextBoundary;
              const isCompactedHistory = isSystem && message.content.includes("<compacted_history>");
              const isContextDivider = contextBoundary > 0 && index === contextBoundary;

              if (isOutOfContext && collapsedOutOfContext && !isCompactedHistory) return null;

              return (
                <React.Fragment key={`${message.role}-${message.timestamp}-${index}`}>
                  {isCompactedHistory && (
                    <CompactedHistoryCard content={message.content} />
                  )}
                  {isContextDivider && (
                    <div className="flex items-center gap-3 py-3 select-none">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
                      <div className="flex items-center gap-1.5 text-[10px] text-purple-300/70 font-medium uppercase tracking-wider">
                        <Layers className="h-3 w-3" />
                        Context window
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
                    </div>
                  )}
                  {!isCompactedHistory && (
                    <div className={`py-5 group ${isOutOfContext ? "opacity-40 hover:opacity-70 transition-opacity" : ""}`}>
                      <div className="flex gap-3">
                        <div className="relative">
                          <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            isUser ? "bg-emerald-400/10" : isSystem ? "bg-amber-400/10" : "bg-white/[0.06]"
                          }`}>
                            {isUser ? <User className="h-3.5 w-3.5 text-emerald-400" />
                              : isSystem ? <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                              : <Bot className="h-3.5 w-3.5 text-slate-400" />}
                          </div>
                          {isOutOfContext && (
                            <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-purple-500/20 flex items-center justify-center">
                              <EyeOff className="h-2 w-2 text-purple-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-slate-200">
                              {isUser ? "You" : isSystem ? "System" : "Agent"}
                            </span>
                            <span className="text-[10px] tabular-nums text-slate-600">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isOutOfContext && (
                              <span className="text-[9px] text-purple-400/60 font-medium">out of context</span>
                            )}
                            {!isUser && (
                              <button
                                onClick={() => copyMessage(message.content, index)}
                                className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-300"
                              >
                                {copiedIdx === index
                                  ? <Check className="h-3 w-3 text-emerald-400" />
                                  : <Copy className="h-3 w-3" />}
                              </button>
                            )}
                          </div>
                          {isUser ? (
                            <div className="text-sm text-slate-200 whitespace-pre-wrap break-words overflow-hidden">{message.content}</div>
                          ) : isSystem ? (
                            <div className="text-sm text-amber-200/80 whitespace-pre-wrap break-words overflow-hidden">{message.content}</div>
                          ) : (
                            <div className="markdown-body text-sm text-slate-300 leading-relaxed overflow-hidden">
                              <MarkdownBlock content={message.content} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Inline receipt for this assistant message */}
                  {!isUser && !isSystem && !isCompactedHistory && receiptByMsgIndex.has(index) && (() => {
                    return <InlineReceipt receipt={receiptByMsgIndex.get(index)!} index={index} expanded={expandedInlineReceipt === index} onToggle={() => setExpandedInlineReceipt(expandedInlineReceipt === index ? null : index)} />;
                  })()}
                </React.Fragment>
              );
            })}

            {/* Streaming */}
            {displayedStream && (
              <div className="py-5">
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-lg bg-emerald-400/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-emerald-300">Agent</span>
                      <span className="text-[10px] text-emerald-400/50">streaming…</span>
                    </div>
                    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                      {displayedStream}
                      <span className="inline-block w-1.5 h-4 bg-emerald-400/70 animate-pulse ml-0.5 align-text-bottom" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Typing */}
            {typing && !displayedStream && (
              <div className="py-5">
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-200">Agent</span>
                    </div>
                    <div className="flex items-center gap-1.5 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70 animate-bounce [animation-delay:300ms]" />
                      <span className="text-xs text-slate-500 ml-1.5">{typingLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Activity / Receipts (inline) ──────── */}
            {showActivity && (allReceipts.length > 0 || activityItems.length > 0) && (
              <div className="mt-2 mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-emerald-400/60" />
                    <span className="text-xs font-medium text-slate-300">Activity</span>
                    <span className="text-[10px] tabular-nums text-slate-600 ml-1">
                      {allReceipts.length + activityItems.length} items
                    </span>
                  </div>
                  <button
                    onClick={() => { setActivityItems([]); setReceipts([]); }}
                    className="text-slate-600 hover:text-slate-300 transition-colors"
                    title="Clear"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
                <div className="p-2 space-y-1.5 max-h-[400px] overflow-y-auto">
                  {allReceipts.slice().reverse().map((receipt, idx) => (
                    <div key={`r-${receipt.timestamp}-${idx}`} className="rounded-lg border border-emerald-400/10 bg-emerald-400/[0.03] p-2.5">
                      <div
                        className="flex items-center justify-between gap-1 mb-1 cursor-pointer"
                        onClick={() => setExpandedReceipt(expandedReceipt === idx ? null : idx)}
                      >
                        <div className="flex items-center gap-1">
                          <ChevronRight className={`h-2.5 w-2.5 text-emerald-400 transition-transform ${expandedReceipt === idx ? "rotate-90" : ""}`} />
                          <Zap className="h-2.5 w-2.5 text-emerald-400" />
                          <span className="text-[10px] font-medium text-emerald-300">Receipt</span>
                        </div>
                        <span className="text-[9px] tabular-nums text-slate-600">
                          {new Date(receipt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        <span className="text-emerald-300 font-medium">{receipt.tokens.total}</span> tok
                        <span className="text-slate-600"> · </span>
                        {(() => {
                          const ok = receipt.tools.filter(t => t.success).length;
                          const fail = receipt.tools.length - ok;
                          return fail > 0
                            ? <>{ok} <span className="text-emerald-400">✓</span> · {fail} <span className="text-rose-400">✗</span></>
                            : <>{receipt.tools.length} tools</>;
                        })()}
                        <span className="text-slate-600"> · </span>
                        {receipt.durationMs ? `${(receipt.durationMs / 1000).toFixed(1)}s` : "-"}
                      </div>
                      {receipt.tools.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(() => {
                            // Deduplicate: group by tool name, show best status
                            const grouped = new Map<string, { total: number; ok: number }>();
                            for (const t of receipt.tools) {
                              const g = grouped.get(t.tool) ?? { total: 0, ok: 0 };
                              g.total++;
                              if (t.success) g.ok++;
                              grouped.set(t.tool, g);
                            }
                            const entries = Array.from(grouped.entries());
                            const shown = entries.slice(0, 8);
                            const overflow = entries.length - shown.length;
                            return (
                              <>
                                {shown.map(([name, { total, ok }]) => {
                                  const anyOk = ok > 0;
                                  const retried = total > 1;
                                  return (
                                    <span
                                      key={name}
                                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] ${
                                        anyOk
                                          ? "bg-emerald-400/8 text-emerald-300 border border-emerald-400/15"
                                          : "bg-rose-400/8 text-rose-300 border border-rose-400/15"
                                      }`}
                                    >
                                      {name}
                                      {retried && (
                                        <span className="text-[8px] opacity-60">
                                          {ok}/{total}
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                                {overflow > 0 && (
                                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] text-slate-500">
                                    +{overflow}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {expandedReceipt === idx && receipt.toolCalls && receipt.toolCalls.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-emerald-400/10 pt-2">
                          <span className="text-[9px] uppercase tracking-widest text-slate-500">Tool Call Details</span>
                          {receipt.toolCalls.map((tc, tci) => (
                            <div key={tci} className="rounded-md border border-white/[0.04] bg-black/20 p-2 text-[11px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-200">{tc.name}</span>
                                <div className="flex items-center gap-2">
                                  {tc.duration > 0 && <span className="text-slate-600">{tc.duration}ms</span>}
                                  <span className={tc.success ? "text-emerald-400" : "text-rose-400"}>{tc.success ? "✓" : "✗"}</span>
                                </div>
                              </div>
                              {tc.args && <p className="mt-1 text-slate-500 font-mono text-[10px] break-all">{tc.args}</p>}
                              {tc.error && <p className="mt-1 text-rose-300 text-[10px]">{tc.error}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {activityItems.slice(-40).reverse().map((item) => (
                    <div key={`${item.timestamp}-${item.text}`} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-2.5">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-[9px] uppercase tracking-wide font-medium ${activityColor(item.kind)}`}>
                          {item.kind}
                        </span>
                        <span className="text-[9px] tabular-nums text-slate-700">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* ── Compose ──────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="relative">
            {slashOpen && filteredSlash.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#1a1a2e] shadow-xl z-50">
                {filteredSlash.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); acceptSlashCommand(cmd); }}
                    onMouseEnter={() => setSlashIdx(i)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-3 transition-colors ${
                      i === slashIdx ? "bg-emerald-400/10" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="font-mono text-sm text-emerald-400 shrink-0">/{cmd.name}</span>
                    <span className="text-xs text-slate-400 pt-0.5 leading-snug">{cmd.description}</span>
                  </button>
                ))}
              </div>
            )}
            <TextArea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your agent something…"
              rows={1}
              className="min-h-[44px] max-h-36 py-3 pl-4 pr-12"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!draft.trim()}
              className="absolute right-2 bottom-2 h-8 w-8 rounded-lg bg-emerald-400 text-slate-950 flex items-center justify-center hover:bg-emerald-300 disabled:opacity-30 disabled:hover:bg-emerald-400 transition-all duration-200"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-slate-600">
              <kbd className="font-mono">↵</kbd> send · <kbd className="font-mono">⇧↵</kbd> newline
            </span>
            <span className="text-[10px] tabular-nums text-slate-600">
              {selectedAgent && `${selectedAgent}`}
              {selectedSession && ` · ${selectedSession.slice(0, 12)}…`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────

function normalizeMessage(message: SessionMessage): LiveMessage {
  return {
    role: message.role ?? "assistant",
    content: toText(message.content),
    timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
  };
}

function sessionLabel(sessionId: string, modified?: number): string {
  const shortId = sessionId.length > 20 ? `${sessionId.slice(0, 16)}…` : sessionId;
  if (!modified) return shortId;
  return `${shortId} · ${new Date(modified * 1000).toLocaleDateString()}`;
}

function messageKey(role: string | undefined, content: unknown, timestamp: number | undefined): string {
  return timestamp ? `${messageBaseKey(role, content)}|${timestamp}` : messageBaseKey(role, content);
}

function messageBaseKey(role: string | undefined, content: unknown): string {
  return `${role ?? "assistant"}|${toText(content).slice(0, 200)}`;
}

function appendActivity(setter: Dispatch<SetStateAction<ActivityItem[]>>, text: string, kind: ActivityKind) {
  setter((prev) => [...prev.slice(-199), { text, kind, timestamp: Date.now() }]);
}

function activityColor(kind: ActivityKind) {
  if (kind === "tool") return "text-emerald-400/70";
  if (kind === "receipt") return "text-emerald-400/70";
  if (kind === "error") return "text-rose-400/70";
  return "text-slate-500";
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function InlineReceipt({ receipt: r, index, expanded, onToggle }: { receipt: ReceiptItem; index: number; expanded: boolean; onToggle: () => void }) {
  const okCount = r.tools.filter(t => t.success).length;
  const failCount = r.tools.length - okCount;
  const grouped = new Map<string, { total: number; ok: number }>();
  for (const t of r.tools) {
    const g = grouped.get(t.tool) ?? { total: 0, ok: 0 };
    g.total++;
    if (t.success) g.ok++;
    grouped.set(t.tool, g);
  }

  return (
    <div className="ml-10 -mt-3 mb-2 rounded-lg border border-white/[0.04] bg-white/[0.015] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-[10px] text-slate-500 hover:bg-white/[0.02] transition-colors"
      >
        <ChevronRight className={`h-2.5 w-2.5 text-slate-600 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <Zap className="h-2.5 w-2.5 text-slate-600 shrink-0" />
        <span className="font-medium text-slate-400">Receipt</span>
        <span className="tabular-nums">
          {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <span className="text-slate-600">·</span>
        <span><span className="text-emerald-300">{r.tokens.total.toLocaleString()}</span> tok</span>
        <span className="text-slate-600">·</span>
        {failCount > 0
          ? <span>{okCount} <span className="text-emerald-400">✓</span> · {failCount} <span className="text-rose-400">✗</span></span>
          : <span>{r.tools.length} tools</span>
        }
        <span className="text-slate-600">·</span>
        <span>{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "-"}</span>
      </button>

      {!expanded && r.tools.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {Array.from(grouped.entries()).slice(0, 8).map(([name, { total, ok }]) => (
            <span
              key={name}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] ${
                ok > 0
                  ? "bg-emerald-400/8 text-emerald-300 border border-emerald-400/15"
                  : "bg-rose-400/8 text-rose-300 border border-rose-400/15"
              }`}
            >
              {name}
              {total > 1 && <span className="text-[8px] opacity-60">{ok}/{total}</span>}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="border-t border-white/[0.04]">
          <div className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
            <span className="text-slate-500">Prompt: <span className="text-slate-300 tabular-nums">{r.tokens.prompt.toLocaleString()}</span></span>
            <span className="text-slate-500">Completion: <span className="text-slate-300 tabular-nums">{r.tokens.completion.toLocaleString()}</span></span>
            <span className="text-slate-500">Total: <span className="text-emerald-300 tabular-nums">{r.tokens.total.toLocaleString()}</span></span>
            {r.modelCalls != null && (
              <span className="text-slate-500">Model calls: <span className="text-slate-300 tabular-nums">{r.modelCalls}</span></span>
            )}
            {r.durationMs != null && (
              <span className="text-slate-500">Duration: <span className="text-slate-300 tabular-nums">{(r.durationMs / 1000).toFixed(1)}s</span></span>
            )}
          </div>

          {(r.userPrompt || r.replySummary) && (
            <div className="px-3 pb-2 space-y-1.5">
              {r.userPrompt && (
                <div className="rounded-md border border-white/[0.04] bg-black/20 p-2">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">Input</span>
                  <p className="mt-0.5 text-[11px] text-slate-400 leading-snug break-words">{r.userPrompt}</p>
                </div>
              )}
              {r.replySummary && (
                <div className="rounded-md border border-white/[0.04] bg-black/20 p-2">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">Output</span>
                  <p className="mt-0.5 text-[11px] text-slate-300 leading-snug break-words">{r.replySummary}</p>
                </div>
              )}
            </div>
          )}

          {r.toolCalls && r.toolCalls.length > 0 && (
            <div className="px-3 pb-2 space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-slate-500">Tool Calls</span>
              {r.toolCalls.map((tc, tci) => (
                <div key={tci} className="rounded-md border border-white/[0.04] bg-black/20 p-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-200">{tc.name}</span>
                    <div className="flex items-center gap-2">
                      {tc.duration > 0 && <span className="text-slate-600 tabular-nums">{tc.duration >= 1000 ? `${(tc.duration / 1000).toFixed(1)}s` : `${tc.duration}ms`}</span>}
                      <span className={tc.success ? "text-emerald-400" : "text-rose-400"}>{tc.success ? "✓" : "✗"}</span>
                    </div>
                  </div>
                  {tc.args && <p className="mt-1 text-slate-500 font-mono text-[10px] break-all">{tc.args}</p>}
                  {tc.error && <p className="mt-1 text-rose-300 text-[10px]">{tc.error}</p>}
                </div>
              ))}
            </div>
          )}

          {(!r.toolCalls || r.toolCalls.length === 0) && r.tools.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {Array.from(grouped.entries()).map(([name, { total, ok }]) => (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] ${
                    ok > 0
                      ? "bg-emerald-400/8 text-emerald-300 border border-emerald-400/15"
                      : "bg-rose-400/8 text-rose-300 border border-rose-400/15"
                  }`}
                >
                  {name}
                  {total > 1 && <span className="text-[8px] opacity-60">{ok}/{total}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompactSummaryCard({ summary }: { summary: { summary: string; messagesCompacted: number; messagesKept: number; timestamp: number } }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="py-3">
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] overflow-hidden">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-emerald-400/[0.06] transition-colors"
        >
          <Minimize2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-300">Session Summary</span>
          <span className="text-[10px] text-emerald-400/50 ml-1">
            {summary.messagesCompacted} msgs compacted · {summary.messagesKept} in context
          </span>
          <span className="text-[10px] text-slate-600 ml-auto mr-1">
            {new Date(summary.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {expanded ? <ChevronUp className="h-3 w-3 text-emerald-400/60" /> : <ChevronDown className="h-3 w-3 text-emerald-400/60" />}
        </button>
        {expanded && (
          <div className="px-3 pb-3 border-t border-emerald-400/10">
            <div className="mt-2 text-xs text-slate-300 leading-relaxed markdown-body">
              <MarkdownBlock content={summary.summary} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CompactedHistoryCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const inner = content.replace(/<\/?compacted_history>/g, "").trim();

  return (
    <div className="py-3">
      <div className="rounded-xl border border-purple-400/15 bg-purple-400/[0.04] overflow-hidden">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-400/[0.06] transition-colors"
        >
          <Layers className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-purple-300">Compacted History</span>
          <span className="text-[10px] text-purple-400/50 ml-1">
            {inner.length > 200 ? `${Math.ceil(inner.length / 4)} tokens approx` : "summary"}
          </span>
          <span className="text-[10px] text-slate-600 ml-auto mr-1">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {expanded ? <ChevronUp className="h-3 w-3 text-purple-400/60" /> : <ChevronDown className="h-3 w-3 text-purple-400/60" />}
        </button>
        {expanded && (
          <div className="px-3 pb-3 border-t border-purple-400/10">
            <div className="mt-2 text-xs text-slate-300 leading-relaxed markdown-body">
              <MarkdownBlock content={inner} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderMarkdown(src: string): string {
  return markedParser.parse(src || "") as string;
}

function MarkdownBlock({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(content), [content]);

  useEffect(() => {
    if (!containerRef.current) return;
    const pres = containerRef.current.querySelectorAll("pre");
    pres.forEach((pre) => {
      if (pre.querySelector(".copy-btn")) return;
      pre.style.position = "relative";
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      btn.onclick = () => {
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        navigator.clipboard.writeText(code);
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`;
        btn.style.color = "#34d399";
        setTimeout(() => {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
          btn.style.color = "";
        }, 2000);
      };
      pre.appendChild(btn);
    });
  }, [html]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
