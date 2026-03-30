import { useEffect, useRef, useCallback } from "react";

export interface WebSocketOptions {
  /** Callback for successful connection */
  onOpen?: () => void;
  /** Callback for message received */
  onMessage: (data: string) => void;
  /** Callback for connection close */
  onClose?: (event: CloseEvent) => void;
  /** Callback for errors */
  onError?: (error: Event) => void;
  /** Whether to automatically reconnect on close */
  reconnect?: boolean;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 15000) */
  maxReconnectDelay?: number;
  /** Reconnect backoff multiplier (default: 2) */
  reconnectBackoff?: number;
  /** Activity timeout in ms - force reconnect if no data received (default: 45000) */
  activityTimeout?: number;
}

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  reconnectAttempt: number;
}

/**
 * Unified WebSocket hook with automatic reconnection
 */
export function useWebSocket(
  url: string | (() => string),
  options: WebSocketOptions
): WebSocketState {
  const {
    onOpen,
    onMessage,
    onClose,
    onError,
    reconnect = true,
    reconnectDelay = 1000,
    maxReconnectDelay = 15000,
    reconnectBackoff = 2,
    activityTimeout = 45000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const activityTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [state, setState] = React.useState<WebSocketState>({
    connected: false,
    connecting: false,
    reconnectAttempt: 0,
  });

  const resetActivityTimer = useCallback(() => {
    if (activityTimerRef.current !== null) {
      window.clearTimeout(activityTimerRef.current);
    }
    activityTimerRef.current = window.setTimeout(() => {
      // No activity for timeout period - force reconnect
      wsRef.current?.close();
    }, activityTimeout);
  }, [activityTimeout]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (activityTimerRef.current !== null) {
      window.clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = typeof url === "function" ? url() : url;

    try {
      setState((prev) => ({ ...prev, connecting: true }));
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        reconnectAttemptsRef.current = 0;
        setState({
          connected: true,
          connecting: false,
          reconnectAttempt: 0,
        });
        resetActivityTimer();
        onOpen?.();
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        resetActivityTimer();
        onMessage(event.data as string);
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        clearTimers();
        setState((prev) => ({ ...prev, connected: false, connecting: false }));
        onClose?.(event);

        if (reconnect) {
          const delay = Math.min(
            reconnectDelay * reconnectBackoff ** reconnectAttemptsRef.current,
            maxReconnectDelay
          );
          reconnectAttemptsRef.current += 1;
          setState((prev) => ({ ...prev, reconnectAttempt: reconnectAttemptsRef.current }));
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        onError?.(error);
        ws.close();
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      setState((prev) => ({ ...prev, connecting: false }));
    }
  }, [
    url,
    onOpen,
    onMessage,
    onClose,
    onError,
    reconnect,
    reconnectDelay,
    maxReconnectDelay,
    reconnectBackoff,
    resetActivityTimer,
    clearTimers,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimers();
      wsRef.current?.close();
    };
  }, [connect, clearTimers]);

  return state;
}

/**
 * Get WebSocket URL with proper protocol
 */
export function wsUrl(path = "/ws"): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

/**
 * Send a one-shot command and close connection
 */
export function sendOneShot(command: string, targetAgent: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    const timeout = window.setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket timeout"));
    }, 5000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "client_command",
          command,
          target_agent: targetAgent,
        })
      );
    };

    ws.onmessage = () => {
      window.clearTimeout(timeout);
      ws.close();
      resolve();
    };

    ws.onerror = () => {
      window.clearTimeout(timeout);
      ws.close();
      reject(new Error("WebSocket error"));
    };

    ws.onclose = () => {
      window.clearTimeout(timeout);
    };
  });
}

// Need React import for useState
import * as React from "react";
