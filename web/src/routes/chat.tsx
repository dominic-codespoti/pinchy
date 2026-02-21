import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type SessionMessage,
  type SlashCommand,
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
} from "lucide-react";
import { useUiStore } from "@/state/ui";

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
    return raw.map((r: any) => {
      const toolCalls = Array.isArray(r.tool_calls) ? r.tool_calls.map((tc: any) => ({
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
        tools: toolCalls.map((tc: any) => ({
          tool: tc.name,
          success: tc.success,
          durationMs: tc.duration ?? null,
        })),
        toolCalls,
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

            pendingFinalizeRef.current = () => {
              if (content) {
                const role = "assistant";
                const ts = Date.now();
                seenKeysRef.current.add(messageKey(role, content, ts));
                seenKeysRef.current.add(messageBaseKey(role, content));
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
        if (type === "turn_receipt") {
          const tokens = payload.tokens?.total_tokens ?? 0;
          const tools = payload.tool_calls?.length ?? 0;
          const duration = payload.duration_ms ? `${(payload.duration_ms / 1000).toFixed(1)}s` : "-";
          setReceipts((prev) => [
            ...prev.slice(-39),
            {
              timestamp: Date.now(),
              tokens: { prompt: payload.tokens?.prompt_tokens ?? 0, completion: payload.tokens?.completion_tokens ?? 0, total: payload.tokens?.total_tokens ?? 0 },
              durationMs: payload.duration_ms ?? null,
              modelCalls: payload.model_calls ?? null,
              tools: (payload.tool_calls ?? []).map((c) => ({ tool: c.tool ?? "tool", success: c.success ?? true, durationMs: c.duration_ms ?? null })),
              toolCalls: (payload.tool_calls ?? []).map((c) => ({
                name: c.tool ?? "unknown",
                args: c.args_summary ?? "",
                success: c.success ?? true,
                duration: c.duration_ms ?? 0,
                error: c.error,
              })),
            },
          ]);
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
    wsRef.current.send(JSON.stringify({ type: "client_command", command: content, target_agent: selectedAgent }));
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
              {allMessages.length} msgs · {recentReceiptTokens.toLocaleString()} tok
            </span>
          )}
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0" onClick={toggleSearch} title="Search messages (⌘F)">
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0" onClick={exportSession} title="Export session" disabled={!allMessages.length}>
            <Download className="h-3.5 w-3.5" />
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

            {filteredMessages.map((message, index) => {
              const role = message.role.toLowerCase();
              const isUser = role === "user";
              const isSystem = role === "system";

              return (
                <div key={`${message.role}-${message.timestamp}-${index}`} className="py-5 group">
                  <div className="flex gap-3">
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isUser ? "bg-emerald-400/10" : isSystem ? "bg-amber-400/10" : "bg-white/[0.06]"
                    }`}>
                      {isUser ? <User className="h-3.5 w-3.5 text-emerald-400" />
                        : isSystem ? <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                        : <Bot className="h-3.5 w-3.5 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-200">
                          {isUser ? "You" : isSystem ? "System" : "Agent"}
                        </span>
                        <span className="text-[10px] tabular-nums text-slate-600">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
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
                        {receipt.tools.length} tools
                        <span className="text-slate-600"> · </span>
                        {receipt.durationMs ? `${(receipt.durationMs / 1000).toFixed(1)}s` : "-"}
                      </div>
                      {receipt.tools.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {receipt.tools.slice(0, 5).map((tool, ti) => (
                            <span
                              key={`${tool.tool}-${ti}`}
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] ${
                                tool.success
                                  ? "bg-emerald-400/8 text-emerald-300 border border-emerald-400/15"
                                  : "bg-rose-400/8 text-rose-300 border border-rose-400/15"
                              }`}
                            >
                              {tool.tool}
                            </span>
                          ))}
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

function MarkdownBlock({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

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
  }, [content]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(content) }} />;
}

function renderMarkdownHtml(src: string): string {
  if (!src) return "";
  let html = escapeHtml(src);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const cls = lang ? ` class="lang-${lang}"` : "";
    return `<pre><code${cls}>${code.replace(/\n$/, "")}</code></pre>`;
  });

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");

  html = html.replace(/(^|\n)(- .+(?:\n- .+)*)/g, (_m, pre: string, block: string) => {
    const items = block.split("\n").map((line) => `<li>${line.replace(/^- /, "")}</li>`).join("");
    return `${pre}<ul>${items}</ul>`;
  });

  html = html.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)/g, (_m, pre: string, block: string) => {
    const items = block.split("\n").map((line) => `<li>${line.replace(/^\d+\.\s*/, "")}</li>`).join("");
    return `${pre}<ol>${items}</ol>`;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/^---$/gm, "<hr>");

  const parts = html.split(/(<pre>[\s\S]*?<\/pre>)/);
  html = parts.map((part) => (part.startsWith("<pre>") ? part : part.replace(/\n/g, "<br>"))).join("");

  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
