'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { toast } from 'sonner';
import { STALE_TIME, GC_TIME } from '@/lib/query-config';
import { Agent, RawAgent } from '../types';
import { transformAgentDetail } from '../utils';

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
  const { data, isLoading, error } = useQuery<Agent | null, Error>({
    queryKey: ['agents', id],
    queryFn: () => fetchAgent(id),
    staleTime: STALE_TIME.MEDIUM,
    gcTime: GC_TIME.SHORT,
    enabled: !!id,
  });

  // Show toast for errors
  useEffect(() => {
    if (error) {
      toast.error(`Failed to load agent: ${error.message}`);
    }
  }, [error]);

  return {
    agent: data || null,
    isLoading,
    error: error || null,
  };
}
