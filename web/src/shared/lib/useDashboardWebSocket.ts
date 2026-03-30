import { useState, useCallback, useRef } from "react";
import { useWebSocket, wsUrl } from "./useWebSocket";
import { parseServerMessage } from "./wsTypes";

interface DashboardWebSocketState {
  connected: boolean;
  events: TimelineEvent[];
  reconnectAttempt: number;
}

export interface TimelineEvent {
  id: string;
  ts: number;
  type: string;
  agent: string;
  content: string;
  payload: Record<string, unknown>;
}

function extractContent(data: Record<string, unknown>): string {
  if (data.type === "model_request") {
    const mc = typeof data.message_count === "number" ? data.message_count : "?";
    const fc = typeof data.function_count === "number" ? data.function_count : "?";
    const et =
      typeof data.estimated_tokens === "number"
        ? `~${(data.estimated_tokens as number).toLocaleString()} tokens`
        : "";
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

export function useDashboardWebSocket(): DashboardWebSocketState {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const handleMessage = useCallback((data: string) => {
    const msg = parseServerMessage(data);
    if (!msg) return;

    const payload = msg as Record<string, unknown>;
    const type = msg.type;
    const agent = msg.agent ?? msg.agent_id ?? "";
    const content = extractContent(payload);

    setEvents((prev) => {
      // Deduplicate model_request events by request_id
      if (type === "model_request" && payload.request_id) {
        const rid = payload.request_id as string;
        if (prev.some((e) => e.type === "model_request" && e.payload.request_id === rid)) {
          return prev;
        }
      }
      return [
        ...prev.slice(-199),
        {
          id: (payload.request_id as string) ?? crypto.randomUUID(),
          ts: normalizeTimestamp(payload.timestamp),
          type,
          agent,
          content,
          payload,
        },
      ];
    });
  }, []);

  const state = useWebSocket(wsUrl, {
    onMessage: handleMessage,
    reconnect: true,
    reconnectDelay: 1000,
    maxReconnectDelay: 15000,
    activityTimeout: 45000,
  });

  return {
    connected: state.connected,
    events,
    reconnectAttempt: state.reconnectAttempt,
  };
}

export { extractContent, normalizeTimestamp };
