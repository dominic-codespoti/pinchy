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
export { useAgentSessions, type UseAgentSessionsResult } from '@/features/sessions/hooks';

// Memory hooks - re-exported from memories feature
export {
  useAgentMemories,
  useSearchMemories,
  useAddMemory,
  useDeleteMemory,
} from '@/features/memories/hooks';

// ============================================================================
// Mutation Hooks (TanStack Query)
// ============================================================================

export { useCreateAgent, type UseCreateAgentResult } from './use-create-agent';
export { useUpdateAgent, type UseUpdateAgentResult } from './use-update-agent';
export { useDeleteAgent, type UseDeleteAgentResult } from './use-delete-agent';
export { useCloneAgent, type UseCloneAgentResult } from './use-clone-agent';
export { useSaveAgentFile, type UseSaveAgentFileResult } from './use-save-agent-file';
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
  type UseFilteredAgentsOptions,
  type UseFilteredAgentsResult,
} from './use-filtered-agents';

export {
  useAgentStats,
  type UseAgentStatsOptions,
  type UseAgentStatsResult,
} from './use-agent-stats';
