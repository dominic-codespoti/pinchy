import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Memory, RawMemory, MemoryListResponse } from './types';

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

export async function getAgentMemories(agentId: string, search?: string): Promise<Memory[]> {
  try {
    const queryParams = search ? `?q=${encodeURIComponent(search)}` : '';
    const response = await fetchApi<MemoryListResponse>(`/api/agents/${agentId}/memory${queryParams}`);
    return (response.entries || []).map((entry) => transformMemory(entry, agentId));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export async function searchMemories(agentId: string, query: string): Promise<Memory[]> {
  return getAgentMemories(agentId, query);
}

export async function addMemory(agentId: string, content: string, category?: string): Promise<Memory> {
  // NOTE: Backend has no POST endpoint for memory creation.
  // Memories are only created via the save_memory tool during agent execution.
  // This function is disabled and will throw an error.
  throw new Error(
    'Direct memory creation is not supported. ' +
    'Memories are created automatically via the save_memory tool during agent execution.'
  );
}

export async function deleteMemory(memoryId: string): Promise<void> {
  // memoryId format should be "agent_id/key"
  const parts = memoryId.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid memory ID format. Expected: agent_id/key');
  }
  const [agentId, key] = parts;
  await fetchApi<{ deleted: boolean }>(`/api/agents/${agentId}/memory/${key}`, {
    method: 'DELETE',
  });
}
