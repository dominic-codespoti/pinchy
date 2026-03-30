import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket";
import { parseServerMessage } from "./wsTypes";
import { queryKeys } from "@/shared/api/client";

interface ChatWebSocketOptions {
  selectedAgent: string;
  selectedSession: string;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onToolStart: (tool: string, argsSummary?: string) => void;
  onToolEnd: (tool: string) => void;
  onToolError: (tool: string, error: string) => void;
  onStreamDelta: (delta: string, done: boolean) => void;
  onSessionCreated: () => void;
  onSessionTitle: () => void;
  onAgentList: () => void;
  onTurnReceipt: (receipt: unknown) => void;
  onOtherSessionActivity: (sessionId: string, detail: string) => void;
  onWsConnected: (connected: boolean) => void;
  getProto: () => string;
  getHost: () => string;
}

export function useChatWebSocket(options: ChatWebSocketOptions) {
  const queryClient = useQueryClient();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleMessage = useCallback((data: string) => {
    const msg = parseServerMessage(data);
    if (!msg) return;

    const opts = optionsRef.current;
    const type = msg.type;

    // Handle agent list updates
    if (type === "agent_list" && "agents" in msg && Array.isArray(msg.agents)) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      opts.onAgentList();
      return;
    }

    // Filter by agent
    const agent = msg.agent ?? msg.agent_id ?? "";
    if (agent !== opts.selectedAgent) return;

    // Handle session title updates
    if (type === "session_title") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(opts.selectedAgent) });
      opts.onSessionTitle();
      return;
    }

    // Handle other session activity
    const eventSession = msg.session ?? msg.session_id ?? null;
    if (eventSession && eventSession !== opts.selectedSession) {
      let detail = "working...";
      if (type === "tool_start") detail = `running ${"tool" in msg ? (msg.tool as string) : "tool"}`;
      else if (type === "stream_delta") detail = "responding...";
      else if (type === "typing_start") detail = "thinking...";
      else if (type === "turn_receipt") detail = "completed turn";
      opts.onOtherSessionActivity(eventSession, detail);
      return;
    }

    // Handle session events
    switch (type) {
      case "session_created":
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(opts.selectedAgent) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.currentSession(opts.selectedAgent) });
        opts.onSessionCreated();
        break;
      case "typing_start":
        opts.onTypingStart();
        break;
      case "typing_stop":
        opts.onTypingStop();
        break;
      case "tool_start": {
        const toolName = "tool" in msg ? (msg.tool as string) : "tool";
        const argsSummary = "args_summary" in msg ? (msg.args_summary as string) : undefined;
        opts.onToolStart(toolName, argsSummary);
        break;
      }
      case "tool_end": {
        const toolName = "tool" in msg ? (msg.tool as string) : "tool";
        opts.onToolEnd(toolName);
        break;
      }
      case "tool_error": {
        const toolName = "tool" in msg ? (msg.tool as string) : "tool";
        const errorMsg = "error" in msg ? (msg.error as string) : "Unknown error";
        opts.onToolError(toolName, errorMsg);
        break;
      }
      case "stream_delta": {
        const delta = "delta" in msg ? (msg.delta as string) : "";
        const done = "done" in msg ? (msg.done as boolean) : false;
        opts.onStreamDelta(delta, done);
        break;
      }
      case "turn_receipt":
        opts.onTurnReceipt(msg);
        break;
    }
  }, [queryClient]);

  const handleOpen = useCallback(() => {
    optionsRef.current.onWsConnected(true);
  }, []);

  const handleClose = useCallback(() => {
    optionsRef.current.onWsConnected(false);
  }, []);

  const wsUrl = () => {
    const opts = optionsRef.current;
    return `${opts.getProto()}://${opts.getHost()}/ws`;
  };

  const state = useWebSocket(wsUrl, {
    onOpen: handleOpen,
    onMessage: handleMessage,
    onClose: handleClose,
    reconnect: true,
    reconnectDelay: 1000,
    maxReconnectDelay: 15000,
    activityTimeout: 45000,
  });

  return state;
}
