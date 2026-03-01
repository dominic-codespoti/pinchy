import { useEffect, useRef } from "react";

import { useUiStore } from "@/state/ui";

export function wsUrl(path = "/ws"): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

export function sendOneShot(command: string, targetAgent: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "client_command", command, target_agent: targetAgent }));
      ws.close();
      resolve();
    };
    ws.onerror = () => {
      ws.close();
      reject(new Error("WebSocket error"));
    };
  });
}

export function useGatewayStatusSocket() {
  const setWsConnected = useUiStore((s) => s.setWsConnected);
  const retriesRef = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: number | null = null;
    let activityTimer: number | null = null;
    let mounted = true;

    // If no message (including pong) arrives within 45 s, assume the
    // connection is dead and force a reconnect.  The server pings every
    // 30 s, so under normal conditions we'll always receive *something*
    // well within this window.
    const ACTIVITY_TIMEOUT = 45_000;

    const resetActivityTimer = () => {
      if (activityTimer !== null) window.clearTimeout(activityTimer);
      activityTimer = window.setTimeout(() => {
        // No data for 45 s — force reconnect.
        ws?.close();
      }, ACTIVITY_TIMEOUT);
    };

    const connect = () => {
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        retriesRef.current = 0;
        setWsConnected(true);
        resetActivityTimer();
      };

      ws.onmessage = () => {
        // Any frame (including pong replies forwarded as message events
        // by some browsers) resets the activity timer.
        resetActivityTimer();
      };

      ws.onclose = () => {
        if (!mounted) return;
        setWsConnected(false);
        if (activityTimer !== null) window.clearTimeout(activityTimer);
        const delay = Math.min(1000 * 2 ** retriesRef.current, 15000);
        retriesRef.current += 1;
        timer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      mounted = false;
      if (timer !== null) window.clearTimeout(timer);
      if (activityTimer !== null) window.clearTimeout(activityTimer);
      ws?.close();
      setWsConnected(false);
    };
  }, [setWsConnected]);
}
