'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { getAgents } from './api';
import { getUsage, transformUsageData } from './api/usage-api';
import { TimeRange } from './types';

export function useAgents() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 'agents'],
    queryFn: getAgents,
    staleTime: STALE_TIME.SHORT,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load agents: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

export function useUsage(timeRange: TimeRange, agent?: string, model?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 'usage', timeRange, agent, model],
    queryFn: async () => {
      const response = await getUsage(timeRange, agent, model);
      return transformUsageData(response.usage);
    },
    staleTime: STALE_TIME.NORMAL,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load usage data: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}
