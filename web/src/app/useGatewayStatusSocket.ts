import { useEffect, useRef } from "react";
import { useUiStore } from "@/app/store/ui";
import { wsUrl } from "@/shared/lib/wsHelpers";

export function useGatewayStatusSocket(): void {
  const setWsConnected = useUiStore((s) => s.setWsConnected);
  const retriesRef = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: number | null = null;
    let activityTimer: number | null = null;
    let mounted = true;

    const ACTIVITY_TIMEOUT = 45_000;

    const resetActivityTimer = () => {
      if (activityTimer !== null) window.clearTimeout(activityTimer);
      activityTimer = window.setTimeout(() => {
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
