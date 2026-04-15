/**
 * Pinchy agent chat feature types
 * Mirrors the Rust backend types in src/gateway/handlers/pinchy.rs
 */

// ============================================================================
// Context Types
// ============================================================================

/**
 * Conversation context passed to the Pinchy agent
 * Matches the Rust ConversationContext struct in src/comm/mod.rs
 */
export interface PinchyConversationContext {
  /** Scope type: "agent" or "group" */
  scope_type: 'agent' | 'group';
  /** Target agent ID (when scope_type is "agent") */
  agent_id?: string;
  /** Group ID (when scope_type is "group") */
  group_id?: string;
  /** Group name for display */
  group_name?: string;
  /** Agent IDs in the group */
  group_agent_ids?: string[];
}

/** Legacy type alias for backward compatibility */
export type AssistantScope = PinchyConversationContext;

// ============================================================================
// Message Types
// ============================================================================

export interface PinchyMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Legacy type alias for backward compatibility */
export type AssistantMessage = PinchyMessage;

export interface ChatMessage extends PinchyMessage {
  id: string;
  timestamp: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface PinchyChatRequest {
  /** User message */
  message: string;
  /** Optional conversation context (agent or group scope) */
  context?: PinchyConversationContext;
  /** Optional session ID for continuing conversations */
  session_id?: string;
  /** Optional conversation history (reserved for future use) */
  history?: PinchyMessage[];
}

export interface PinchyChatResponse {
  /** Agent reply */
  reply: string;
  /** Session ID for continuing the conversation */
  session_id: string;
  /** The agent ID that handled the request (always "pinchy") */
  agent_id: string;
}

/** Legacy type aliases for backward compatibility */
export type AssistantChatRequest = PinchyChatRequest;
export type AssistantChatResponse = PinchyChatResponse;

// ============================================================================
// UI Types
// ============================================================================

export type PinchyContext =
  | { type: 'agent'; agentId: string; agentName: string }
  | { type: 'group'; groupId: string; groupName: string; agentIds: string[] }
  | { type: 'global' };

/** Legacy type alias for backward compatibility */
export type AssistantContext = PinchyContext;

// ============================================================================
// Deprecated Types (kept for type compatibility during transition)
// ============================================================================

/** @deprecated No longer used with real Pinchy agent flow */
export interface ProposedAction {
  action_type: string;
  description: string;
  params: Record<string, unknown>;
}

/** @deprecated No longer used with real Pinchy agent flow */
export interface ActionRequest {
  action_type: string;
  params: Record<string, unknown>;
}

/** @deprecated No longer used with real Pinchy agent flow */
export interface ActionResult {
  action_type: string;
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/** @deprecated Use PinchyChatRequest instead */
export interface AssistantApplyRequest {
  actions: ActionRequest[];
  scope: AssistantScope;
}

/** @deprecated No longer used with real Pinchy agent flow */
export interface AssistantApplyResponse {
  results: ActionResult[];
  all_succeeded: boolean;
}
