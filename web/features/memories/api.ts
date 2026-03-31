import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Memory, RawMemory, MemoryListResponse } from './types';

function transformMemory(raw: RawMemory): Memory {
  return {
    id: raw.id,
    agentId: raw.agent_id,
    content: raw.content,
    category: raw.category,
    timestamp: raw.timestamp,
  };
}

export async function getAgentMemories(agentId: string, search?: string): Promise<Memory[]> {
  try {
    const queryParams = search ? `?q=${encodeURIComponent(search)}` : '';
    const response = await fetchApi<MemoryListResponse>(`/api/agents/${agentId}/memory${queryParams}`);
    return (response.entries || []).map(transformMemory);
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
  const response = await fetchApi<RawMemory>(`/api/agents/${agentId}/memory`, {
    method: 'POST',
    body: JSON.stringify({ content, category }),
  });
  return transformMemory(response);
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
