import { fetchApi } from '@/shared/api/client';
import { Agent } from '@/features/agents/types';

export async function getAgents(): Promise<Agent[]> {
  return fetchApi<Agent[]>('/api/agents');
}
