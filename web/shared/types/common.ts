/**
 * Shared types used across multiple features
 * Only include types that are truly shared (used by 2+ features)
 */

// ============================================================================
// Message Types (used by chat, sessions, agents)
// ============================================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  exchange_id?: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  turn_receipt?: TurnReceipt;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

export interface ToolCallRecord {
  tool: string;
  args_summary: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

export interface TokenUsageSummary {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
}

export interface ModelCallDetail {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  cost_usd?: number;
  latency_ms: number;
}

export interface TurnReceipt {
  agent: string;
  session?: string;
  started_at: number;
  duration_ms: number;
  user_prompt: string;
  tool_calls: ToolCallRecord[];
  tokens: TokenUsageSummary;
  model_calls: number;
  reply_summary: string;
  model_id: string;
  estimated_cost_usd?: number;
  call_details: ModelCallDetail[];
}

// ============================================================================
// Log Types (used by logs feature)
// ============================================================================

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  agentId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RawLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  agent_id?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// UI Types
// ============================================================================

export type StatusPillVariant = 'online' | 'offline' | 'degraded' | 'error' | 'unknown' | 'pending';
