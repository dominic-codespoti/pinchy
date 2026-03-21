import { useState, useCallback, useRef, useEffect } from "react";
import { useGateway, sendOneShot } from "@/hooks/use-gateway";
import type { WsEvent, WsAgentChunk, WsToolActivity } from "@/api/ws-schemas";

// ── Types ────────────────────────────────────────────

export interface ToolCall {
  readonly tool: string;
  readonly status: string;
  readonly argsSummary: string;
  readonly resultSummary: string;
  readonly error: string;
  readonly durationMs: number | null;
}

export interface ChatState {
  readonly streamingContent: string;
  readonly isTyping: boolean;
  readonly toolCalls: ReadonlyArray<ToolCall>;
  readonly lastMessageTimestamp: number | null;
}

const INITIAL_STATE: ChatState = {
  streamingContent: "",
  isTyping: false,
  toolCalls: [],
  lastMessageTimestamp: null,
};

// ── Hook ─────────────────────────────────────────────

/**
 * Manages real-time chat state for a single agent. Subscribes to the
 * gateway WebSocket and filters events by agent_id.
 *
 * Query invalidation is handled by the root-level `useWsSync` hook.
 * This hook focuses on streaming UI state only.
 */
export function useAgentChat(agentId: string): ChatState & {
  readonly send: (message: string) => void;
  readonly clearStream: () => void;
} {
  const [state, setState] = useState<ChatState>(INITIAL_STATE);
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;

  const handleEvent = useCallback((event: WsEvent) => {
    if ("agent_id" in event && event.agent_id !== agentIdRef.current) return;

    switch (event.type) {
      case "agent_chunk":
        handleChunk(event, setState);
        break;

      case "agent_message":
        setState((prev) => ({
          ...prev,
          streamingContent: "",
          isTyping: false,
          lastMessageTimestamp: event.timestamp ?? Date.now(),
        }));
        break;

      case "tool_activity":
        handleToolActivity(event, setState);
        break;

      case "typing":
        setState((prev) => ({ ...prev, isTyping: event.is_typing }));
        break;

      default:
        break;
    }
  }, []);

  useGateway(handleEvent);

  // Reset state when agent changes
  useEffect(() => {
    setState(INITIAL_STATE);
  }, [agentId]);

  const send = useCallback((message: string) => {
    void sendOneShot(message, agentIdRef.current);
    setState((prev) => ({
      ...prev,
      streamingContent: "",
      toolCalls: [],
      isTyping: true,
    }));
  }, []);

  const clearStream = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, send, clearStream };
}

// ── Pure event handlers ──────────────────────────────

function handleChunk(
  event: WsAgentChunk,
  setState: React.Dispatch<React.SetStateAction<ChatState>>,
): void {
  if (event.done === true) {
    setState((prev) => ({ ...prev, isTyping: false }));
  } else {
    setState((prev) => ({
      ...prev,
      streamingContent: prev.streamingContent + event.content,
    }));
  }
}

function handleToolActivity(
  event: WsToolActivity,
  setState: React.Dispatch<React.SetStateAction<ChatState>>,
): void {
  const call: ToolCall = {
    tool: event.tool,
    status: event.status,
    argsSummary: event.args_summary ?? "",
    resultSummary: event.result_summary ?? "",
    error: event.error ?? "",
    durationMs: event.duration_ms ?? null,
  };
  setState((prev) => ({
    ...prev,
    toolCalls: [...prev.toolCalls, call],
  }));
}
