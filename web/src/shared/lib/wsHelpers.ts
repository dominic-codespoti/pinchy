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
