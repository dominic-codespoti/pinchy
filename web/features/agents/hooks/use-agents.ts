'use client';

import { fetchApi } from '@/shared/api/client';
import type { AgentsListResponse } from '@/src/lib/bindings';
import { STALE_TIME, GC_TIME, REFETCH_INTERVAL } from '@/lib/query-config';
import { Agent, AgentListItem } from '../types';
import { transformAgent } from '../utils';
import { useQueryWithToast } from '@/shared/hooks/use-query-with-toast';
import { agentsKeys } from '../query-keys';

async function fetchAgents(): Promise<Agent[]> {
  const response = await fetchApi<AgentsListResponse>('/api/agents');
  return (response.agents || []).map(transformAgent);
}

export interface UseAgentsResult {
  agents: Agent[];
  isLoading: boolean;
  error: Error | null;
}

export function useAgents(): UseAgentsResult {
  const { data, isLoading, error } = useQueryWithToast<Agent[]>(
    agentsKeys.lists(),
    fetchAgents,
    'Failed to load agents',
    {
      staleTime: STALE_TIME.NORMAL,
      gcTime: GC_TIME.SHORT,
      refetchInterval: REFETCH_INTERVAL.LONG,
    }
  );

  return {
    agents: data || [],
    isLoading,
    error: error || null,
  };
}
