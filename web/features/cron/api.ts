/**
 * Cron feature API functions
 */

import { fetchApi } from '@/shared/api/client';
import {
  CronJob,
  BackendCronJob,
  CronAgent,
  CreateCronJobInput,
  UpdateCronJobInput,
} from './types';

function transformCronJob(raw: BackendCronJob): CronJob {
  return {
    id: raw.id,
    agentId: raw.agent_id,
    schedule: raw.schedule,
    message: raw.message ?? '',
    lastStatus: raw.last_status !== 'disabled',
    lastRun: undefined,
    nextRun: undefined,
  };
}

export async function getCronJobs(): Promise<CronJob[]> {
  const response = await fetchApi<{ jobs: BackendCronJob[] }>('/api/cron/jobs');
  return response.jobs.map(transformCronJob);
}

export async function getCronAgents(): Promise<CronAgent[]> {
  // Minimal agent info for cron feature dropdown
  const response = await fetchApi<{ agents: { id: string; model?: string }[] }>('/api/agents');
  return response.agents.map((a) => ({
    id: a.id,
    name: a.id, // Use id as name for now
  }));
}

export async function createCronJob(data: CreateCronJobInput): Promise<CronJob> {
  const response = await fetchApi<{
    job_id: string;
    name: string;
    agent_id: string;
    schedule: string;
    message: string;
    created_at: number;
  }>('/api/cron/jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return {
    id: response.job_id,
    agentId: response.agent_id,
    schedule: response.schedule,
    message: response.message,
    lastStatus: true,
    lastRun: undefined,
    nextRun: undefined,
  };
}

export async function updateCronJob(
  id: string,
  data: UpdateCronJobInput
): Promise<CronJob> {
  const response = await fetchApi<BackendCronJob>(`/api/cron/jobs/${id}/update`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return transformCronJob(response);
}

export async function deleteCronJob(id: string): Promise<void> {
  await fetchApi<{ deleted: boolean; job_id: string }>(`/api/cron/jobs/${id}/delete`, {
    method: 'DELETE',
  });
}

export async function toggleCronJob(id: string, enabled: boolean): Promise<CronJob> {
  const response = await fetchApi<BackendCronJob>(`/api/cron/jobs/${id}/update`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
  return transformCronJob(response);
}
