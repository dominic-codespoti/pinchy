'use client';

/**
 * Logs feature React Query hooks
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME, REFETCH_INTERVAL } from '@/lib/query-config';
import { getAgentLogs, getSystemLogs, getRecentSystemLogs } from './api';
import { LogEntry } from '@/shared/types/common';
import { logsKeys } from './query-keys';

export function useAgentLogs(agentId: string, limit?: number) {
  const { data, isLoading, error } = useQuery<LogEntry[], Error>({
    queryKey: logsKeys.agentWithLimit(agentId, limit),
    queryFn: () => getAgentLogs(agentId, limit),
    staleTime: STALE_TIME.SHORT,
    enabled: !!agentId,
    refetchInterval: STALE_TIME.SHORT,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load agent logs: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

export function useSystemLogs(limit?: number) {
  const { data, isLoading, error } = useQuery<LogEntry[], Error>({
    queryKey: logsKeys.systemWithLimit(limit),
    queryFn: () => getSystemLogs(limit),
    staleTime: STALE_TIME.SHORT,
    refetchInterval: STALE_TIME.SHORT,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load system logs: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

/**
 * Hook for real-time recent logs from in-memory buffer.
 * Faster but logs are lost on server restart.
 */
export function useRecentSystemLogs(limit?: number) {
  const { data, isLoading, error } = useQuery<LogEntry[], Error>({
    queryKey: logsKeys.recentWithLimit(limit),
    queryFn: () => getRecentSystemLogs(limit),
    staleTime: STALE_TIME.REALTIME,
    refetchInterval: REFETCH_INTERVAL.REALTIME,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load recent logs: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}
