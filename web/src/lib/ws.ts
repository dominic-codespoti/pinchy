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
    let mounted = true;

    const connect = () => {
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        retriesRef.current = 0;
        setWsConnected(true);
      };

      ws.onclose = () => {
        if (!mounted) return;
        setWsConnected(false);
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
      ws?.close();
      setWsConnected(false);
    };
  }, [setWsConnected]);
}
