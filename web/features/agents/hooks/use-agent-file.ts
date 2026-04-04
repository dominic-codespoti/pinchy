'use client';

import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { GC_TIME } from '@/lib/query-config';
import { useQueryWithToast } from '@/shared/hooks/use-query-with-toast';
import { agentsKeys } from '../query-keys';

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
  const { data, isLoading, error } = useQueryWithToast<string | null>(
    agentsKeys.file(agentId, filename),
    () => fetchAgentFile(agentId, filename),
    `Failed to load file ${filename}`,
    {
      gcTime: GC_TIME.SHORT,
      enabled: !!agentId && !!filename,
    }
  );

  return {
    content: data ?? null,
    isLoading,
    error: error || null,
  };
}
