import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Download, Pause, Play, Radio } from "lucide-react";

import { Badge, Button, Input, Select, SelectItem, Separator } from "@/components/ui";

type LogEntry = {
  ts?: string;
  level?: string;
  target?: string;
  message?: string;
};
const MAX_LINES = 2000;

const LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"] as const;
const LEVEL_ORDER: Record<string, number> = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

export function LogsRoute() {
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("INFO");
  const [textFilter, setTextFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const pendingRef = useRef<LogEntry[]>([]);
  const pausedRef = useRef(false);
  const textFilterRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      const isTypingContext =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTypingContext) return;
      event.preventDefault();
      textFilterRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let mounted = true;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws/logs`);

      ws.onmessage = (event) => {
        let parsed: LogEntry;
        try {
          parsed = JSON.parse(event.data as string) as LogEntry;
        } catch {
          return;
        }

        if (pausedRef.current) {
          pendingRef.current = [...pendingRef.current.slice(-(MAX_LINES - 1)), parsed];
          return;
        }

        setEntries((prev) => [...prev.slice(-(MAX_LINES - 1)), parsed]);
      };

      ws.onclose = () => {
        if (!mounted) return;
        retryTimer = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      mounted = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    if (!pendingRef.current.length) return;
    setEntries((prev) => [...prev.slice(-(MAX_LINES - 1)), ...pendingRef.current.slice(-MAX_LINES)]);
    pendingRef.current = [];
  }, [paused]);

  const filtered = useMemo(() => {
    const minLevel = LEVEL_ORDER[level] ?? 2;
    const text = textFilter.toLowerCase();
    const target = targetFilter.toLowerCase();

    return entries.filter((entry) => {
      const entryLevel = (entry.level ?? "INFO").toUpperCase();
      if ((LEVEL_ORDER[entryLevel] ?? 2) < minLevel) return false;

      const messageText = `${entry.message ?? ""} ${entry.target ?? ""}`.toLowerCase();
      if (text && !messageText.includes(text)) return false;
      if (target && !(entry.target ?? "").toLowerCase().includes(target)) return false;

      return true;
    });
  }, [entries, level, textFilter, targetFilter]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [filtered.length]);

  const levelCounts = useMemo(() => {
    const counts: Record<(typeof LEVELS)[number], number> = {
      TRACE: 0,
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };

    for (const entry of filtered) {
      const key = (entry.level ?? "INFO").toUpperCase() as (typeof LEVELS)[number];
      if (counts[key] !== undefined) counts[key] += 1;
    }

    return counts;
  }, [filtered]);

  const scrollToBottom = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    shouldAutoScrollRef.current = true;
    setShowScrollBtn(false);
  };

  const exportLogs = () => {
    if (!filtered.length) return;
    const text = filtered
      .map((e) => `${e.ts ?? ""} [${(e.level ?? "INFO").toUpperCase()}] ${e.target ?? ""}: ${e.message ?? ""}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pinchy-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Radio className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Live Logs</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <Select
          value={level}
          onValueChange={(val) => setLevel(val as (typeof LEVELS)[number])}
          className="h-7 w-[100px] rounded-lg text-xs border-white/[0.06]"
        >
          {LEVELS.map((value) => (
            <SelectItem key={value} value={value}>{value}</SelectItem>
          ))}
        </Select>

        <Input
          ref={textFilterRef}
          placeholder="Filter  (/)"
          value={textFilter}
          onChange={(event) => setTextFilter(event.target.value)}
          className="!h-7 w-[140px] !rounded-lg !text-xs !border-white/[0.06]"
        />
        <Input
          placeholder="Target"
          value={targetFilter}
          onChange={(event) => setTargetFilter(event.target.value)}
          className="!h-7 w-[120px] !rounded-lg !text-xs !border-white/[0.06] hidden md:block"
        />

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5">
            {LEVELS.map((key) => (
              <span key={key} className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${levelPillClass(key)}`}>
                {key} {levelCounts[key]}
              </span>
            ))}
          </div>

          <span className="text-[10px] tabular-nums text-slate-500">{filtered.length} lines</span>
          {paused && pendingRef.current.length > 0 && (
            <Badge variant="warning" className="!text-[9px] !px-1.5 !py-0.5">{pendingRef.current.length} queued</Badge>
          )}

          <button
            type="button"
            onClick={() => setPaused((prev) => !prev)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition-all duration-200 ${
              paused
                ? "border-amber-400/20 text-amber-300 hover:bg-amber-400/10"
                : "border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/[0.12]"
            }`}
          >
            {paused ? <><Play className="h-3 w-3" /> Resume</> : <><Pause className="h-3 w-3" /> Pause</>}
          </button>
          <button
            type="button"
            onClick={exportLogs}
            title="Export logs"
            className="text-slate-600 hover:text-slate-300 transition-colors"
          >
            <Download className="h-3 w-3" />
          </button>

          <span className={`inline-block h-2 w-2 rounded-full ${paused ? "bg-amber-400" : "bg-emerald-400 animate-status-pulse"}`} />
        </div>
      </div>

      {/* ── Log output ──────────────────────────── */}
      <div className="flex-1 overflow-hidden p-2 relative">
        <ul
          ref={listRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
            shouldAutoScrollRef.current = distanceFromBottom < 80;
            setShowScrollBtn(distanceFromBottom > 200);
          }}
          className="h-full overflow-auto rounded-xl border border-white/[0.06] bg-white/[0.01] p-1 font-mono text-xs"
          role="log"
          aria-live="polite"
          aria-label="Runtime logs"
        >
          {filtered.map((entry, index) => {
            const lvl = (entry.level ?? "INFO").toUpperCase();
            return (
              <li
                key={`${entry.ts ?? ""}-${index}`}
                className={`grid grid-cols-[90px_55px_200px_1fr] gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.03] ${rowClass(lvl)}`}
              >
                <span className="text-slate-600 tabular-nums">{(entry.ts ?? "").slice(11, 23)}</span>
                <span className={`font-semibold ${levelTextClass(lvl)}`}>{lvl}</span>
                <span className="truncate text-slate-600">{entry.target ?? ""}</span>
                <span className="break-all text-slate-300">{entry.message ?? ""}</span>
              </li>
            );
          })}
          {!filtered.length && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Radio className="h-5 w-5 text-slate-700 mb-2" />
              <p className="text-xs text-slate-600">No log lines match</p>
              <p className="text-[10px] text-slate-700 mt-0.5">Adjust level or filters to expand the visible stream.</p>
            </div>
          )}
        </ul>

        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-5 right-5 flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-slate-300 shadow-lg hover:bg-white/[0.08] transition-all duration-200 backdrop-blur-sm"
          >
            <ArrowDown className="h-3 w-3" />
            Jump to bottom
          </button>
        )}
      </div>
    </div>
  );
}

function levelPillClass(level: (typeof LEVELS)[number]) {
  if (level === "ERROR") return "border border-rose-300/40 bg-rose-300/15 text-rose-100";
  if (level === "WARN") return "border border-amber-300/40 bg-amber-300/15 text-amber-100";
  if (level === "INFO") return "border border-cyan-300/40 bg-cyan-300/15 text-cyan-100";
  if (level === "DEBUG") return "border border-indigo-300/40 bg-indigo-300/15 text-indigo-100";
  return "border border-white/20 bg-white/10 text-slate-100";
}

function levelTextClass(level: string) {
  if (level === "ERROR") return "text-rose-200";
  if (level === "WARN") return "text-amber-200";
  if (level === "INFO") return "text-cyan-200";
  if (level === "DEBUG") return "text-indigo-200";
  return "text-slate-200";
}

function rowClass(level: string) {
  if (level === "ERROR") return "bg-rose-300/[0.06]";
  if (level === "WARN") return "bg-amber-300/[0.05]";
  return "";
}
