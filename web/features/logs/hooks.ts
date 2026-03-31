/**
 * Logs feature React Query hooks
 */

import { useQuery } from '@tanstack/react-query';
import { getAgentLogs, getSystemLogs } from './api';
import { LogEntry } from '@/shared/types/common';

export function useAgentLogs(agentId: string, limit?: number) {
  return useQuery<LogEntry[], Error>({
    queryKey: ['agents', agentId, 'logs', limit],
    queryFn: () => getAgentLogs(agentId, limit),
    staleTime: 5000,
    enabled: !!agentId,
    refetchInterval: 5000,
  });
}

export function useSystemLogs(limit?: number) {
  return useQuery<LogEntry[], Error>({
    queryKey: ['logs', 'system', limit],
    queryFn: () => getSystemLogs(limit),
    staleTime: 5000,
    refetchInterval: 5000,
  });
}
