/**
 * Memory API - Agent memory operations
 * Endpoints from src/gateway/handlers/memory.rs
 */

import { fetchApi } from '@/shared/api/client';
import { PAGINATION } from '@/lib/query-config';
import { MemoryListResponseSchema, MemoryDeleteResponseSchema, MemoryItem } from '@/lib/validation/schemas';
import type { Memory } from '../types';

const API_BASE = '/api/agents';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform raw memory entry to Memory type
 */
function transformMemoryEntry(agentId: string) {
  return (raw: MemoryItem): Memory => {
    return {
      id: raw.key,
      agentId,
      content: raw.value,
      category: raw.tags?.[0],
      tags: raw.tags || [],
      timestamp: raw.timestamp,
      score: raw.score,
    };
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get agent memories (all or search by query)
 * GET /api/agents/:agent_id/memory
 *
 * Supports optional query parameters:
 * - q: search query (keyword search via FTS5)
 * - tag: filter by tag
 * - limit: max results (default PAGINATION.MEMORY_DEFAULT)
 * - mode: "keyword" | "semantic" | "hybrid"
 */
export async function getAgentMemories(
  agentId: string,
  options?: {
    query?: string;
    tag?: string;
    limit?: number;
    mode?: 'keyword' | 'semantic' | 'hybrid';
  }
): Promise<Memory[]> {
  const params = new URLSearchParams();

  if (options?.query) {
    params.set('q', options.query);
  }

  if (options?.tag) {
    params.set('tag', options.tag);
  }

  if (options?.limit !== undefined) {
    params.set('limit', options.limit.toString());
  }

  if (options?.mode) {
    params.set('mode', options.mode);
  }

  const queryString = params.toString();
  const url = `${API_BASE}/${encodeURIComponent(agentId)}/memory${
    queryString ? `?${queryString}` : ''
  }`;

  const response = await fetchApi(url, undefined, MemoryListResponseSchema);
  return response.entries.map(transformMemoryEntry(agentId));
}

/**
 * Search agent memories with a query
 * Alias for getAgentMemories with search mode
 */
export async function searchAgentMemories(
  agentId: string,
  query: string,
  options?: {
    tag?: string;
    limit?: number;
    mode?: 'keyword' | 'semantic' | 'hybrid';
  }
): Promise<Memory[]> {
  return getAgentMemories(agentId, {
    query,
    tag: options?.tag,
    limit: options?.limit,
    mode: options?.mode || 'keyword',
  });
}

/**
 * Delete a memory entry by key
 * DELETE /api/agents/:agent_id/memory/:key
 */
export async function deleteAgentMemory(
  agentId: string,
  key: string
): Promise<boolean> {
  const response = await fetchApi(
    `${API_BASE}/${encodeURIComponent(agentId)}/memory/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
    },
    MemoryDeleteResponseSchema
  );
  return response.deleted;
}

/**
 * Save a memory entry (note: currently only supported via assistant API)
 * For direct memory save, use the assistant API or agent runtime
 */
export async function saveAgentMemory(
  _agentId: string,
  _key: string,
  _value: string,
  _tags?: string[]
): Promise<void> {
  // Memory saving is currently only available via the assistant API
  // or through the agent runtime directly
  throw new Error(
    'Memory saving is currently only available via the assistant API. ' +
      'Use the assistant chat to save memories.'
  );
}
