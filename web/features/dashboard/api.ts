import { fetchApi, ApiError } from '@/shared/api/client';
import {
  DashboardSessionDiagnosticsApiResponseSchema,
  DashboardSessionDiagnosticsReceiptModelCallsResponseSchema,
} from '@/lib/validation/schemas';
import type { AgentListItem, CronJobItem } from '@/src/lib/bindings';
import type { ToolCall, ToolResult } from '@/shared/types/common';
import {
  DashboardAgent,
  DashboardCronJob,
  DashboardSession,
  DashboardSessionDiagnosticsApiResponse,
  DashboardSessionDiagnosticsRawTurn,
  DashboardSessionDiagnosticsResponse,
  DashboardSessionDiagnosticsReceiptModelCallsResponse,
  DashboardSessionDiagnosticsTurn,
  HealthResponse,
} from './types';

export type {
  DashboardAgent,
  DashboardCronJob,
  DashboardSession,
  DashboardSessionDiagnosticsApiResponse,
  DashboardSessionDiagnosticsResponse,
  DashboardSessionDiagnosticsReceiptModelCallsResponse,
  DashboardSessionDiagnosticsTurn,
  HealthResponse,
} from './types';
export type { ApiError };

// Backend cron job type - use canonical CronJobItem from bindings
export type BackendCronJob = CronJobItem;

// Transform functions to convert raw API data to dashboard-friendly format
function transformAgent(raw: AgentListItem): DashboardAgent {
  const hasHeartbeat = Boolean(raw.has_heartbeat);
  // Use real heartbeat timestamp from backend (unix seconds -> ISO string)
  const lastHeartbeatAt = hasHeartbeat && raw.last_heartbeat_at
    ? new Date(Number(raw.last_heartbeat_at) * 1000).toISOString()
    : undefined;

  return {
    id: raw.id,
    name: raw.id,
    status: hasHeartbeat ? 'active' : 'inactive',
    hasHeartbeat,
    lastHeartbeatAt,
    config: { model: raw.model ?? undefined },
  };
}

function transformCronJob(raw: CronJobItem): DashboardCronJob {
  return {
    id: raw.id,
    agentId: raw.agent_id,
    schedule: raw.schedule,
    message: raw.message ?? '',
    lastStatus: raw.last_status !== 'disabled',
  };
}

export async function getDashboardAgents(): Promise<DashboardAgent[]> {
  const response = await fetchApi<{ agents: AgentListItem[] }>('/api/agents');
  return response.agents.map(transformAgent);
}

export async function getDashboardCronJobs(): Promise<DashboardCronJob[]> {
  const response = await fetchApi<{ jobs: BackendCronJob[] }>('/api/cron/jobs');
  return response.jobs.map(transformCronJob);
}

// Backend response shape for global sessions endpoint
interface BackendSession {
  id: string;
  agent_id: string;
  title?: string;
  message_count: number;
  updated_at: number;
}

// Transform function to convert backend session to dashboard format
function transformSession(raw: BackendSession): DashboardSession {
  return {
    id: raw.id,
    agent_id: raw.agent_id,
    title: raw.title,
    message_count: raw.message_count,
    updated_at: raw.updated_at,
  };
}

export async function getDashboardSessions(): Promise<DashboardSession[]> {
  const response = await fetchApi<{ sessions: BackendSession[] }>('/api/sessions');
  return response.sessions.map(transformSession);
}

interface RawFunctionToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

function normalizeRole(role: string): DashboardSessionDiagnosticsTurn['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return role;
  }

  return 'system';
}

function normalizeTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function parseToolArguments(argumentsValue: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!argumentsValue) {
    return {};
  }

  if (typeof argumentsValue === 'string') {
    try {
      const parsed = JSON.parse(argumentsValue) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : { value: parsed };
    } catch {
      return { raw: argumentsValue };
    }
  }

  return argumentsValue;
}

function normalizeToolCalls(toolCalls: unknown[] | null | undefined): ToolCall[] | undefined {
  const normalized = (toolCalls ?? [])
    .map((toolCall, index) => {
      if (!toolCall || typeof toolCall !== 'object') {
        return null;
      }

      const rawToolCall = toolCall as RawFunctionToolCall;
      if (!rawToolCall.function?.name) {
        return null;
      }

      return {
        id: rawToolCall.id ?? `tool-call-${index}`,
        name: rawToolCall.function.name,
        arguments: parseToolArguments(rawToolCall.function.arguments),
      } satisfies ToolCall;
    })
    .filter((toolCall): toolCall is ToolCall => toolCall !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeDiagnosticsTurns(turns: DashboardSessionDiagnosticsRawTurn[]): DashboardSessionDiagnosticsTurn[] {
  const normalizedTurns: DashboardSessionDiagnosticsTurn[] = [];

  turns.forEach((turn, index) => {
    if (turn.role === 'tool') {
      if (!turn.tool_call_id || turn.content.length === 0) {
        return;
      }

      const toolResult: ToolResult = {
        tool_call_id: turn.tool_call_id,
        content: turn.content,
      };

      const targetTurn = [...normalizedTurns]
        .reverse()
        .find((candidate) => candidate.tool_calls?.some((toolCall) => toolCall.id === toolResult.tool_call_id));

      if (targetTurn) {
        targetTurn.tool_results = [...(targetTurn.tool_results ?? []), toolResult];
      }

      return;
    }

    normalizedTurns.push({
      id: turn.id || `${turn.timestamp}-${index}-${turn.role}`,
      exchange_id: turn.exchange_id,
      timestamp: normalizeTimestamp(turn.timestamp),
      role: normalizeRole(turn.role),
      content: turn.content,
      tool_calls: normalizeToolCalls(turn.tool_calls),
      turn_receipt: turn.turn_receipt,
    });
  });

  return normalizedTurns;
}

export async function getSessionReceiptModelCalls(
  sessionId: string,
  receiptId: number
): Promise<DashboardSessionDiagnosticsReceiptModelCallsResponse> {
  return DashboardSessionDiagnosticsReceiptModelCallsResponseSchema.parse(
    await fetchApi<DashboardSessionDiagnosticsReceiptModelCallsResponse>(
      `/api/sessions/${sessionId}/diagnostics/receipts/${receiptId}/model-calls`
    )
  );
}

export async function getSessionDiagnostics(sessionId: string): Promise<DashboardSessionDiagnosticsResponse> {
  const response = DashboardSessionDiagnosticsApiResponseSchema.parse(
    await fetchApi<DashboardSessionDiagnosticsApiResponse>(`/api/sessions/${sessionId}/diagnostics`)
  );

  return {
    ...response,
    turns: normalizeDiagnosticsTurns(response.turns),
  };
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/api/health');
}
