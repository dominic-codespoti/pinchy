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
  ChevronDown,
  ChevronRight,
  Bug,
  DollarSign,
} from "lucide-react";
import { wsUrl, sendOneShot } from "@/lib/ws";

import {
  getHealth,
  getReceipts,
  getHeartbeatStatus,
  getStatus,
  getUsage,
  listAgents,
  listCronJobs,
  listReceipts,
  getDebugModelRequest,
  listDebugModelRequests,
  queryKeys,
} from "@/api/client";
import type { UsageBucket } from "@/api/client";
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
  const [debugExpandedMsgs, setDebugExpandedMsgs] = useState<Set<number>>(new Set());
  const [debugFullPayload, setDebugFullPayload] = useState<Record<string, unknown> | null>(null);

  const usageQuery = useQuery({
    queryKey: queryKeys.usage(),
    queryFn: () => getUsage(),
    refetchInterval: 60_000,
  });

  const totalCost = usageQuery.data?.total_cost_usd ?? 0;
  const usageBuckets = usageQuery.data?.usage ?? [];

  useEffect(() => {
    const ws = new WebSocket(wsUrl());

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

        setEvents((prev) => {
          // Deduplicate model_request events by request_id
          if (type === "model_request" && data.request_id) {
            const rid = data.request_id as string;
            if (prev.some((e) => e.type === "model_request" && (e.payload as Record<string, unknown>).request_id === rid)) {
              return prev;
            }
          }
          return [
            ...prev.slice(-199),
            {
              id: typeof data.request_id === "string" ? data.request_id : crypto.randomUUID(),
              ts: normalizeTimestamp(data.timestamp),
              type,
              agent,
              content,
              payload: data,
            },
          ];
        });
      } catch {
        // Ignore malformed payloads.
      }
    };

    ws.onerror = () => ws.close();
    return () => ws.close();
  }, [queryClient]);

  // Seed stored debug events from the REST API on mount.
  // The WS only broadcasts live events — if the dashboard opens after
  // model calls have already happened, we'd miss them without this.
  useEffect(() => {
    listDebugModelRequests()
      .then((requests) => {
        if (!requests.length) return;
        setEvents((prev) => {
          const existingIds = new Set(
            prev.filter((e) => e.type === "model_request").map((e) => (e.payload as Record<string, unknown>).request_id),
          );
          const newEvents: TimelineEvent[] = requests
            .filter((r) => !existingIds.has(r.id as string))
            .map((r) => ({
              id: (r.id as string) ?? crypto.randomUUID(),
              ts: normalizeTimestamp(r.timestamp),
              type: "model_request",
              agent: typeof r.agent === "string" ? r.agent : "",
              content: extractContent({ ...r, type: "model_request" }),
              payload: { ...r, type: "model_request", request_id: r.id },
            }));
          if (!newEvents.length) return prev;
          return [...prev, ...newEvents];
        });
      })
      .catch(() => {});
  }, []);

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
      debug: 0,
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
            <StatCard label="Est. Cost" value={totalCost > 0 ? `$${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}` : "$0"} loading={usageQuery.isLoading} icon={DollarSign} />
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
                  <DollarSign className="h-3.5 w-3.5 text-amber-400/60" />
                  <span className="text-xs font-medium text-slate-300">Cost by Model</span>
                </div>
                <span className="text-[10px] tabular-nums text-slate-500">${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)} total</span>
              </div>
              {usageBuckets.length > 0 ? (
                <CostByModelChart buckets={usageBuckets} />
              ) : (
                <div className="flex items-center justify-center h-16 text-xs text-slate-600">No cost data yet</div>
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
                ["debug", "Debug"],
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
                  onClick={() => { setSelectedEventId(event.id); setDebugExpandedMsgs(new Set()); setDebugFullPayload(null); }}
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
                        const copyData = (selectedEvent.type === "model_request" && debugFullPayload)
                          ? debugFullPayload
                          : selectedEvent.payload;
                        void navigator.clipboard
                          .writeText(JSON.stringify(copyData, null, 2))
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
                {selectedEvent.type === "model_request" ? (
                  <ModelRequestDetail
                    payload={selectedEvent.payload}
                    onFullPayload={setDebugFullPayload}
                    expandedMsgs={debugExpandedMsgs}
                    onToggleMsg={(i) =>
                      setDebugExpandedMsgs((prev) => {
                        const next = new Set(prev);
                        next.has(i) ? next.delete(i) : next.add(i);
                        return next;
                      })
                    }
                  />
                ) : (
                  <pre className="max-h-72 overflow-auto rounded-lg border border-white/[0.04] bg-black/40 p-2 text-[11px] text-emerald-100/90">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                )}
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
  return sendOneShot(`/heartbeat check ${agentId}`, agentId);
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
        : normalized === "model_request"
          ? "warning"
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
  if (data.type === "model_request") {
    const mc = typeof data.message_count === "number" ? data.message_count : "?";
    const fc = typeof data.function_count === "number" ? data.function_count : "?";
    const et = typeof data.estimated_tokens === "number" ? `~${(data.estimated_tokens as number).toLocaleString()} tokens` : "";
    return `${mc} msgs · ${fc} tools${et ? ` · ${et}` : ""}`;
  }
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
  if (filter === "debug") return normalized === "model_request";
  return normalized.includes(filter);
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

// ── Model Request Debug Detail ─────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  system: "text-violet-300 bg-violet-400/10 border-violet-400/20",
  user: "text-sky-300 bg-sky-400/10 border-sky-400/20",
  assistant: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  tool: "text-amber-300 bg-amber-400/10 border-amber-400/20",
};

function ModelRequestDetail({
  payload,
  onFullPayload,
  expandedMsgs,
  onToggleMsg,
}: {
  payload: Record<string, unknown>;
  onFullPayload?: (p: Record<string, unknown> | null) => void;
  expandedMsgs: Set<number>;
  onToggleMsg: (i: number) => void;
}) {
  const requestId = typeof payload.request_id === "string" ? payload.request_id : null;
  const [fullPayload, setFullPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Auto-fetch the full payload when the component mounts (i.e. user selected a model_request event).
  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    setFetchError(null);
    getDebugModelRequest(requestId)
      .then((data) => {
        const d = data as Record<string, unknown>;
        setFullPayload(d);
        onFullPayload?.(d);
      })
      .catch((e) => setFetchError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [requestId]);

  const source = fullPayload ?? payload;
  const messages = Array.isArray(source.messages) ? source.messages : [];
  const functions = Array.isArray(source.functions) ? source.functions : [];
  const fnNames = Array.isArray(payload.function_names) ? payload.function_names : [];
  const msgCount = typeof payload.message_count === "number" ? payload.message_count : messages.length;
  const fnCount = typeof payload.function_count === "number" ? payload.function_count : functions.length;
  const estTokens = typeof payload.estimated_tokens === "number" ? payload.estimated_tokens : null;
  const provider = typeof source.provider === "string" ? source.provider : null;
  const model = typeof source.model === "string" ? source.model : null;
  const [showFunctions, setShowFunctions] = useState(false);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 text-[10px]">
        <span className="flex items-center gap-1 text-slate-400">
          <Bug className="h-3 w-3 text-amber-400/60" />
          <span className="font-medium text-amber-300">Model Request Debug</span>
        </span>
        {(provider || model) && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/50 border border-slate-800/50 text-[9px] font-mono whitespace-nowrap">
            {provider && <span className="text-slate-500">{provider}</span>}
            {provider && model && <span className="text-slate-700">/</span>}
            {model && <span className="text-slate-400">{model}</span>}
          </span>
        )}
        <span className="text-slate-500">
          {msgCount} messages · {fnCount} tools
          {estTokens !== null && <> · ~{estTokens.toLocaleString()} tokens</>}
        </span>
        {loading && <span className="text-[9px] text-slate-600 animate-pulse">Loading full payload…</span>}
        {fetchError && <span className="text-[9px] text-rose-400">Failed to load: {fetchError}</span>}
      </div>

      {/* Messages accordion */}
      {messages.length > 0 ? (
        <div className="space-y-1 max-h-[28rem] overflow-auto">
          {messages.map((msg: Record<string, unknown>, i: number) => {
            const role = typeof msg.role === "string" ? msg.role : "unknown";
            const content = typeof msg.content === "string" ? msg.content : msg.content === null ? "" : JSON.stringify(msg.content);
            const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
            const toolCallId = typeof msg.tool_call_id === "string" ? msg.tool_call_id : null;
            const isExpanded = expandedMsgs.has(i);
            const colors = ROLE_COLORS[role] ?? "text-slate-300 bg-white/[0.03] border-white/[0.06]";
            const preview = content.length > 120 ? content.slice(0, 120) + "…" : content;

            return (
              <div key={i} className={`rounded-lg border ${colors.split(" ").slice(1).join(" ")} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => onToggleMsg(i)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
                  )}
                  <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${colors.split(" ")[0]}`}>
                    {role}
                  </span>
                  {toolCallId && (
                    <span className="text-[9px] font-mono text-slate-600 shrink-0">
                      tc:{toolCallId.slice(0, 12)}
                    </span>
                  )}
                  {hasToolCalls && (
                    <span className="text-[9px] text-amber-400/70 shrink-0">
                      {(msg.tool_calls as unknown[]).length} tool call{(msg.tool_calls as unknown[]).length > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                    [{i}] {content.length.toLocaleString()}ch
                  </span>
                  {!isExpanded && (
                    <span className="text-[10px] text-slate-600 truncate ml-1">
                      {preview}
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <div className="px-2.5 pb-2 space-y-1.5">
                    <pre className="max-h-64 overflow-auto rounded-md border border-white/[0.04] bg-black/40 p-2 text-[10px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                      {content || <span className="italic text-slate-600">(empty)</span>}
                    </pre>
                    {hasToolCalls && (
                      <div className="space-y-1">
                        <p className="text-[9px] uppercase tracking-widest text-amber-400/60 font-medium">Tool Calls</p>
                        {(msg.tool_calls as Array<Record<string, unknown>>).map((tc, j) => {
                          const fn = tc.function as Record<string, unknown> | undefined;
                          const name = fn?.name ?? tc.name ?? "?";
                          const args = typeof (fn?.arguments ?? tc.arguments) === "string"
                            ? (fn?.arguments ?? tc.arguments) as string
                            : JSON.stringify(fn?.arguments ?? tc.arguments ?? {});
                          const tcId = typeof tc.id === "string" ? tc.id : "";
                          return (
                            <div key={j} className="rounded-md border border-amber-400/10 bg-amber-400/[0.03] p-1.5 text-[10px]">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-amber-300">{String(name)}</span>
                                {tcId && <span className="font-mono text-[9px] text-slate-600">id:{tcId.slice(0, 12)}</span>}
                              </div>
                              <pre className="mt-1 max-h-32 overflow-auto rounded border border-white/[0.04] bg-black/30 p-1 text-[9px] text-slate-400 whitespace-pre-wrap break-words">
                                {args}
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !loading ? (
        <div className="text-[10px] text-slate-600 italic py-2">
          {requestId ? "No message data available for this request." : "No request ID — cannot fetch payload."}
        </div>
      ) : null}

      {/* Functions collapsible */}
      {functions.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFunctions((v) => !v)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
          >
            {showFunctions ? (
              <ChevronDown className="h-3 w-3 text-slate-500" />
            ) : (
              <ChevronRight className="h-3 w-3 text-slate-500" />
            )}
            <span className="text-[10px] font-medium text-slate-400">
              Available Tools ({fnCount})
            </span>
            {!showFunctions && (
              <span className="text-[10px] text-slate-600 truncate">
                {(fnNames as string[]).join(", ")}
              </span>
            )}
          </button>
          {showFunctions && (
            <div className="px-2.5 pb-2 space-y-1 max-h-64 overflow-auto">
              {functions.map((fn: Record<string, unknown>, i: number) => (
                <div key={i} className="rounded-md border border-white/[0.04] bg-black/30 p-1.5 text-[10px]">
                  <span className="font-mono font-semibold text-sky-300">{String(fn.name ?? "?")}</span>
                  {typeof fn.description === "string" && (
                    <p className="text-slate-500 mt-0.5">{fn.description}</p>
                  )}
                  {fn.parameters != null && (
                    <pre className="mt-1 max-h-24 overflow-auto rounded border border-white/[0.04] bg-black/20 p-1 text-[9px] text-slate-500 whitespace-pre-wrap">
                      {JSON.stringify(fn.parameters, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MODEL_COLORS = [
  "bg-emerald-400/40", "bg-sky-400/40", "bg-amber-400/40", "bg-violet-400/40",
  "bg-rose-400/40", "bg-teal-400/40", "bg-orange-400/40", "bg-indigo-400/40",
];

function CostByModelChart({ buckets }: { buckets: UsageBucket[] }) {
  const byModel = new Map<string, { cost: number; tokens: number }>();
  for (const b of buckets) {
    const prev = byModel.get(b.model) ?? { cost: 0, tokens: 0 };
    prev.cost += b.estimated_cost_usd;
    prev.tokens += b.total_tokens;
    byModel.set(b.model, prev);
  }
  const sorted = [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const maxCost = Math.max(...sorted.map(([, v]) => v.cost), 0.0001);

  return (
    <div className="space-y-1.5">
      {sorted.slice(0, 6).map(([model, data], i) => {
        const pct = Math.max(4, (data.cost / maxCost) * 100);
        return (
          <div key={model} className="flex items-center gap-2 text-[10px]">
            <span className="text-slate-400 font-mono truncate w-28 shrink-0">{model}</span>
            <div className="flex-1 h-4 rounded-sm bg-white/[0.03] overflow-hidden relative group">
              <div
                className={`h-full rounded-sm ${MODEL_COLORS[i % MODEL_COLORS.length]} transition-all`}
                style={{ width: `${pct}%` }}
              />
              <span className="absolute inset-0 flex items-center px-1.5 text-[9px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                ${data.cost < 0.01 ? data.cost.toFixed(4) : data.cost.toFixed(2)} · {data.tokens.toLocaleString()} tok
              </span>
            </div>
            <span className="text-amber-300/70 tabular-nums w-14 text-right shrink-0">
              ${data.cost < 0.01 ? data.cost.toFixed(4) : data.cost.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}