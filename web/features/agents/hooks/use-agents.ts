'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchApi } from '@/shared/api/client';
import { STALE_TIME, GC_TIME, REFETCH_INTERVAL } from '@/lib/query-config';
import { Agent, RawAgent } from '../types';
import { transformAgent } from '../utils';

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
    staleTime: STALE_TIME.NORMAL,
    gcTime: GC_TIME.SHORT,
    refetchInterval: REFETCH_INTERVAL.LONG,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load agents: ${error.message}`);
    }
  }, [error]);

  return {
    agents: data || [],
    isLoading,
    error: error || null,
  };
}
