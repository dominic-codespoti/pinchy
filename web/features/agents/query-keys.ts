/**
 * Query key factory for Agents feature
 * 
 * Provides consistent, self-documenting query keys for TanStack Query.
 * Uses factory functions to enable easy cache invalidation of related queries.
 * 
 * Usage:
 *   queryKey: agentsKeys.all()           // ['agents']
 *   queryKey: agentsKeys.lists()          // ['agents', 'list']
 *   queryKey: agentsKeys.detail(id)       // ['agents', 'detail', id]
 *   queryKey: agentsKeys.sessions(id)      // ['agents', 'detail', id, 'sessions']
 *   queryKey: agentsKeys.stats(id)        // ['agents', 'detail', id, 'stats']
 */

export const agentsKeys = {
  /** Base key for all agent queries */
  all: () => ['agents'] as const,

  /** List queries */
  lists: () => [...agentsKeys.all(), 'list'] as const,

  /** Detail queries */
  details: () => [...agentsKeys.all(), 'detail'] as const,
  detail: (id: string) => [...agentsKeys.details(), id] as const,

  /** Agent sessions */
  sessions: (id: string) => [...agentsKeys.detail(id), 'sessions'] as const,

  /** Agent stats/calculated data */
  stats: (id: string) => [...agentsKeys.detail(id), 'stats'] as const,

  /** Agent files */
  files: (id: string) => [...agentsKeys.detail(id), 'files'] as const,
  file: (id: string, filename: string) => [...agentsKeys.files(id), filename] as const,

  /** Agent memories */
  memories: (id: string) => [...agentsKeys.detail(id), 'memories'] as const,
  memorySearch: (id: string, query: string) => [...agentsKeys.memories(id), 'search', query] as const,

  /** Agent logs */
  logs: (id: string) => [...agentsKeys.detail(id), 'logs'] as const,
  logsWithLimit: (id: string, limit?: number) => [...agentsKeys.logs(id), { limit }] as const,

  /** Agent heartbeats */
  heartbeats: () => [...agentsKeys.all(), 'heartbeat'] as const,
  heartbeat: (id: string) => [...agentsKeys.heartbeats(), id] as const,

  /** Test/trigger queries */
  test: (id: string) => [...agentsKeys.detail(id), 'test'] as const,
};

/**
 * Mutation keys for tracking mutation state
 */
export const agentsMutationKeys = {
  create: () => [...agentsKeys.all(), 'create'] as const,
  update: (id: string) => [...agentsKeys.detail(id), 'update'] as const,
  delete: () => [...agentsKeys.all(), 'delete'] as const,
  clone: (id: string) => [...agentsKeys.detail(id), 'clone'] as const,
  saveFile: (id: string) => [...agentsKeys.files(id), 'save'] as const,
  trigger: (id: string) => [...agentsKeys.detail(id), 'trigger'] as const,
};
