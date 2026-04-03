/**
 * Agent Hooks Exports
 *
 * Centralized exports for all agent-related hooks.
 */

// ============================================================================
// Query Hooks (TanStack Query)
// ============================================================================

export { useAgent, type UseAgentResult } from './use-agent';
export { useAgents, type UseAgentsResult } from './use-agents';
export { useAgentFile, type UseAgentFileResult } from './use-agent-file';
export { useAgentFiles, type UseAgentFilesResult } from './use-agent-files';
export { useAgentMemories, type UseAgentMemoriesResult } from './use-agent-memories';
export { useAgentSessions, type UseAgentSessionsResult } from './use-agent-sessions';
export { useAgentHeartbeat, type UseAgentHeartbeatResult } from './use-agent-heartbeat';

// ============================================================================
// Mutation Hooks (TanStack Query)
// ============================================================================

export { useCreateAgent, type UseCreateAgentResult } from './use-create-agent';
export { useUpdateAgent, type UseUpdateAgentResult } from './use-update-agent';
export { useDeleteAgent, type UseDeleteAgentResult } from './use-delete-agent';
export { useCloneAgent, type UseCloneAgentResult } from './use-clone-agent';
export { useSaveAgentFile, type UseSaveAgentFileResult } from './use-save-agent-file';
export { useDeleteMemory, type UseDeleteMemoryResult } from './use-delete-memory';
export { useTestAgent, type UseTestAgentResult } from './use-test-agent';

// ============================================================================
// URL State Hooks (nuqs integration)
// ============================================================================

export {
  useAgentUrlState,
  useAgentTab,
  useAgentSearch,
  useAgentViewMode,
  useSyncAgentUrlToStore,
  type UrlStateSyncProps,
} from './use-agent-url-state';

// ============================================================================
// Derived State Hooks (Zustand computed values)
// ============================================================================

export {
  useFilteredAgents,
  useFilteredAgentsFromStore,
  useGroupedAgents,
  type UseFilteredAgentsOptions,
  type UseFilteredAgentsResult,
  type GroupedAgents,
  type UseGroupedAgentsResult,
} from './use-filtered-agents';

export {
  useAgentStats,
  useAgentCount,
  useActiveAgentCount,
  useAgentWithHeartbeatCount,
  useAgentProviderStats,
  useAgentStatusDistribution,
  type UseAgentStatsOptions,
  type UseAgentStatsResult,
  type ProviderStat,
  type StatusDistribution,
} from './use-agent-stats';
