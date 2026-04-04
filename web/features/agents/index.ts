/**
 * Agents Feature - Main Export File
 *
 * Re-exports everything from sub-modules for convenient imports.
 */

// ============================================================================
// Components
// ============================================================================

export {
  AgentCard,
  AgentDetail,
  AgentsList,
} from './components';

// ============================================================================
// Hooks
// ============================================================================

export {
  // Query hooks
  useAgent,
  useAgents,
  useAgentFile,
  useAgentFiles,
  useAgentMemories,
  type UseAgentResult,
  type UseAgentsResult,
  type UseAgentFileResult,
  type UseAgentFilesResult,
  // URL state hooks
  useAgentUrlState,
  useAgentTab,
  useAgentSearch,
  useAgentViewMode,
  useSyncAgentUrlToStore,
  type UrlStateSyncProps,
  // Derived state hooks
  useFilteredAgents,
  useAgentStats,
  type UseFilteredAgentsOptions,
  type UseFilteredAgentsResult,
  type UseAgentStatsOptions,
  type UseAgentStatsResult,
} from './hooks';

// ============================================================================
// Store
// ============================================================================

export {
  // Main store
  useAgentStore,
  selectAgentSelection,
  selectAgentListState,
  selectAgentUIState,
  selectAgentGroups,
  selectAgentEditingState,
  // Test store
  useAgentTestStore,
  selectTestMessages,
  selectTestInput,
  selectTestStatus,
  selectTestSession,
  createUserMessage,
  createAgentMessage,
  createSystemMessage,
  createErrorMessage,
  // Types
  type AgentStore,
  type AgentTestStore,
  type AgentStatusFilter,
  type AgentFilters,
  type AgentSortField,
  type AgentSortDirection,
  type AgentSortConfig,
  type AgentViewMode,
  type AgentDetailTab,
  type AgentsListTab,
  type AgentModalState,
  type AgentUrlState,
  type AgentStats,
  type FilteredAgentsResult,
  type TestMessage,
  type TestMessageRole,
  type TestInputMode,
} from './store';

// ============================================================================
// API
// ============================================================================

export {
  // Agent CRUD
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  cloneAgent,
  // Files
  getAgentFiles,
  getAgentFile,
  saveAgentFile,
  getAllAgentFiles,
  ALLOWED_AGENT_FILES,
  isAllowedFilename,
  // Memories
  getAgentMemories,
  searchAgentMemories,
  deleteAgentMemory,
  saveAgentMemory,
  // Sessions
  getAgentSessions,
  getAgentSession,
  getAgentCurrentSession,
  updateAgentSession,
  deleteAgentSession,
  // Heartbeat
  getAgentHeartbeat,
  getAllAgentsHeartbeat,
  getAgentsHeartbeat,
  isHeartbeatHealthy,
  isHeartbeatMissed,
  getTimeToNextHeartbeat,
  formatHeartbeatInterval,
  // Test
  testAgent,
  testAgentWithAssistant,
  testAgentWithPinchy,
  sendTestMessage,
  // Types
  type AllowedAgentFile,
  type AgentFileData,
  type TestAgentOptions,
  type TestAgentResult,
} from './api';

// ============================================================================
// Utilities
// ============================================================================

export {
  transformAgent,
  transformAgentDetail,
} from './utils';

// ============================================================================
// Query Keys
// ============================================================================

export {
  agentsKeys,
  agentsMutationKeys,
} from './query-keys';

// ============================================================================
// Types
// ============================================================================

export type {
  Agent,
  AgentGroup,
  RawAgent,
  CreateAgentInput,
  UpdateAgentInput,
  AgentFile,
  SendTestMessageResponse,
  CloneAgentOptions,
  CloneAgentResult,
  ToolCallRecord,
  TokenInfo,
  TurnReceipt,
  ReceiptsListResponse,
  ReceiptsBySessionResponse,
  RawHeartbeatStatus,
  HeartbeatStatusData,
} from './types';

// ============================================================================
// Constants
// ============================================================================

export {
  GROUP_COLORS,
  DEFAULT_GROUP_COLOR_VALUES,
  MEMORY_CATEGORIES,
} from './constants';
