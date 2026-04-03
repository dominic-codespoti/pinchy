'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Agent, RawAgent } from '../types';
import { transformAgent } from '../utils';

const STALE_TIME = 30 * 1000; // 30 seconds
const GC_TIME = 5 * 60 * 1000; // 5 minutes
const REFETCH_INTERVAL = 30 * 1000; // 30 seconds polling

interface AgentsListResponse {
  agents: RawAgent[];
}

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
  const { data, isLoading, error } = useQuery<Agent[], Error>({
    queryKey: ['agents'],
    queryFn: fetchAgents,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchInterval: REFETCH_INTERVAL,
  });

  return {
    agents: data || [],
    isLoading,
    error: error || null,
  };
}
