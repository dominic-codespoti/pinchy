import { fetchApi, ApiError } from '@/shared/api/client';
import { DashboardAgent, DashboardCronJob, RawAgent, RawCronJob } from './types';

export type { ApiError };

// Backend cron job shape
interface BackendCronJob {
  id: string;
  agent_id: string;
  name: string;
  schedule: string;
  message?: string;
  last_status?: string | null;
}

// Transform functions to convert raw API data to dashboard-friendly format
function transformAgent(raw: RawAgent): DashboardAgent {
  const hasHeartbeat = Boolean(raw.has_heartbeat);
  const lastHeartbeatAt = hasHeartbeat
    ? new Date().toISOString()
    : undefined;

  return {
    id: raw.id,
    name: raw.id,
    status: hasHeartbeat ? 'active' : 'inactive',
    hasHeartbeat,
    lastHeartbeatAt,
    config: { model: raw.model },
  };
}

function transformCronJob(raw: BackendCronJob): DashboardCronJob {
  return {
    id: raw.id,
    agentId: raw.agent_id,
    schedule: raw.schedule,
    message: raw.message ?? '',
    lastStatus: raw.last_status !== 'disabled',
  };
}

export async function getDashboardAgents(): Promise<DashboardAgent[]> {
  const response = await fetchApi<{ agents: RawAgent[] }>('/api/agents');
  return response.agents.map(transformAgent);
}

export async function getDashboardCronJobs(): Promise<DashboardCronJob[]> {
  const response = await fetchApi<{ jobs: BackendCronJob[] }>('/api/cron/jobs');
  return response.jobs.map(transformCronJob);
}
