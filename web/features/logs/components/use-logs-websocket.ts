'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

/** Log entry interface matching backend format from src/logs.rs */
export interface LogEntry {
  type: 'log';
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
  target: string;
  message: string;
  fields?: Record<string, unknown>;
  ts: string;
}

/** Response from the recent logs API */
interface RecentLogsResponse {
  logs: LogEntry[];
  has_more: boolean;
  buffer_capacity: number;
  retention: string;
}

const MAX_LOGS = 2000;
const RECONNECT_DELAY_MS = 3000;

interface UseLogsWebSocketReturn {
  logs: LogEntry[];
  connected: boolean;
  clearLogs: () => void;
  /** Info about the recent backlog fetch */
  backlogInfo: {
    fetched: boolean;
    count: number;
    hasMore: boolean;
    bufferCapacity: number;
    retention: string;
  } | null;
}

/**
 * Custom hook that manages the WebSocket connection to the log stream.
 * Handles connection, reconnection, message parsing, and log accumulation.
 * Fetches recent in-memory logs on initial load before WebSocket connects.
 */
export function useLogsWebSocket(): UseLogsWebSocketReturn {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [backlogInfo, setBacklogInfo] = useState<UseLogsWebSocketReturn['backlogInfo']>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchedBacklogRef = useRef(false);

  /** Fetch recent logs from the HTTP endpoint before connecting WebSocket */
  const fetchRecentLogs = useCallback(async () => {
    if (fetchedBacklogRef.current) return;
    fetchedBacklogRef.current = true;

    try {
      const res = await fetch('/api/logs/recent?limit=200');
      if (!res.ok) {
        console.warn('Failed to fetch recent logs:', res.status);
        return;
      }
      const data: RecentLogsResponse = await res.json();
      
      // Pre-populate logs with recent backlog
      setLogs(data.logs);
      setBacklogInfo({
        fetched: true,
        count: data.logs.length,
        hasMore: data.has_more,
        bufferCapacity: data.buffer_capacity,
        retention: data.retention,
      });
    } catch (err) {
      console.warn('Error fetching recent logs:', err);
    }
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3131/ws/logs`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log') {
            setLogs((prev) => {
              const newLogs = [...prev, data as LogEntry];
              return newLogs.length > MAX_LOGS ? newLogs.slice(-MAX_LOGS) : newLogs;
            });
          }
          // Server errors are surfaced via the connection status
        } catch {
          // Handle non-JSON messages as plain text log entries
          setLogs((prev) => {
            const entry: LogEntry = {
              type: 'log',
              level: 'INFO',
              target: 'websocket',
              message: event.data,
              ts: new Date().toISOString(),
            };
            const newLogs = [...prev, entry];
            return newLogs.length > MAX_LOGS ? newLogs.slice(-MAX_LOGS) : newLogs;
          });
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        setConnected(false);
      };
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    // Fetch recent logs first, then connect WebSocket
    fetchRecentLogs().then(() => {
      connect();
    });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, fetchRecentLogs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, connected, clearLogs, backlogInfo };
}
