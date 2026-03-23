import { createSignal } from "solid-js";

// ── Log line parsing ─────────────────────────────────

export interface LogLine {
  readonly raw: string;
  readonly timestamp: string;
  readonly message: string;
}

const TS_RE =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)/;

function parseLine(raw: string): LogLine {
  const match = raw.match(TS_RE);
  return match
    ? { raw, timestamp: match[1] ?? "", message: match[2] ?? "" }
    : { raw, timestamp: "", message: raw };
}

// ── Log stream connection ────────────────────────────

const MAX_LINES = 5000;

function wsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

/**
 * Creates a log stream connection. Returns signals and controls.
 * Call `connect()` to start and `disconnect()` to stop.
 */
export function createLogStream() {
  const [lines, setLines] = createSignal<LogLine[]>([]);
  const [paused, setPaused] = createSignal(false);
  let socket: WebSocket | null = null;

  function connect(): void {
    if (socket !== null) return;
    const ws = new WebSocket(wsUrl("/ws/logs"));
    socket = ws;

    ws.onmessage = (ev) => {
      if (paused()) return;
      const parsed = parseLine(typeof ev.data === "string" ? ev.data : "");
      setLines((prev) => {
        const next = [...prev, parsed];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    };

    ws.onclose = () => {
      socket = null;
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function disconnect(): void {
    socket?.close();
    socket = null;
  }

  function togglePause(): void {
    const next = !paused();
    setPaused(next);
    if (next) {
      disconnect();
    } else {
      connect();
    }
  }

  function clear(): void {
    setLines([]);
  }

  return { lines, paused, connect, disconnect, togglePause, clear };
}
