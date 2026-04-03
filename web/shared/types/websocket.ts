/**
 * WebSocket message types for Pinchy gateway communication
 *
 * These types mirror the JSON events published by the Rust backend.
 * All messages use discriminated unions with a `type` field for type narrowing.
 */

// ============================================================================
// Incoming WebSocket Messages (Backend → Frontend)
// ============================================================================

/** Initial agent list sent on WebSocket connection */
export interface AgentListMessage {
  type: 'agent_list';
  agents: string[];
}

/** Session created event */
export interface SessionCreatedMessage {
  type: 'session_created';
  agent: string;
  session: string | null;
}

/** Session title updated (auto-generated) */
export interface SessionTitleMessage {
  type: 'session_title';
  agent: string;
  session: string;
  title: string;
}

/** Typing indicator start */
export interface TypingStartMessage {
  type: 'typing_start';
  agent: string;
  session: string | null;
}

/** Typing indicator stop */
export interface TypingStopMessage {
  type: 'typing_stop';
  agent?: string;
  session?: string | null;
}

/** Session message (user or assistant) */
export interface SessionMessage {
  type: 'session_message';
  agent: string;
  session: string | null;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  timestamp?: number | string;
  id?: string;
}

/** Streaming delta (chunked response) */
export interface StreamDeltaMessage {
  type: 'stream_delta';
  agent: string;
  session: string | null;
  delta: string;
  done: boolean;
}

/** Agent reply (final response) */
export interface AgentReplyMessage {
  type: 'agent_reply';
  agent: string;
  session: string | null;
  channel: string;
  text: string;
}

/** Rich reply (structured message) */
export interface AgentRichReplyMessage {
  type: 'agent_rich_reply';
  message: {
    text: string;
    blocks?: Array<{
      type: 'text' | 'image' | 'file';
      content?: string;
      url?: string;
      mime_type?: string;
    }>;
  };
}

/** Slash command response */
export interface SlashResponseMessage {
  type: 'slash_response';
  agent: string;
  command: string;
  response: string;
}

/** Slash command error */
export interface SlashErrorMessage {
  type: 'slash_error';
  agent: string;
  command: string;
  error: string;
}

/** Tool execution start */
export interface ToolStartMessage {
  type: 'tool_start';
  agent: string;
  session: string | null;
  tool: string;
}

/** Tool execution end */
export interface ToolEndMessage {
  type: 'tool_end';
  agent: string;
  session: string | null;
  tool: string;
}

/** Tool execution error */
export interface ToolErrorMessage {
  type: 'tool_error';
  agent: string;
  session: string | null;
  tool: string;
  error: string;
}

/** Token usage statistics */
export interface TokenUsageMessage {
  type: 'token_usage';
  agent: string;
  session: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  cost_usd: number;
}

/** Turn receipt (detailed cost/info) */
export interface TurnReceiptMessage {
  type: 'turn_receipt';
  agent_id: string;
  session_id?: string;
  turn_id?: string;
  timestamp: number;
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model_calls: number;
  reply_summary?: string;
  model_id?: string;
  estimated_cost_usd?: number;
}

/** Delegation progress (from delegate tool) */
export interface DelegationProgressMessage {
  type: 'delegation_progress';
  delegate_agent: string;
  delegate_session: string;
  event_type: string;
  detail: Record<string, unknown>;
}

/** Cron job executed */
export interface CronJobExecutedMessage {
  type: 'cron_job_executed';
  success: boolean;
  job_id: string;
  agent_id?: string;
}

/** Agent status changed */
export interface AgentStatusChangedMessage {
  type: 'agent_status_changed';
  agent_id: string;
  has_heartbeat?: boolean;
  status?: 'online' | 'offline' | string;
}

/** Heartbeat message */
export interface HeartbeatMessage {
  type: 'heartbeat';
  agent_id?: string;
  has_heartbeat?: boolean;
}

/** Session event (created, updated, etc) */
export interface SessionEventMessage {
  type: 'session_event';
  event: 'created' | 'updated' | 'closed' | string;
  session_id?: string;
  agent_id?: string;
}

/** Skill activated */
export interface SkillActivatedMessage {
  type: 'skill_activated';
  skill_name: string;
  agent_id?: string;
}

/** Skill deactivated */
export interface SkillDeactivatedMessage {
  type: 'skill_deactivated';
  skill_name: string;
  agent_id?: string;
}

/** Gateway command forwarded */
export interface GatewayCommandForwardedMessage {
  type: 'gateway_command_forwarded';
  agent: string;
  content: string;
}

/** Error message */
export interface ErrorMessage {
  type: 'error';
  message: string;
  agent?: string;
  agent_id?: string;
  error?: string;
}

/** Shutdown message */
export interface ShutdownMessage {
  type: 'shutdown';
}

/** Compact summary (from slash command) */
export interface CompactSummaryMessage {
  type: 'compact_summary';
  [key: string]: unknown;
}

// ============================================================================
// Union Type of All Incoming Messages
// ============================================================================

export type WebSocketMessage =
  | AgentListMessage
  | SessionCreatedMessage
  | SessionTitleMessage
  | TypingStartMessage
  | TypingStopMessage
  | SessionMessage
  | StreamDeltaMessage
  | AgentReplyMessage
  | AgentRichReplyMessage
  | SlashResponseMessage
  | SlashErrorMessage
  | ToolStartMessage
  | ToolEndMessage
  | ToolErrorMessage
  | TokenUsageMessage
  | TurnReceiptMessage
  | DelegationProgressMessage
  | CronJobExecutedMessage
  | AgentStatusChangedMessage
  | HeartbeatMessage
  | SessionEventMessage
  | SkillActivatedMessage
  | SkillDeactivatedMessage
  | GatewayCommandForwardedMessage
  | ErrorMessage
  | ShutdownMessage
  | CompactSummaryMessage;

// ============================================================================
// Outgoing WebSocket Messages (Frontend → Backend)
// ============================================================================

/** Chat command message */
export interface ChatCommandMessage {
  command: string;
  target_agent: string;
  session_id?: string;
  images?: string[];
}

/** Stop streaming message */
export interface StopCommandMessage {
  type: 'stop';
  target_agent: string;
}

/** Test message (for agent testing) */
export interface TestMessage {
  type: 'test_message';
  agent_id: string;
  content: string;
  session_id: string;
}

/** Union type for all outgoing messages */
export type WebSocketOutgoingMessage =
  | ChatCommandMessage
  | StopCommandMessage
  | TestMessage
  | Record<string, unknown>; // Allow extensibility for future message types

// ============================================================================
// Type Guards for Runtime Type Narrowing
// ============================================================================

export function isWebSocketMessage(value: unknown): value is WebSocketMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}

export function isAgentListMessage(msg: WebSocketMessage): msg is AgentListMessage {
  return msg.type === 'agent_list';
}

export function isSessionCreatedMessage(msg: WebSocketMessage): msg is SessionCreatedMessage {
  return msg.type === 'session_created';
}

export function isSessionTitleMessage(msg: WebSocketMessage): msg is SessionTitleMessage {
  return msg.type === 'session_title';
}

export function isTypingStartMessage(msg: WebSocketMessage): msg is TypingStartMessage {
  return msg.type === 'typing_start';
}

export function isTypingStopMessage(msg: WebSocketMessage): msg is TypingStopMessage {
  return msg.type === 'typing_stop';
}

export function isSessionMessage(msg: WebSocketMessage): msg is SessionMessage {
  return msg.type === 'session_message';
}

export function isStreamDeltaMessage(msg: WebSocketMessage): msg is StreamDeltaMessage {
  return msg.type === 'stream_delta';
}

export function isAgentReplyMessage(msg: WebSocketMessage): msg is AgentReplyMessage {
  return msg.type === 'agent_reply';
}

export function isSlashResponseMessage(msg: WebSocketMessage): msg is SlashResponseMessage {
  return msg.type === 'slash_response';
}

export function isSlashErrorMessage(msg: WebSocketMessage): msg is SlashErrorMessage {
  return msg.type === 'slash_error';
}

export function isErrorMessage(msg: WebSocketMessage): msg is ErrorMessage {
  return msg.type === 'error';
}

export function isCronJobExecutedMessage(msg: WebSocketMessage): msg is CronJobExecutedMessage {
  return msg.type === 'cron_job_executed';
}

export function isAgentStatusChangedMessage(msg: WebSocketMessage): msg is AgentStatusChangedMessage {
  return msg.type === 'agent_status_changed';
}

export function isHeartbeatMessage(msg: WebSocketMessage): msg is HeartbeatMessage {
  return msg.type === 'heartbeat';
}

export function isSessionEventMessage(msg: WebSocketMessage): msg is SessionEventMessage {
  return msg.type === 'session_event';
}

export function isSkillActivatedMessage(msg: WebSocketMessage): msg is SkillActivatedMessage {
  return msg.type === 'skill_activated';
}

export function isSkillDeactivatedMessage(msg: WebSocketMessage): msg is SkillDeactivatedMessage {
  return msg.type === 'skill_deactivated';
}

export function isTokenUsageMessage(msg: WebSocketMessage): msg is TokenUsageMessage {
  return msg.type === 'token_usage';
}

export function isToolStartMessage(msg: WebSocketMessage): msg is ToolStartMessage {
  return msg.type === 'tool_start';
}

export function isToolEndMessage(msg: WebSocketMessage): msg is ToolEndMessage {
  return msg.type === 'tool_end';
}

export function isToolErrorMessage(msg: WebSocketMessage): msg is ToolErrorMessage {
  return msg.type === 'tool_error';
}

export function isTurnReceiptMessage(msg: WebSocketMessage): msg is TurnReceiptMessage {
  return msg.type === 'turn_receipt';
}

export function isDelegationProgressMessage(msg: WebSocketMessage): msg is DelegationProgressMessage {
  return msg.type === 'delegation_progress';
}

export function isAgentRichReplyMessage(msg: WebSocketMessage): msg is AgentRichReplyMessage {
  return msg.type === 'agent_rich_reply';
}
