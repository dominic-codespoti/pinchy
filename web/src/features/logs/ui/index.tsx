/* eslint-disable react-hooks/refs */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowDown, Download, Pause, Play, Radio, SlidersHorizontal, RotateCcw, X } from "lucide-react";

import { Badge, Input, Select, SelectItem, Separator, Button } from "@/shared/ui/components/ui";
import { wsUrl } from "@/shared/lib/useWebSocket";
import { useViewport } from "@/shared/lib/useViewport";
import { useSwipe, usePullToRefresh } from "@/shared/lib/useTouch";
import { BottomSheet } from "@/shared/ui/components/BottomSheet";
import { LogEntry } from "./LogEntry";

type LogEntryType = {
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
  const { isMobile } = useViewport();
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("INFO");
  const [textFilter, setTextFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const [entries, setEntries] = useState<LogEntryType[]>([]);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const pendingRef = useRef<LogEntryType[]>([]);
  const pausedRef = useRef(false);
  const textFilterRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Keyboard shortcut for search
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

  // WebSocket connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let mounted = true;

    const connect = () => {
      ws = new WebSocket(wsUrl("/ws/logs"));

      ws.onmessage = (event) => {
        let parsed: LogEntryType;
        try {
          parsed = JSON.parse(event.data as string) as LogEntryType;
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

  // Flush pending entries when unpaused
  useEffect(() => {
    if (paused) return;
    if (!pendingRef.current.length) return;
    setEntries((prev) => [...prev.slice(-(MAX_LINES - 1)), ...pendingRef.current.slice(-MAX_LINES)]);
    pendingRef.current = [];
  }, [paused]);

  // Filter entries
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

  // Auto-scroll
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [filtered.length]);

  // Level counts
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

  // Swipe gestures for level filtering on mobile
  const handleSwipeLeft = useCallback(() => {
    if (!isMobile) return;
    const currentIndex = LEVELS.indexOf(level);
    if (currentIndex < LEVELS.length - 1) {
      setLevel(LEVELS[currentIndex + 1]);
      setSwipeDirection("left");
      setTimeout(() => setSwipeDirection(null), 300);
    }
  }, [isMobile, level]);

  const handleSwipeRight = useCallback(() => {
    if (!isMobile) return;
    const currentIndex = LEVELS.indexOf(level);
    if (currentIndex > 0) {
      setLevel(LEVELS[currentIndex - 1]);
      setSwipeDirection("right");
      setTimeout(() => setSwipeDirection(null), 300);
    }
  }, [isMobile, level]);

  // Attach swipe handlers on mobile
  useSwipe(swipeRef as React.RefObject<HTMLElement>, {
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 60,
    preventDefault: false,
  });

  // Pull-to-refresh for mobile
  const handleRefresh = useCallback(async () => {
    // Clear entries and reconnect would happen here
    // For now, just clear the filter to show the effect
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  }, []);

  const { pullDistance, isRefreshing } = usePullToRefresh(
    listRef as React.RefObject<HTMLElement>,
    handleRefresh
  );

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

  const clearFilters = () => {
    setTextFilter("");
    setTargetFilter("");
    setLevel("INFO");
  };

  return (
    <div ref={swipeRef} className="flex flex-col h-full bg-[var(--bg)]">
      {/* Mobile Header */}
      {isMobile ? (
        <div className="flex flex-col gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-400/10">
              <Radio className="h-3.5 w-3.5 text-emerald-400" />
            </span>
            <span className="text-sm font-semibold text-slate-100">Live Logs</span>
            <div className="ml-auto flex items-center gap-2">
              {paused && (
                <Badge variant="warning" className="!text-[9px] !px-1.5 !py-0">
                  Paused
                </Badge>
              )}
              <span className="text-[10px] tabular-nums text-slate-500">{filtered.length}</span>
              <button
                type="button"
                onClick={() => setPaused((prev) => !prev)}
                className={`flex items-center justify-center h-7 w-7 rounded-lg border transition-all ${
                  paused
                    ? "border-amber-400/20 text-amber-300 bg-amber-400/10"
                    : "border-white/[0.06] text-slate-400 hover:text-slate-200"
                }`}
              >
                {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* Mobile Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <Input
                ref={textFilterRef}
                placeholder="Search logs (/)"
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
                className="!h-8 !pl-9 !text-xs !rounded-lg"
              />
              {textFilter && (
                <button
                  onClick={() => setTextFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center text-slate-500 hover:text-slate-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFiltersSheet(true)}
              className="flex items-center justify-center h-8 w-8 rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {(targetFilter || level !== "INFO") && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>

          {/* Swipeable Level Pills */}
          <div className="relative">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-3 px-3">
              {LEVELS.map((l) => {
                const isActive = l === level;
                const levelColors: Record<string, string> = {
                  TRACE: isActive ? "bg-slate-400/25 text-slate-200" : "bg-white/[0.04] text-slate-500",
                  DEBUG: isActive ? "bg-indigo-400/25 text-indigo-200" : "bg-white/[0.04] text-slate-500",
                  INFO: isActive ? "bg-cyan-400/25 text-cyan-200" : "bg-white/[0.04] text-slate-500",
                  WARN: isActive ? "bg-amber-400/25 text-amber-200" : "bg-white/[0.04] text-slate-500",
                  ERROR: isActive ? "bg-rose-400/25 text-rose-200" : "bg-white/[0.04] text-slate-500",
                };
                return (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all whitespace-nowrap ${levelColors[l]}`}
                  >
                    {l} {levelCounts[l] > 0 && `(${levelCounts[l]})`}
                  </button>
                );
              })}
            </div>
            {/* Swipe hint */}
            {swipeDirection && (
              <div className={`absolute top-1/2 -translate-y-1/2 ${swipeDirection === "left" ? "left-2" : "right-2"} pointer-events-none`}>
                <div className={`px-2 py-1 rounded bg-emerald-400/20 text-emerald-300 text-[10px] font-medium`}>
                  {swipeDirection === "left" ? "← Less" : "More →"}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Desktop Header */
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
            {/* eslint-disable-next-line react-hooks/refs */}
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
      )}

      {/* Log output */}
      <div className="flex-1 overflow-hidden p-2 relative">
        {/* Pull to refresh indicator (mobile) */}
        {isMobile && (
          <div
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center transition-all duration-200"
            style={{
              transform: `translateY(${Math.min(pullDistance, 100)}px)`,
              opacity: pullDistance > 0 ? 1 : 0,
            }}
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 backdrop-blur-sm border border-white/[0.06]">
              <RotateCcw className={`h-3.5 w-3.5 text-emerald-400 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="text-xs text-slate-300">
                {isRefreshing ? "Refreshing..." : pullDistance > 80 ? "Release to refresh" : "Pull to refresh"}
              </span>
            </div>
          </div>
        )}

        <ul
          ref={listRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
            shouldAutoScrollRef.current = distanceFromBottom < 80;
            setShowScrollBtn(distanceFromBottom > 200);
          }}
          className={`h-full overflow-auto rounded-xl border border-white/[0.06] bg-white/[0.01] ${
            isMobile ? "p-0" : "p-1 font-mono text-xs"
          }`}
          role="log"
          aria-live="polite"
          aria-label="Runtime logs"
        >
          {filtered.map((entry, index) => (
            <LogEntry
              key={`${entry.ts ?? ""}-${index}`}
              ts={entry.ts}
              level={entry.level}
              target={entry.target}
              message={entry.message}
              isMobile={isMobile}
            />
          ))}
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

      {/* Mobile Filter Bottom Sheet */}
      <BottomSheet
        isOpen={showFiltersSheet}
        onClose={() => setShowFiltersSheet(false)}
        title="Filter Logs"
        snapPoints={[40, 70]}
      >
        <div className="space-y-4 p-1">
          {/* Level Filter */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Log Level</label>
            <div className="grid grid-cols-5 gap-1.5">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`px-2 py-2 rounded-lg text-[11px] font-medium transition-all ${
                    l === level
                      ? l === "ERROR"
                        ? "bg-rose-400/20 text-rose-200 ring-1 ring-rose-400/30"
                        : l === "WARN"
                          ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/30"
                          : l === "INFO"
                            ? "bg-cyan-400/20 text-cyan-200 ring-1 ring-cyan-400/30"
                            : l === "DEBUG"
                              ? "bg-indigo-400/20 text-indigo-200 ring-1 ring-indigo-400/30"
                              : "bg-slate-400/20 text-slate-200 ring-1 ring-slate-400/30"
                      : "bg-white/[0.04] text-slate-500 hover:bg-white/[0.08]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600">
              Showing {levelCounts[level]} {level} entries
            </p>
          </div>

          {/* Text Filter */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Message Contains</label>
            <div className="relative">
              <Input
                placeholder="Filter messages..."
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
                className="!h-10"
              />
              {textFilter && (
                <button
                  onClick={() => setTextFilter("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Target Filter */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Target Filter</label>
            <div className="relative">
              <Input
                placeholder="e.g., pinchy::agent"
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                className="!h-10"
              />
              {targetFilter && (
                <button
                  onClick={() => setTargetFilter("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Total entries</span>
              <span className="text-slate-300 font-medium">{filtered.length.toLocaleString()}</span>
            </div>
          </div>

          {/* Clear Filters */}
          <Button
            variant="ghost"
            onClick={clearFilters}
            className="w-full h-10 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Clear all filters
          </Button>
        </div>
      </BottomSheet>
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
