import { LucideIcon } from 'lucide-react';
import type { AgentListItem } from '@/src/lib/bindings';
import type { ModelCallTrace, PromptSnapshot, ToolCall, ToolResult, TurnReceipt } from '@/shared/types/common';

export type { AgentListItem } from '@/src/lib/bindings';

export interface StatItem {
  id: string;
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

// Health check response from backend - re-export from canonical source
export type { HealthResponse } from '@/src/lib/bindings';

// Dashboard-specific Agent type (minimal fields needed)
export interface DashboardAgent {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  hasHeartbeat?: boolean;
  lastHeartbeatAt?: string;
  config: { model?: string };
}

// Dashboard-specific CronJob type (minimal fields needed)
export interface DashboardCronJob {
  id: string;
  agentId: string;
  schedule: string;
  message: string;
  lastStatus: boolean;
}

// RawCronJob type - re-export from cron feature for consistency
export type { RawCronJob } from '@/features/cron/types';

// Dashboard session type for activity feed
export interface DashboardSession {
  id: string;
  agent_id: string;
  title?: string;
  message_count: number;
  updated_at: number; // epoch milliseconds
}

export interface DashboardSessionDiagnosticsSession {
  id: string;
  agent_id: string;
  title?: string;
  message_count: number;
  updated_at: number;
}

export interface DashboardSessionDiagnosticsSummary {
  total_turns: number;
  assistant_turns: number;
  tool_call_count: number;
  total_tokens: number;
  reasoning_tokens: number;
  estimated_cost_usd: number;
}

export interface DashboardSessionDiagnosticsRawTurn {
  id: string;
  exchange_id?: number;
  timestamp: number;
  role: string;
  content: string;
  tool_calls?: unknown[] | null;
  tool_call_id?: string;
  turn_receipt?: TurnReceipt;
}

export interface DashboardSessionDiagnosticsApiResponse {
  session: DashboardSessionDiagnosticsSession;
  summary: DashboardSessionDiagnosticsSummary;
  turns: DashboardSessionDiagnosticsRawTurn[];
}

export interface DashboardSessionDiagnosticsResponse {
  session: DashboardSessionDiagnosticsSession;
  summary: DashboardSessionDiagnosticsSummary;
  turns: DashboardSessionDiagnosticsTurn[];
}

export interface DashboardSessionDiagnosticsTurn {
  id: string;
  exchange_id?: number;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  turn_receipt?: TurnReceipt;
}

export interface DashboardSessionDiagnosticsReceiptModelCallsResponse {
  session_id: string;
  receipt_id: number;
  model_calls?: ModelCallTrace[];
}

export type DashboardPromptSnapshot = PromptSnapshot;
