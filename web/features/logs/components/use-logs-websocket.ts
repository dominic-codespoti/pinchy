'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { PAGINATION } from '@/lib/query-config';
import { fetchApi } from '@/shared/api/client';
import { RecentLogsResponseSchema } from '@/lib/validation/schemas';
import { getLogsWebSocketUrl } from '@/lib/config/ports';

/** Log entry interface matching backend format from src/logs.rs */
export interface LogEntry {
  type: 'log';
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
  target: string;
  message: string;
  fields?: Record<string, unknown>;
  ts: string;
}

const MAX_LOGS = PAGINATION.LOGS_MAX_BUFFER;
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
      const data = await fetchApi(
        `/api/logs/recent?limit=${PAGINATION.REALTIME_LIMIT}`,
        {},
        RecentLogsResponseSchema
      );
      
      // Pre-populate logs with recent backlog
      setLogs(data.logs as LogEntry[]);
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

    // Use centralized port configuration
    const wsUrl = getLogsWebSocketUrl();

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
