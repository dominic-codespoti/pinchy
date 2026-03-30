/**
 * WebSocket message protocol types
 * Defines all server-to-client message structures
 */

export type ServerMessage =
  | AgentListMessage
  | SessionTitleMessage
  | SessionCreatedMessage
  | TypingStartMessage
  | TypingStopMessage
  | ToolStartMessage
  | ToolEndMessage
  | ToolErrorMessage
  | StreamDeltaMessage
  | StreamEndMessage
  | TurnReceiptMessage
  | ModelRequestMessage
  | HeartbeatMessage
  | ErrorMessage
  | GenericMessage;

interface BaseMessage {
  type: string;
  agent?: string;
  agent_id?: string;
  session?: string | null;
  session_id?: string | null;
  timestamp?: number;
}

export interface AgentListMessage extends BaseMessage {
  type: "agent_list";
  agents: string[];
}

export interface SessionTitleMessage extends BaseMessage {
  type: "session_title";
}

export interface SessionCreatedMessage extends BaseMessage {
  type: "session_created";
}

export interface TypingStartMessage extends BaseMessage {
  type: "typing_start";
}

export interface TypingStopMessage extends BaseMessage {
  type: "typing_stop";
}

export interface ToolStartMessage extends BaseMessage {
  type: "tool_start";
  tool?: string;
  args_summary?: string;
}

export interface ToolEndMessage extends BaseMessage {
  type: "tool_end";
  tool?: string;
}

export interface ToolErrorMessage extends BaseMessage {
  type: "tool_error";
  tool?: string;
  error?: string;
  message?: string;
}

export interface StreamDeltaMessage extends BaseMessage {
  type: "stream_delta";
  delta?: string;
  done?: boolean;
}

export interface StreamEndMessage extends BaseMessage {
  type: "stream_end";
}

export interface TurnReceiptMessage extends BaseMessage {
  type: "turn_receipt";
  receipt?: {
    tokens?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    model_calls?: number;
    duration_ms?: number;
  };
}

export interface ModelRequestMessage extends BaseMessage {
  type: "model_request";
  request_id?: string;
  message_count?: number;
  function_count?: number;
  estimated_tokens?: number;
}

export interface HeartbeatMessage extends BaseMessage {
  type: "heartbeat";
  health?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  error?: string;
  message?: string;
}

export interface GenericMessage extends BaseMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Client-to-server message types
 */
export type ClientMessage =
  | ClientCommandMessage
  | ClientPingMessage;

export interface ClientCommandMessage {
  type: "client_command";
  command: string;
  target_agent: string;
}

export interface ClientPingMessage {
  type: "ping";
}

/**
 * Type guard to check if a message is a valid server message
 */
export function isServerMessage(data: unknown): data is ServerMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.type === "string";
}

/**
 * Safely parse WebSocket message data
 */
export function parseServerMessage(data: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (isServerMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
