'use client';

import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { STALE_TIME, GC_TIME } from '@/lib/query-config';
import { Agent } from '../types';
import { RawAgent } from '@/lib/validation/schemas';
import { transformAgentDetail } from '../utils';
import { useQueryWithToast } from '@/shared/hooks/use-query-with-toast';
import { agentsKeys } from '../query-keys';

async function fetchAgent(id: string): Promise<Agent | null> {
  try {
    const response = await fetchApi<RawAgent>(`/api/agents/${id}`);
    return transformAgentDetail(response, id);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export interface UseAgentResult {
  agent: Agent | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAgent(id: string): UseAgentResult {
  const { data, isLoading, error } = useQueryWithToast<Agent | null>(
    agentsKeys.detail(id),
    () => fetchAgent(id),
    'Failed to load agent',
    {
      staleTime: STALE_TIME.MEDIUM,
      gcTime: GC_TIME.SHORT,
      enabled: !!id,
    }
  );

  return {
    agent: data || null,
    isLoading,
    error: error || null,
  };
}
