import { useEffect, useRef, useState } from "react";
import { wsUrl } from "@/shared/lib/ws";

export type LogEntry = {
  ts?: string;
  level?: string;
  target?: string;
  message?: string;
};
const MAX_LINES = 2000;

export function useLogStream() {
  const [paused, setPaused] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingRef = useRef<LogEntry[]>([]);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let mounted = true;

    const connect = () => {
      ws = new WebSocket(wsUrl("/ws/logs"));

      ws.onmessage = (event) => {
        let parsed: LogEntry;
        try {
          parsed = JSON.parse(event.data as string) as LogEntry;
        } catch {
          return;
        }

        if (pausedRef.current) {
          pendingRef.current = [...pendingRef.current.slice(-(MAX_LINES - 1)), parsed];
          setPendingCount(pendingRef.current.length);
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
    setPendingCount(0);
  }, [paused]);

  return {
    entries,
    paused,
    setPaused,
    pendingCount,
  };
}