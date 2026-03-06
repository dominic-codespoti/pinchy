import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Hash,
  X,
  Bot,
  ChevronsUpDown,
  Trash2,
} from "lucide-react";

type SessionEntry = {
  file: string;
  session_id: string;
  size?: number;
  modified?: number;
  created_at?: number;
  title?: string | null;
};

type Props = {
  sessions: SessionEntry[];
  selectedSession: string;
  currentBackendSession: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onDelete?: (sessionId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  typing?: boolean;
  agentIds: string[];
  selectedAgent: string;
  onAgentChange: (agentId: string) => void;
};

// ── Date grouping helpers ──────────────────────────

function dateGroup(epochSecs: number | undefined): string {
  if (!epochSecs) return "Older";
  const now = new Date();
  const d = new Date(epochSecs * 1000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  if (d >= today) return "Today";
  if (d >= yesterday) return "Yesterday";
  if (d >= weekAgo) return "This Week";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "Older"];

function shortTitle(s: SessionEntry): string {
  if (s.title) return s.title;
  const id = s.session_id;
  return id.length > 22 ? `${id.slice(0, 18)}…` : id;
}

function timeLabel(epochSecs: number | undefined): string {
  if (!epochSecs) return "";
  return new Date(epochSecs * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sizeLabel(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

// ── Component ──────────────────────────────────────

export function SessionSidebar({
  sessions,
  selectedSession,
  currentBackendSession,
  onSelect,
  onNewSession,
  onDelete,
  collapsed,
  onToggleCollapse,
  typing,
  agentIds,
  selectedAgent,
  onAgentChange,
}: Props) {
  const [filter, setFilter] = useState("");
  const [agentOpen, setAgentOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const agentPickerRef = useRef<HTMLDivElement>(null);

  // Close agent picker on outside click
  useEffect(() => {
    if (!agentOpen) return;
    const handler = (e: MouseEvent) => {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setAgentOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [agentOpen]);

  // ── Filtered + grouped ──────────────────────────
  const filtered = useMemo(() => {
    if (!filter.trim()) return sessions;
    const q = filter.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.title ?? "").toLowerCase().includes(q) ||
        s.session_id.toLowerCase().includes(q),
    );
  }, [sessions, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, SessionEntry[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const s of filtered) {
      const g = dateGroup(s.modified);
      map.get(g)!.push(s);
    }
    // Remove empty groups
    for (const [k, v] of map) {
      if (!v.length) map.delete(k);
    }
    return map;
  }, [filtered]);

  // ── Keyboard nav ────────────────────────────────
  const flatIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of GROUP_ORDER) {
      for (const s of grouped.get(g) ?? []) ids.push(s.session_id);
    }
    return ids;
  }, [grouped]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && agentOpen) {
        e.preventDefault();
        setAgentOpen(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const curIdx = flatIds.indexOf(selectedSession);
        const next =
          e.key === "ArrowDown"
            ? Math.min(curIdx + 1, flatIds.length - 1)
            : Math.max(curIdx - 1, 0);
        if (flatIds[next]) onSelect(flatIds[next]);
      }
      if (e.key === "Enter") {
        // already selected via arrow keys — no-op
      }
    },
    [flatIds, selectedSession, onSelect, agentOpen],
  );

  // ⌘J global shortcut to focus sidebar filter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (collapsed) onToggleCollapse();
        setTimeout(() => filterRef.current?.focus(), 60);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, onToggleCollapse]);

  // ── Collapsed state ─────────────────────────────
  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-10 shrink-0 border-r border-white/[0.06] bg-white/[0.015] py-2 gap-2">
        <button
          onClick={onToggleCollapse}
          className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          title={`${selectedAgent} — Expand sessions (⌘J)`}
        >
          <Bot className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onNewSession}
          className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-emerald-300 hover:bg-emerald-400/10 transition-colors"
          title="New session"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="w-5 h-px bg-white/[0.06] my-1" />
        {/* Mini session dots */}
        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100%-80px)] px-1">
          {sessions.slice(0, 20).map((s) => {
            const isActive = s.session_id === selectedSession;
            const isBackend = s.session_id === currentBackendSession;
            return (
              <button
                key={s.session_id}
                onClick={() => onSelect(s.session_id)}
                title={shortTitle(s)}
                className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-[9px] font-medium transition-all ${
                  isActive
                    ? "bg-emerald-400/15 border border-emerald-400/30 text-emerald-300"
                    : "text-slate-600 hover:text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                {isBackend && !isActive && (
                  <span className="absolute h-1.5 w-1.5 rounded-full bg-emerald-400 top-0 right-0" />
                )}
                <Hash className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Agent picker state ──────────────────────────
  // ── Expanded state ──────────────────────────────
  return (
    <div
      className="flex flex-col w-56 shrink-0 border-r border-white/[0.06] bg-white/[0.015] overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Agent picker header */}
      <div className="px-2.5 pt-2.5 pb-2 border-b border-white/[0.06] shrink-0">
        <div className="relative" ref={agentPickerRef}>
          <button
            onClick={() => setAgentOpen((p) => !p)}
            className="w-full flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-400/10 shrink-0">
              <Bot className="h-3 w-3 text-emerald-400" />
            </span>
            <span className="text-xs font-medium text-slate-200 truncate flex-1 text-left">{selectedAgent}</span>
            <ChevronsUpDown className="h-3 w-3 text-slate-500 shrink-0" />
          </button>
          {agentOpen && agentIds.length > 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/[0.08] bg-[#1a1a2e] shadow-xl z-50 overflow-hidden">
              {agentIds.map((id) => (
                <button
                  key={id}
                  onClick={() => { onAgentChange(id); setAgentOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs text-left transition-colors ${
                    id === selectedAgent
                      ? "bg-emerald-400/10 text-emerald-200"
                      : "text-slate-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <Bot className="h-3 w-3 text-slate-500 shrink-0" />
                  <span className="truncate">{id}</span>
                  {id === selectedAgent && <span className="ml-auto text-emerald-400 text-[10px]">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Session actions row */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-medium flex-1">Sessions</span>
          <button
            onClick={onNewSession}
            className="h-5 w-5 flex items-center justify-center rounded text-slate-500 hover:text-emerald-300 hover:bg-emerald-400/10 transition-colors"
            title="New session"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="h-5 w-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
            title="Collapse sidebar (⌘J)"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="px-2.5 py-2 shrink-0">
        <div className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
          <Search className="h-3 w-3 text-slate-600 shrink-0" />
          <input
            ref={filterRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 outline-none min-w-0"
          />
          {filter && (
            <button onClick={() => setFilter("")} className="text-slate-600 hover:text-slate-300">
              <X className="h-3 w-3" />
            </button>
          )}
          <kbd className="text-[9px] text-slate-600 font-mono">⌘J</kbd>
        </div>
      </div>

      {/* Session list */}
      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-2">
        {Array.from(grouped.entries()).map(([group, items]) => (
          <div key={group} className="mb-1">
            <div className="px-2 pt-2.5 pb-1">
              <span className="text-[9px] uppercase tracking-[0.12em] text-slate-600 font-medium">
                {group}
              </span>
            </div>
            {items.map((s) => {
              const isActive = s.session_id === selectedSession;
              const isBackend = s.session_id === currentBackendSession;
              const isTyping = isBackend && typing;
              const isConfirming = confirmingDelete === s.session_id;
              return (
                <div key={s.session_id} className="relative group">
                  <button
                    onClick={() => onSelect(s.session_id)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 mb-0.5 transition-all duration-150 relative ${
                      isActive
                        ? "bg-emerald-400/[0.08] border border-emerald-400/20"
                        : "border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Live indicator */}
                      {isBackend && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            isTyping ? "bg-emerald-400 animate-pulse" : "bg-emerald-400/60"
                          }`}
                        />
                      )}
                      <span
                        className={`text-xs truncate flex-1 min-w-0 ${
                          isActive ? "text-emerald-100 font-medium" : "text-slate-300"
                        }`}
                      >
                        {shortTitle(s)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-0">
                      {s.modified && (
                        <span className="text-[9px] tabular-nums text-slate-600">
                          {timeLabel(s.modified)}
                        </span>
                      )}
                      {s.size != null && s.size > 0 && (
                        <span className="text-[9px] tabular-nums text-slate-700">
                          {sizeLabel(s.size)}
                        </span>
                      )}
                    </div>
                  </button>
                  {/* Delete button — visible on hover or when confirming */}
                  {onDelete && (
                    isConfirming ? (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10">
                        <button
                          onClick={() => { onDelete(s.session_id); setConfirmingDelete(null); }}
                          className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmingDelete(null)}
                          className="rounded px-1 py-0.5 text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmingDelete(s.session_id); }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 rounded p-1 text-slate-600 hover:text-rose-400 hover:bg-rose-400/10 transition-all duration-150 z-10"
                        title="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-slate-600">
              {filter ? "No matching sessions" : "No sessions yet"}
            </p>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="shrink-0 border-t border-white/[0.06] px-3 py-2">
        <span className="text-[9px] tabular-nums text-slate-600">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          {filter && filtered.length !== sessions.length && ` (${filtered.length} shown)`}
        </span>
      </div>
    </div>
  );
}
