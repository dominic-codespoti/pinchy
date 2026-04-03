'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { toast } from 'sonner';
import { Agent, RawAgent } from '../types';
import { transformAgentDetail } from '../utils';

const STALE_TIME = 10 * 1000; // 10 seconds
const GC_TIME = 5 * 60 * 1000; // 5 minutes

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
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });

  // Show toast for errors
  if (error) {
    toast.error(`Failed to load agent: ${error.message}`);
  }

  return {
    agent: data || null,
    isLoading,
    error: error || null,
  };
}
