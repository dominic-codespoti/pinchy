'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { toast } from 'sonner';
import { Memory, RawMemory } from '../types';

const GC_TIME = 5 * 60 * 1000; // 5 minutes

interface MemoriesResponse {
  entries: RawMemory[];
}

function transformMemory(raw: RawMemory, agentId: string): Memory {
  return {
    id: raw.key,
    agentId,
    content: raw.value,
    category: raw.tags?.[0],
    tags: raw.tags ?? [],
    timestamp: raw.timestamp,
    score: raw.score,
  };
}

async function fetchAgentMemories(agentId: string, search?: string): Promise<Memory[]> {
  try {
    const queryParams = search ? `?q=${encodeURIComponent(search)}` : '';
    const response = await fetchApi<MemoriesResponse>(
      `/api/agents/${agentId}/memory${queryParams}`
    );
    return (response.entries || []).map((entry) => transformMemory(entry, agentId));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export interface UseAgentMemoriesResult {
  memories: Memory[];
  isLoading: boolean;
  error: Error | null;
}

export function useAgentMemories(agentId: string, search?: string): UseAgentMemoriesResult {
  const { data, isLoading, error } = useQuery<Memory[], Error>({
    queryKey: ['agents', agentId, 'memories', search || 'all'],
    queryFn: () => fetchAgentMemories(agentId, search),
    gcTime: GC_TIME,
    enabled: !!agentId,
  });

  if (error) {
    toast.error(`Failed to load memories: ${error.message}`);
  }

  return {
    memories: data || [],
    isLoading,
    error: error || null,
  };
}
