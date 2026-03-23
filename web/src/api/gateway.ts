import { createSignal } from "solid-js";
import { parseWsEvent, type WsEvent } from "@/api/ws-schemas";

// ── Connection status ────────────────────────────────

export type ConnectionStatus = "connected" | "disconnected" | "connecting";

const [connectionStatus, setConnectionStatus] =
  createSignal<ConnectionStatus>("disconnected");

export { connectionStatus };

// ── Event handler registry ───────────────────────────

export type EventHandler = (event: WsEvent) => void;

const handlers = new Set<EventHandler>();

export function onGatewayEvent(handler: EventHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

// ── Singleton WebSocket ──────────────────────────────

let ws: WebSocket | null = null;
let refCount = 0;
let retries = 0;
let reconnectTimer: number | null = null;
let activityTimer: number | null = null;

const ACTIVITY_TIMEOUT = 45_000;

function wsUrl(path = "/ws"): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

function resetActivityTimer(): void {
  if (activityTimer !== null) window.clearTimeout(activityTimer);
  activityTimer = window.setTimeout(() => {
    ws?.close();
  }, ACTIVITY_TIMEOUT);
}

function connectWs(): void {
  if (ws !== null) return;

  setConnectionStatus("connecting");
  const socket = new WebSocket(wsUrl());
  ws = socket;

  socket.onopen = () => {
    retries = 0;
    setConnectionStatus("connected");
    resetActivityTimer();
  };

  socket.onmessage = (ev: MessageEvent) => {
    resetActivityTimer();
    if (typeof ev.data !== "string") return;
    try {
      const raw: unknown = JSON.parse(ev.data);
      const event = parseWsEvent(raw);
      if (event !== null) {
        for (const handler of handlers) handler(event);
      }
    } catch {
      // ignore malformed frames
    }
  };

  socket.onclose = () => {
    ws = null;
    setConnectionStatus("disconnected");
    if (activityTimer !== null) window.clearTimeout(activityTimer);
    if (refCount > 0) {
      const delay = Math.min(1000 * 2 ** retries, 15_000);
      retries++;
      reconnectTimer = window.setTimeout(connectWs, delay);
    }
  };

  socket.onerror = () => {
    socket.close();
  };
}

function disconnectWs(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activityTimer !== null) {
    window.clearTimeout(activityTimer);
    activityTimer = null;
  }
  ws?.close();
  ws = null;
  setConnectionStatus("disconnected");
}

/**
 * Increment the gateway ref count. The WS connects on first ref
 * and disconnects when the last ref is released. Returns a cleanup
 * function to decrement the ref.
 */
export function mountGateway(): () => void {
  refCount++;
  if (refCount === 1) connectWs();

  return () => {
    refCount--;
    if (refCount === 0) disconnectWs();
  };
}

/**
 * Send a one-shot command via a temporary WebSocket connection.
 * Used for slash commands and quick pokes.
 */
export function sendOneShot(
  command: string,
  targetAgent: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tempWs = new WebSocket(wsUrl());
    tempWs.onopen = () => {
      tempWs.send(
        JSON.stringify({
          type: "client_command",
          command,
          target_agent: targetAgent,
        }),
      );
      tempWs.close();
      resolve();
    };
    tempWs.onerror = () => {
      tempWs.close();
      reject(new Error("WebSocket error"));
    };
  });
}
