import { useState, useCallback, useRef } from "react";
import { useWebSocket, wsUrl } from "./useWebSocket";

export interface LogEntry {
  ts?: string;
  level?: string;
  target?: string;
  message?: string;
}

interface LogsWebSocketState {
  connected: boolean;
  entries: LogEntry[];
  pendingCount: number;
  reconnectAttempt: number;
}

const MAX_LINES = 2000;

export function useLogsWebSocket(
  paused: boolean,
  level: string,
  textFilter: string,
  targetFilter: string
): LogsWebSocketState {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingRef = useRef<LogEntry[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const filtersRef = useRef({ level, textFilter, targetFilter });
  filtersRef.current = { level, textFilter, targetFilter };

  const handleMessage = useCallback((data: string) => {
    let parsed: LogEntry;
    try {
      parsed = JSON.parse(data) as LogEntry;
    } catch {
      return;
    }

    if (pausedRef.current) {
      pendingRef.current = [...pendingRef.current.slice(-(MAX_LINES - 1)), parsed];
      setPendingCount(pendingRef.current.length);
      return;
    }

    setEntries((prev) => [...prev.slice(-(MAX_LINES - 1)), parsed]);
  }, []);

  const state = useWebSocket(() => wsUrl("/ws/logs"), {
    onMessage: handleMessage,
    reconnect: true,
    reconnectDelay: 2000,
    maxReconnectDelay: 15000,
    activityTimeout: 45000,
  });

  // Flush pending entries when unpaused
  if (!paused && pendingRef.current.length > 0) {
    const pending = pendingRef.current;
    pendingRef.current = [];
    setPendingCount(0);
    setEntries((prev) => [...prev.slice(-(MAX_LINES - 1)), ...pending.slice(-MAX_LINES)]);
  }

  return {
    connected: state.connected,
    entries,
    pendingCount,
    reconnectAttempt: state.reconnectAttempt,
  };
}
