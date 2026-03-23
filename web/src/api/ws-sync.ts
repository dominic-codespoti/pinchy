import { onCleanup } from "solid-js";
import { onGatewayEvent } from "@/api/gateway";
import { invalidateQueries } from "@/api/use-api";
import { qk } from "@/api/queries";
import type { WsEvent } from "@/api/ws-schemas";

/**
 * Root-level WS event handler that invalidates query caches
 * when the gateway pushes relevant events. Call once in the
 * app shell so every route benefits from real-time updates.
 */
export function mountWsSync(): () => void {
  function handler(event: WsEvent): void {
    const agentId =
      "agent_id" in event ? (event as { agent_id: string }).agent_id : undefined;
    const sessionId =
      "session_id" in event &&
      typeof (event as { session_id?: string }).session_id === "string"
        ? (event as { session_id: string }).session_id
        : undefined;

    switch (event.type) {
      case "session_event": {
        if (agentId !== undefined) {
          invalidateQueries(qk.sessions(agentId));
          invalidateQueries(qk.currentSession(agentId));
          if (sessionId !== undefined) {
            invalidateQueries(qk.sessionMessages(agentId, sessionId));
          }
        }
        break;
      }

      case "agent_message": {
        if (agentId !== undefined) {
          invalidateQueries(qk.sessions(agentId));
          invalidateQueries(qk.currentSession(agentId));
          invalidateQueries(qk.receipts(agentId));
          invalidateQueries(qk.usage(agentId));
          invalidateQueries(qk.usage());
          if (sessionId !== undefined) {
            invalidateQueries(qk.sessionMessages(agentId, sessionId));
          }
        }
        break;
      }

      case "receipt": {
        if (agentId !== undefined) {
          invalidateQueries(qk.receipts(agentId));
          invalidateQueries(qk.usage(agentId));
          invalidateQueries(qk.usage());
        }
        break;
      }

      case "tool_activity": {
        if (agentId !== undefined) {
          invalidateQueries(qk.usage(agentId));
          invalidateQueries(qk.usage());
        }
        break;
      }

      default:
        break;
    }
  }

  return onGatewayEvent(handler);
}

/**
 * Solid-friendly wrapper: mounts WS sync and cleans up on disposal.
 * Use inside a component or root-level effect.
 */
export function useWsSync(): void {
  const cleanup = mountWsSync();
  onCleanup(cleanup);
}
