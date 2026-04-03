/**
 * Query keys for TanStack Query - Agents feature
 * Follows TanStack Query best practices for cache management
 */

export const agentKeys = {
  // Base key for all agent queries
  all: ['agents'] as const,

  // List queries
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters?: { status?: string; search?: string }) =>
    [...agentKeys.lists(), filters ?? {}] as const,

  // Detail queries
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,

  // File queries
  files: (agentId: string) => [...agentKeys.detail(agentId), 'files'] as const,
  file: (agentId: string, filename: string) =>
    [...agentKeys.files(agentId), filename] as const,

  // Memory queries
  memories: (agentId: string) =>
    [...agentKeys.detail(agentId), 'memories'] as const,
  memorySearch: (agentId: string, query: string, filters?: { tag?: string; mode?: string }) =>
    [...agentKeys.memories(agentId), 'search', query, filters ?? {}] as const,

  // Session queries
  sessions: (agentId: string) =>
    [...agentKeys.detail(agentId), 'sessions'] as const,

  // Heartbeat queries
  heartbeats: () => [...agentKeys.all, 'heartbeat'] as const,
  heartbeat: (agentId: string) => [...agentKeys.heartbeats(), agentId] as const,

  // Test queries (for optimistic updates during testing)
  test: (agentId: string) => [...agentKeys.detail(agentId), 'test'] as const,
} as const;

// Type for agent query keys
type AgentKeys = typeof agentKeys;

/**
 * Mutation keys for TanStack Query - Agents feature
 * Used for tracking mutation state
 */
export const agentMutationKeys = {
  // Agent mutations
  create: () => ['agents', 'create'] as const,
  update: (id: string) => ['agents', 'update', id] as const,
  delete: () => ['agents', 'delete'] as const,
  clone: (id: string) => ['agents', 'clone', id] as const,

  // File mutations
  saveFile: (agentId: string) => ['agents', 'files', agentId, 'save'] as const,

  // Memory mutations
  deleteMemory: (agentId: string) => ['agents', 'memories', agentId, 'delete'] as const,

  // Test mutations
  sendTest: (agentId: string) => ['agents', 'test', agentId] as const,
} as const;

// Re-export for convenience
export { agentKeys as default };
