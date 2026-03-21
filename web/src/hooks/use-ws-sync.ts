import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGateway } from "@/hooks/use-gateway";
import { qk } from "@/api/queries";
import type { WsEvent } from "@/api/ws-schemas";

/**
 * Root-level WS event handler that invalidates TanStack Query caches
 * globally whenever the gateway pushes relevant events. Mount this
 * once in the root layout so every route benefits from real-time
 * updates — not just the chat route.
 */
export function useWsSync(): void {
  const queryClient = useQueryClient();

  const handler = useCallback(
    (event: WsEvent) => {
      const agentId = "agent_id" in event ? event.agent_id : undefined;
      const sessionId =
        "session_id" in event && typeof event.session_id === "string"
          ? event.session_id
          : undefined;

      switch (event.type) {
        case "session_event": {
          if (agentId !== undefined) {
            void queryClient.invalidateQueries({ queryKey: qk.sessions(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.currentSession(agentId) });
            if (sessionId !== undefined) {
              void queryClient.invalidateQueries({
                queryKey: qk.sessionMessages(agentId, sessionId),
              });
            }
          }
          break;
        }

        case "agent_message": {
          if (agentId !== undefined) {
            void queryClient.invalidateQueries({ queryKey: qk.sessions(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.currentSession(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.receipts(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.usage(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.usage() });
            if (sessionId !== undefined) {
              void queryClient.invalidateQueries({
                queryKey: qk.sessionMessages(agentId, sessionId),
              });
            }
          }
          break;
        }

        case "receipt": {
          if (agentId !== undefined) {
            void queryClient.invalidateQueries({ queryKey: qk.receipts(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.usage(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.usage() });
          }
          break;
        }

        case "tool_activity": {
          if (agentId !== undefined) {
            void queryClient.invalidateQueries({ queryKey: qk.usage(agentId) });
            void queryClient.invalidateQueries({ queryKey: qk.usage() });
          }
          break;
        }

        default:
          break;
      }
    },
    [queryClient],
  );

  useGateway(handler);
}
