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

// ============================================================================
// Log Types (used by logs, admin)
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
