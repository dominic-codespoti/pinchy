import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Bot,
  Clock,
  Heart,
  Coins,
  Zap,
  Copy,
  X,
  LayoutDashboard,
  Server,
} from "lucide-react";

import {
  getHealth,
  getReceipts,
  getHeartbeatStatus,
  getStatus,
  listAgents,
  listCronJobs,
  listReceipts,
  queryKeys,
} from "@/api/client";
import { Badge, Button, Separator, Skeleton } from "@/components/ui";

type TimelineEvent = {
  id: string;
  ts: number;
  type: string;
  agent: string;
  content: string;
  payload: Record<string, unknown>;
};

export function DashboardRoute() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: queryKeys.status, queryFn: getStatus });
  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });
  const cronQuery = useQuery({ queryKey: queryKeys.cronJobs, queryFn: listCronJobs });
  const heartbeatQuery = useQuery({
    queryKey: ["heartbeat"],
    queryFn: getHeartbeatStatus,
    refetchInterval: 20_000,
  });
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: getHealth,
    refetchInterval: 30_000,
  });

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [tokenHistory, setTokenHistory] = useState<number[]>([]);
  const [eventFilter, setEventFilter] = useState("all");
  const [forcingHeartbeatFor, setForcingHeartbeatFor] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        const type = typeof data.type === "string" ? data.type : "unknown";
        const agent =
          typeof data.agent === "string"
            ? data.agent
            : typeof data.agent_id === "string"
              ? data.agent_id
              : "";
        const content = extractContent(data);

        setEvents((prev) => [
          ...prev.slice(-199),
          {
            id: crypto.randomUUID(),
            ts: normalizeTimestamp(data.timestamp),
            type,
            agent,
            content,
            payload: data,
          },
        ]);

        if (type.toLowerCase().includes("heartbeat")) {
          void queryClient.invalidateQueries({ queryKey: ["heartbeat"] });
        }
      } catch {
        // Ignore malformed payloads.
      }
    };

    ws.onerror = () => ws.close();
    return () => ws.close();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    const agents = agentsQuery.data?.agents ?? [];
    if (!agents.length) {
      setTokenCount(0);
      return;
    }

    (async () => {
      let total = 0;
      const perAgent: number[] = [];
      await Promise.all(
        agents.map(async (agent) => {
          let agentTotal = 0;
          try {
            const listed = await listReceipts(agent.id);
            const filesRaw = listed.receipts ?? [];
            if (!Array.isArray(filesRaw) || filesRaw.length === 0) return;
            const latest = filesRaw[filesRaw.length - 1];
            const fileId =
              typeof latest === "string"
                ? latest
                : typeof latest === "object" && latest !== null
                  ? ((latest as { file?: string; session_id?: string; id?: string }).file ??
                    (latest as { file?: string; session_id?: string; id?: string }).session_id ??
                    (latest as { file?: string; session_id?: string; id?: string }).id)
                  : undefined;
            if (!fileId) return;
            const receiptData = await getReceipts(agent.id, fileId);
            const entries = Array.isArray(receiptData)
              ? receiptData
              : typeof receiptData === "object" && receiptData !== null
                ? ((receiptData as { entries?: unknown[]; receipts?: unknown[] }).entries ??
                   (receiptData as { entries?: unknown[]; receipts?: unknown[] }).receipts ?? [])
                : [];

            for (const entry of entries) {
              if (!entry || typeof entry !== "object") continue;
              const tokens =
                (entry as { tokens?: { total_tokens?: number } }).tokens?.total_tokens ?? 0;
              agentTotal += tokens;
              total += tokens;
            }
          } catch {
            // Best-effort token rollup.
          }
          perAgent.push(agentTotal);
        }),
      );
      if (!cancelled) {
        setTokenCount(total);
        setTokenHistory(perAgent);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentsQuery.data]);

  const stats = useMemo(() => {
    const agentCount = agentsQuery.data?.agents.length ?? 0;
    const cronCount = cronQuery.data?.jobs.length ?? 0;
    const heartbeatCount = heartbeatQuery.data?.agents.length ?? 0;
    const healthy = (heartbeatQuery.data?.agents ?? []).filter((agent) =>
      (agent.health ?? "").toUpperCase().startsWith("OK"),
    ).length;
    return { agentCount, cronCount, heartbeatCount, healthy };
  }, [agentsQuery.data, cronQuery.data, heartbeatQuery.data]);

  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return events;
    return events.filter((event) => eventTypeMatchesFilter(event.type, eventFilter));
  }, [eventFilter, events]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const filterCounts = useMemo(() => {
    const counts = {
      all: events.length,
      heartbeat: 0,
      cron: 0,
      discord: 0,
      session: 0,
      tool: 0,
      error: 0,
    };

    for (const event of events) {
      for (const key of Object.keys(counts)) {
        if (key === "all") continue;
        if (eventTypeMatchesFilter(event.type, key)) {
          counts[key as Exclude<keyof typeof counts, "all">] += 1;
        }
      }
    }
    return counts;
  }, [events]);

  const onForceHeartbeatTick = async (agentId: string) => {
    setForcingHeartbeatFor(agentId);
    try {
      await forceHeartbeatTick(agentId);
      toast.success(`Forced heartbeat tick for ${agentId}`);
    } catch {
      toast.error(`Failed to force heartbeat tick for ${agentId}`);
    } finally {
      setForcingHeartbeatFor(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <LayoutDashboard className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Overview</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <span className="text-xs text-slate-500">Realtime operations pulse</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-500">
            {events.length} events
          </span>
          <span className={`inline-block h-2 w-2 rounded-full ${statusQuery.data?.status === "ok" ? "bg-emerald-400 animate-status-pulse" : "bg-amber-400"}`} />
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

          {/* ── Stat cards ──────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <StatCard label="Gateway" value={statusQuery.data?.status ?? "..."} loading={statusQuery.isLoading} icon={Activity} accent />
            <StatCard label="Agents" value={String(stats.agentCount)} loading={agentsQuery.isLoading} icon={Bot} />
            <StatCard label="Cron Jobs" value={String(stats.cronCount)} loading={cronQuery.isLoading} icon={Clock} />
            <StatCard label="Tokens" value={tokenCount.toLocaleString()} loading={agentsQuery.isLoading} icon={Coins} />
            <StatCard label="Heartbeat OK" value={`${stats.healthy}/${stats.heartbeatCount}`} loading={heartbeatQuery.isLoading} icon={Heart} />
          </div>

          {/* ── Health / Uptime Card ─────────────────── */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <article className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5 text-emerald-400/60" />
                <span className="text-xs font-medium text-slate-300">System Health</span>
              </div>
              {healthQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ) : healthQuery.data ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${healthQuery.data.status === "ok" ? "bg-emerald-400 animate-status-pulse" : "bg-rose-400"}`} />
                    <span className="text-lg font-semibold text-emerald-300">{healthQuery.data.status.toUpperCase()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">Uptime</p>
                      <p className="text-sm font-medium text-slate-200 mt-0.5">{formatUptime(healthQuery.data.uptime_secs)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">Version</p>
                      <p className="text-sm font-medium text-slate-200 mt-0.5">{healthQuery.data.version}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">Agents</p>
                      <p className="text-sm font-medium text-slate-200 mt-0.5">{healthQuery.data.agents}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600">Health endpoint unavailable</p>
              )}
            </article>

            <article className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="h-3.5 w-3.5 text-emerald-400/60" />
                  <span className="text-xs font-medium text-slate-300">Token Distribution</span>
                </div>
                <span className="text-[10px] tabular-nums text-slate-500">{tokenCount.toLocaleString()} total</span>
              </div>
              {tokenHistory.length > 0 ? (
                <div className="flex items-end gap-1 h-16">
                  {tokenHistory.map((val, i) => {
                    const max = Math.max(...tokenHistory, 1);
                    const pct = Math.max(4, (val / max) * 100);
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-emerald-400/30 hover:bg-emerald-400/50 transition-colors relative group"
                        style={{ height: `${pct}%` }}
                        title={`${val.toLocaleString()} tokens`}
                      >
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {val.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-16 text-xs text-slate-600">No token data yet</div>
              )}
            </article>
          </div>

          {/* ── Heartbeat Grid ──────────────────────── */}
          {(heartbeatQuery.data?.agents ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Heart className="h-3.5 w-3.5 text-emerald-400/60" />
                <span className="text-xs font-medium text-slate-300">Heartbeat Grid</span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {(heartbeatQuery.data?.agents ?? []).map((agent) => {
                  const health = (agent.health ?? "UNKNOWN").toUpperCase();
                  const trend = buildAgentTrend(events, agent.agent_id);
                  return (
                    <article
                      key={agent.agent_id}
                      className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 rounded-full ${
                            health === "OK" ? "bg-emerald-400 animate-status-pulse" : health.startsWith("ERROR") ? "bg-rose-400" : "bg-amber-400"
                          }`} />
                          <p className="text-sm font-semibold text-slate-100">{agent.agent_id}</p>
                        </div>
                        <HealthChip health={health} />
                      </div>
                      <p className="font-mono text-lg tracking-wide text-emerald-200/80">{trend}</p>
                      <div className="space-y-0.5 text-xs text-slate-500">
                        <p>Last: {agent.last_tick ? new Date(agent.last_tick * 1000).toLocaleTimeString() : "-"}</p>
                        <p>Next: {agent.next_tick ? new Date(agent.next_tick * 1000).toLocaleTimeString() : "-"}</p>
                        <p>Interval: {agent.interval_secs ?? "-"}s</p>
                      </div>
                      <button
                        type="button"
                        disabled={forcingHeartbeatFor === agent.agent_id}
                        className="w-full flex items-center justify-center gap-1.5 h-7 rounded-lg border border-white/[0.06] bg-white/[0.03] text-xs text-slate-300 hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-40 transition-all duration-200"
                        onClick={() => void onForceHeartbeatTick(agent.agent_id)}
                      >
                        <Zap className="h-3 w-3 text-emerald-400/60" />
                        {forcingHeartbeatFor === agent.agent_id ? "Forcing..." : "Force Tick"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Event filters ──────────────────────── */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-emerald-400/60" />
                <span className="text-xs font-medium text-slate-300">Recent Events</span>
              </div>
              <button
                type="button"
                onClick={() => { setEvents([]); setSelectedEventId(null); }}
                className="text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 mb-3">
              {[
                ["all", "All"],
                ["heartbeat", "Heartbeat"],
                ["cron", "Cron"],
                ["discord", "Discord"],
                ["session", "Session"],
                ["tool", "Tool"],
                ["error", "Error"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEventFilter(value)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all duration-200 ${
                    eventFilter === value
                      ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25"
                      : "border border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.12]"
                  }`}
                >
                  {label} · {filterCounts[value as keyof typeof filterCounts]}
                </button>
              ))}
            </div>

            {/* ── Event list ───────────────────────── */}
            <div className="max-h-80 overflow-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-1" role="log" aria-live="polite" aria-label="Event timeline">
              {filteredEvents.slice().reverse().map((event, index) => (
                <article
                  key={`${event.id}-${index}`}
                  className={`grid cursor-pointer grid-cols-[80px_120px_120px_1fr] gap-2 rounded-lg px-2 py-1.5 text-xs transition-all duration-150 ${
                    selectedEventId === event.id
                      ? "bg-emerald-400/[0.08] border border-emerald-400/20"
                      : "border border-transparent hover:bg-white/[0.03]"
                  }`}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <span className="text-slate-600 tabular-nums">{new Date(event.ts).toLocaleTimeString()}</span>
                  <span><TypeChip type={event.type} /></span>
                  <span className="truncate text-slate-500">{event.agent || "-"}</span>
                  <span className="truncate text-slate-300">{event.content || "-"}</span>
                </article>
              ))}
              {!events.length && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="h-5 w-5 text-slate-700 mb-2" />
                  <p className="text-xs text-slate-600">Waiting for events</p>
                  <p className="text-[10px] text-slate-700 mt-0.5">Live gateway events will appear here</p>
                </div>
              )}
            </div>

            {/* ── Event detail ──────────────────────── */}
            {selectedEvent && (
              <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-medium text-emerald-300/70">
                    Event Detail · {selectedEvent.type}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(JSON.stringify(selectedEvent.payload, null, 2))
                          .then(() => toast.success("Copied"))
                          .catch(() => toast.error("Failed to copy"));
                      }}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(null)}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X className="h-3 w-3" /> Close
                    </button>
                  </div>
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg border border-white/[0.04] bg-black/40 p-2 text-[11px] text-emerald-100/90">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* ── Error banner ────────────────────────── */}
          {(statusQuery.error || agentsQuery.error || cronQuery.error || heartbeatQuery.error) && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">
              Failed loading one or more dashboard queries.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function forceHeartbeatTick(agentId: string) {
  return new Promise<void>((resolve, reject) => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "client_command",
          command: `/heartbeat check ${agentId}`,
          target_agent: agentId,
        }),
      );
      ws.close();
      resolve();
    };

    ws.onerror = () => {
      ws.close();
      reject(new Error("WebSocket error"));
    };
  });
}

function StatCard({ label, value, loading, icon: Icon, accent }: { label: string; value: string; loading: boolean; icon: React.ComponentType<{ className?: string }>; accent?: boolean }) {
  return (
    <article className={`rounded-xl border p-3 transition-all duration-200 hover:bg-white/[0.04] ${
      accent ? "border-emerald-400/20 bg-emerald-400/[0.03]" : "border-white/[0.06] bg-white/[0.02]"
    }`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${accent ? "text-emerald-400/60" : "text-slate-600"}`} />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className={`mt-1.5 text-xl font-semibold tracking-tight ${accent ? "text-emerald-300" : "text-slate-100"}`}>{value}</p>
      )}
    </article>
  );
}

function HealthChip({ health }: { health: string }) {
  const variant = health === "OK" ? "success" : health.startsWith("ERROR") ? "danger" : health === "MISSED" ? "warning" : "neutral";
  return <Badge variant={variant}>{health}</Badge>;
}

function TypeChip({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  const variant = normalized.includes("error")
    ? "danger"
    : normalized.includes("tool")
      ? "info"
      : normalized.includes("heartbeat")
        ? "success"
        : "neutral";
  return <Badge variant={variant}>{type}</Badge>;
}

function buildAgentTrend(events: TimelineEvent[], agentId: string): string {
  const blocks = "▁▂▃▄▅▆▇█";
  const now = Date.now();
  const windowMs = 8 * 60_000;
  const bucketMs = windowMs / 8;
  const buckets = Array.from({ length: 8 }, () => 0);

  for (const event of events) {
    if (event.agent !== agentId) continue;
    const age = now - event.ts;
    if (age < 0 || age > windowMs) continue;
    const idx = Math.min(7, Math.floor((windowMs - age) / bucketMs));
    buckets[idx] += 1;
  }

  const max = Math.max(...buckets, 1);
  return buckets
    .map((count) => {
      const level = Math.min(7, Math.floor((count / max) * 7));
      return blocks[level] ?? "▁";
    })
    .join("");
}

function extractContent(data: Record<string, unknown>): string {
  for (const key of ["content", "message", "response", "output_preview", "command"]) {
    const value = data[key];
    if (typeof value === "string" && value.length) return value.slice(0, 180);
  }
  return "";
}

function normalizeTimestamp(input: unknown): number {
  if (typeof input === "number") {
    if (input > 10_000_000_000) return input;
    return input * 1000;
  }
  if (typeof input === "string") {
    const parsed = Date.parse(input);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function eventTypeMatchesFilter(type: string, filter: string): boolean {
  const normalized = type.toLowerCase();
  if (filter === "all") return true;
  if (filter === "error") return normalized.includes("error") || normalized.includes("failed");
  if (filter === "session") return normalized.includes("session");
  if (filter === "tool") return normalized.includes("tool");
  return normalized.includes(filter);
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}
