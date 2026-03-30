import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { wsUrl, sendOneShot } from "@/shared/lib/useWebSocket";
import {
  getStatus,
  listAgents,
  listCronJobs,
  getHeartbeatStatus,
  getHealth,
  getUsage,
  listReceipts,
  getReceipts,
  queryKeys,
  listDebugModelRequests,
} from "@/shared/api/client";

export type TimelineEvent = {
  id: string;
  ts: number;
  type: string;
  agent: string;
  content: string;
  payload: Record<string, unknown>;
}

export function extractContent(data: Record<string, unknown>): string {
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

export function normalizeTimestamp(input: unknown): number {
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

export function eventTypeMatchesFilter(type: string, filter: string): boolean {
  const normalized = type.toLowerCase();
  if (filter === "all") return true;
  if (filter === "error") return normalized.includes("error") || normalized.includes("failed");
  if (filter === "session") return normalized.includes("session");
  if (filter === "tool") return normalized.includes("tool");
  if (filter === "debug") return normalized === "model_request";
  return normalized.includes(filter);
}

export function forceHeartbeatTick(agentId: string) {
  return sendOneShot(`/heartbeat check ${agentId}`, agentId);
}

export function buildAgentTrend(events: TimelineEvent[], agentId: string): string {
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

export function useDashboardRoute() {
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


  return {
    state: {
      events,
      setEvents,
      tokenCount,
      eventFilter,
      setEventFilter,
      forcingHeartbeatFor,
      setForcingHeartbeatFor,
      selectedEventId,
      setSelectedEventId,
      debugExpandedMsgs,
      setDebugExpandedMsgs,
      debugFullPayload,
      setDebugFullPayload,
    },
    computed: {
      totalCost,
      usageBuckets,
      stats,
      filteredEvents,
      selectedEvent,
      filterCounts,
    },
    queries: {
      statusQuery,
      agentsQuery,
      cronQuery,
      heartbeatQuery,
      healthQuery,
      usageQuery,
    },
    actions: {
      onForceHeartbeatTick,
    }
  };
}
