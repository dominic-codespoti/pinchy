'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { toast } from 'sonner';
import { GC_TIME } from '@/lib/query-config';

interface AgentFileResponse {
  filename: string;
  content: string;
}

async function fetchAgentFile(agentId: string, filename: string): Promise<string | null> {
  try {
    const response = await fetchApi<AgentFileResponse>(
      `/api/agents/${agentId}/files/${filename}`
    );
    return response.content;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export interface UseAgentFileResult {
  content: string | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAgentFile(agentId: string, filename: string): UseAgentFileResult {
  const { data, isLoading, error } = useQuery<string | null, Error>({
    queryKey: ['agents', agentId, 'files', filename],
    queryFn: () => fetchAgentFile(agentId, filename),
    gcTime: GC_TIME.SHORT,
    enabled: !!agentId && !!filename,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load file ${filename}: ${error.message}`);
    }
  }, [error, filename]);

  return {
    content: data ?? null,
    isLoading,
    error: error || null,
  };
}
