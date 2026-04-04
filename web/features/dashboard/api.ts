import { fetchApi, ApiError } from '@/shared/api/client';
import type { AgentListItem, CronJobItem } from '@/src/lib/bindings';
import { DashboardAgent, DashboardCronJob, DashboardSession, HealthResponse } from './types';

export type { DashboardAgent, DashboardCronJob, DashboardSession, HealthResponse } from './types';
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

export async function getHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/api/health');
}
