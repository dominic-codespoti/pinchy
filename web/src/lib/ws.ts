import { useEffect, useRef } from "react";

import { useUiStore } from "@/state/ui";

export function useGatewayStatusSocket() {
  const setWsConnected = useUiStore((s) => s.setWsConnected);
  const retriesRef = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: number | null = null;
    let mounted = true;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);

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
