'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { toast } from 'sonner';
import { HeartbeatStatusData, RawHeartbeatStatus } from '../types';

const GC_TIME = 5 * 60 * 1000; // 5 minutes
const REFETCH_INTERVAL = 10 * 1000; // 10 seconds polling

function transformHeartbeatStatus(raw: RawHeartbeatStatus): HeartbeatStatusData {
  return {
    agentId: raw.agent_id,
    enabled: raw.enabled,
    health: raw.health as 'OK' | 'MISSED' | string,
    lastTick: raw.last_tick,
    nextTick: raw.next_tick,
    intervalSecs: raw.interval_secs,
    messagePreview: raw.message_preview,
    latestSession: typeof raw.latest_session === 'string' 
      ? { id: raw.latest_session } 
      : raw.latest_session,
  };
}

async function fetchAgentHeartbeat(agentId: string): Promise<HeartbeatStatusData | null> {
  try {
    const response = await fetchApi<RawHeartbeatStatus>(`/api/heartbeat/status/${agentId}`);
    return transformHeartbeatStatus(response);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export interface UseAgentHeartbeatResult {
  heartbeat: HeartbeatStatusData | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAgentHeartbeat(agentId: string): UseAgentHeartbeatResult {
  const { data, isLoading, error } = useQuery<HeartbeatStatusData | null, Error>({
    queryKey: ['agents', agentId, 'heartbeat'],
    queryFn: () => fetchAgentHeartbeat(agentId),
    gcTime: GC_TIME,
    refetchInterval: REFETCH_INTERVAL,
    enabled: !!agentId,
  });

  if (error) {
    toast.error(`Failed to load heartbeat status: ${error.message}`);
  }

  return {
    heartbeat: data ?? null,
    isLoading,
    error: error || null,
  };
}
