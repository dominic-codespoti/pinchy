/**
 * Agent Store Types
 *
 * Type definitions for agent state management using Zustand.
 * Separates server state (TanStack Query) from client/UI state.
 */

import { Agent, AgentGroup } from '../types';

// ============================================================================
// Filter Types
// ============================================================================

export type AgentStatusFilter = 'all' | 'active' | 'inactive' | 'error';

export interface AgentFilters {
  status: AgentStatusFilter;
  hasHeartbeat: boolean | null;
  groupId: string | null;
  provider: string | null;
}

// ============================================================================
// Sort Types
// ============================================================================

export type AgentSortField =
  | 'name'
  | 'createdAt'
  | 'status'
  | 'lastHeartbeat'
  | 'sessionCount';

export type AgentSortDirection = 'asc' | 'desc';

export interface AgentSortConfig {
  field: AgentSortField;
  direction: AgentSortDirection;
}

// ============================================================================
// View Types
// ============================================================================

export type AgentViewMode = 'grid' | 'list' | 'table';

export type AgentDetailTab =
  | 'overview'
  | 'files'
  | 'memory'
  | 'sessions'
  | 'test'
  | 'settings';

export type AgentsListTab = 'all' | 'active' | 'heartbeat' | 'recent';

// ============================================================================
// UI State Types
// ============================================================================

export interface AgentModalState {
  create: boolean;
  edit: boolean;
  clone: boolean;
  delete: boolean;
  groupManage: boolean;
}

// ============================================================================
// Main Agent Store Interface
// ============================================================================

export interface AgentStore {
  // Selection state
  selectedAgentId: string | null;
  selectedTab: AgentDetailTab;

  // List view state
  listTab: AgentsListTab;
  searchQuery: string;
  filters: AgentFilters;
  sort: AgentSortConfig;
  viewMode: AgentViewMode;

  // UI state
  sidebarOpen: boolean;
  modals: AgentModalState;

  // Group management
  groups: AgentGroup[];
  selectedGroupId: string | null;
  expandedGroups: string[];

  // Editing state
  isCreating: boolean;
  isEditing: boolean;
  isCloning: boolean;
  draftAgent: Partial<Agent> | null;

  // Actions - Selection
  selectAgent: (id: string | null) => void;
  setSelectedTab: (tab: AgentDetailTab) => void;

  // Actions - List view
  setListTab: (tab: AgentsListTab) => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<AgentFilters>) => void;
  setSort: (sort: AgentSortConfig) => void;
  setSortField: (field: AgentSortField) => void;
  toggleSortDirection: () => void;
  setViewMode: (mode: AgentViewMode) => void;

  // Actions - UI
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (modal: keyof AgentModalState) => void;
  closeModal: (modal: keyof AgentModalState) => void;
  closeAllModals: () => void;

  // Actions - Groups
  setSelectedGroupId: (id: string | null) => void;
  toggleGroupExpanded: (id: string) => void;
  addGroup: (group: Omit<AgentGroup, 'order'>) => void;
  updateGroup: (id: string, updates: Partial<AgentGroup>) => void;
  deleteGroup: (id: string) => void;
  reorderGroups: (groupIds: string[]) => void;
  assignAgentToGroup: (agentId: string, groupId: string) => void;
  removeAgentFromGroup: (agentId: string, groupId: string) => void;

  // Actions - Editing
  startCreating: () => void;
  startEditing: (agent: Agent) => void;
  startCloning: (agent: Agent) => void;
  cancelEditing: () => void;
  updateDraft: (updates: Partial<Agent>) => void;

  // Actions - Legacy (for backward compatibility)
  setSelectedAgentId: (id: string | null) => void;
  setIsCreating: (value: boolean) => void;
  setIsEditing: (value: boolean) => void;
  setIsCloning: (value: boolean) => void;
}

// ============================================================================
// Agent Test Store Types
// ============================================================================

export type TestMessageRole = 'user' | 'agent' | 'system';

export interface TestMessage {
  id: string;
  role: TestMessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
}

export type TestInputMode = 'single' | 'batch';

export interface AgentTestStore {
  // Messages
  messages: TestMessage[];

  // Input state
  inputValue: string;
  inputMode: TestInputMode;
  isSubmitting: boolean;

  // Loading/error state
  isLoading: boolean;
  error: string | null;
  streamingMessageId: string | null;

  // Session state
  sessionId: string | null;
  isSessionActive: boolean;

  // Actions - Messages
  addMessage: (message: Omit<TestMessage, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<TestMessage>) => void;
  removeMessage: (id: string) => void;
  clearMessages: () => void;
  setMessageStreaming: (id: string, isStreaming: boolean) => void;
  appendToMessage: (id: string, content: string) => void;

  // Actions - Input
  setInputValue: (value: string) => void;
  setInputMode: (mode: TestInputMode) => void;
  submitInput: () => void;

  // Actions - State
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setStreamingMessageId: (id: string | null) => void;
  setSessionId: (id: string | null) => void;
  startSession: () => void;
  endSession: () => void;
  reset: () => void;
}

// ============================================================================
// URL State Types (for nuqs integration)
// ============================================================================

export interface AgentUrlState {
  tab: AgentDetailTab | null;
  search: string | null;
  view: AgentViewMode | null;
  sortField: AgentSortField | null;
  sortDir: AgentSortDirection | null;
  status: AgentStatusFilter | null;
  group: string | null;
}

// ============================================================================
// Derived State Types
// ============================================================================

export interface AgentStats {
  total: number;
  active: number;
  inactive: number;
  error: number;
  withHeartbeat: number;
  withoutHeartbeat: number;
  totalSessions: number;
  totalCronJobs: number;
}

export interface FilteredAgentsResult {
  agents: Agent[];
  totalCount: number;
  filteredCount: number;
  filtersApplied: boolean;
}
