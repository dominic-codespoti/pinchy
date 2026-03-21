import { useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { wsUrl } from "@/lib/utils";
import { parseWsEvent, type WsEvent } from "@/api/ws-schemas";

// ── Connection status store (module-level singleton) ─

type ConnectionStatus = "connected" | "disconnected" | "connecting";

let _status: ConnectionStatus = "disconnected";
const _listeners = new Set<() => void>();

function getStatus(): ConnectionStatus {
  return _status;
}

function setStatus(next: ConnectionStatus): void {
  if (_status !== next) {
    _status = next;
    for (const fn of _listeners) fn();
  }
}

function subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

/** Read the gateway WebSocket connection status reactively */
export function useGatewayStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

// ── Gateway connection hook ──────────────────────────

type EventHandler = (event: WsEvent) => void;

// Singleton WS so only one connection exists app-wide
let _ws: WebSocket | null = null;
let _refCount = 0;
let _retries = 0;
let _reconnectTimer: number | null = null;
let _activityTimer: number | null = null;
const _handlers = new Set<EventHandler>();

const ACTIVITY_TIMEOUT = 45_000;

function resetActivityTimer(): void {
  if (_activityTimer !== null) window.clearTimeout(_activityTimer);
  _activityTimer = window.setTimeout(() => {
    _ws?.close();
  }, ACTIVITY_TIMEOUT);
}

function connectWs(): void {
  if (_ws !== null) return;

  setStatus("connecting");
  const ws = new WebSocket(wsUrl());
  _ws = ws;

  ws.onopen = () => {
    _retries = 0;
    setStatus("connected");
    resetActivityTimer();
  };

  ws.onmessage = (ev: MessageEvent) => {
    resetActivityTimer();
    if (typeof ev.data !== "string") return;
    try {
      const raw: unknown = JSON.parse(ev.data);
      const event = parseWsEvent(raw);
      if (event !== null) {
        for (const handler of _handlers) handler(event);
      }
    } catch {
      // ignore malformed frames
    }
  };

  ws.onclose = () => {
    _ws = null;
    setStatus("disconnected");
    if (_activityTimer !== null) window.clearTimeout(_activityTimer);
    if (_refCount > 0) {
      const delay = Math.min(1000 * 2 ** _retries, 15_000);
      _retries++;
      _reconnectTimer = window.setTimeout(connectWs, delay);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

function disconnectWs(): void {
  if (_reconnectTimer !== null) {
    window.clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_activityTimer !== null) {
    window.clearTimeout(_activityTimer);
    _activityTimer = null;
  }
  _ws?.close();
  _ws = null;
  setStatus("disconnected");
}

/**
 * Mount the singleton gateway WebSocket. The connection is ref-counted:
 * it opens on first mount and closes when the last consumer unmounts.
 *
 * Pass an optional handler to receive parsed WsEvent objects.
 */
export function useGateway(onEvent?: EventHandler): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  // Stable wrapper so the set entry never changes
  const stableHandler = useCallback((ev: WsEvent) => {
    handlerRef.current?.(ev);
  }, []);

  useEffect(() => {
    _handlers.add(stableHandler);
    _refCount++;
    if (_refCount === 1) connectWs();

    return () => {
      _handlers.delete(stableHandler);
      _refCount--;
      if (_refCount === 0) disconnectWs();
    };
  }, [stableHandler]);
}

/**
 * Send a one-shot command via a temporary WebSocket connection.
 * Used for slash commands and quick pokes that don't need the
 * long-lived gateway connection.
 */
export function sendOneShot(
  command: string,
  targetAgent: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "client_command",
          command,
          target_agent: targetAgent,
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
