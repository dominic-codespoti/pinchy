import { Show } from "solid-js";
import { connectionStatus, type ConnectionStatus } from "@/api/gateway";
import { Wifi, WifiOff, Loader } from "@/components/icons";

function statusMeta(s: ConnectionStatus) {
  switch (s) {
    case "connected":
      return { label: "Connected", icon: Wifi, cls: "conn-ok" } as const;
    case "connecting":
      return { label: "Connecting", icon: Loader, cls: "conn-pending" } as const;
    case "disconnected":
      return { label: "Offline", icon: WifiOff, cls: "conn-off" } as const;
  }
}

/** Full connection indicator with icon + label (sidebar) */
export function ConnectionIndicator() {
  const meta = () => statusMeta(connectionStatus());

  return (
    <div class={`conn-indicator ${meta().cls}`}>
      {meta().icon({ size: 14 })}
      <span class="conn-label">{meta().label}</span>
    </div>
  );
}

/** Compact connection pill for mobile header */
export function ConnectionPill() {
  const meta = () => statusMeta(connectionStatus());

  return (
    <div class={`conn-pill ${meta().cls}`}>
      {meta().icon({ size: 12 })}
      <Show when={connectionStatus() !== "connected"}>
        <span class="conn-pill-label">{meta().label}</span>
      </Show>
    </div>
  );
}
