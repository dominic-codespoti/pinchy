/**
 * Agent Store
 *
 * Zustand store for agent UI state management.
 * Features:
 * - Redux DevTools integration
 * - localStorage persistence for view preferences
 * - URL sync for tab, search, filters (via nuqs)
 * - Granular state updates with computed values
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { Agent, AgentGroup } from '../types';
import {
  AgentStore,
  AgentDetailTab,
  AgentsListTab,
  AgentViewMode,
  AgentFilters,
  AgentSortConfig,
  AgentModalState,
  AgentSortField,
} from './types';

// ============================================================================
// Initial State
// ============================================================================

const initialModalState: AgentModalState = {
  create: false,
  edit: false,
  clone: false,
  delete: false,
  groupManage: false,
};

const initialFilters: AgentFilters = {
  status: 'all',
  hasHeartbeat: null,
  groupId: null,
  provider: null,
};

const initialSort: AgentSortConfig = {
  field: 'createdAt',
  direction: 'desc',
};

// ============================================================================
// Store Creation
// ============================================================================

export const useAgentStore = create<AgentStore>()(
  devtools(
    persist(
      (set, get) => ({
        // -------------------------------------------------------------------------
        // State - Selection
        // -------------------------------------------------------------------------
        selectedAgentId: null,
        selectedTab: 'overview',

        // -------------------------------------------------------------------------
        // State - List view
        // -------------------------------------------------------------------------
        listTab: 'all',
        searchQuery: '',
        filters: initialFilters,
        sort: initialSort,
        viewMode: 'grid',

        // -------------------------------------------------------------------------
        // State - UI
        // -------------------------------------------------------------------------
        sidebarOpen: true,
        modals: initialModalState,

        // -------------------------------------------------------------------------
        // State - Groups
        // -------------------------------------------------------------------------
        groups: [],
        selectedGroupId: null,
        expandedGroups: [],

        // -------------------------------------------------------------------------
        // State - Editing
        // -------------------------------------------------------------------------
        isCreating: false,
        isEditing: false,
        isCloning: false,
        draftAgent: null,

        // -------------------------------------------------------------------------
        // Actions - Selection
        // -------------------------------------------------------------------------
        selectAgent: (id) => {
          set(
            {
              selectedAgentId: id,
              selectedTab: 'overview',
            },
            false,
            'agent/selectAgent'
          );
        },

        setSelectedTab: (tab) => {
          set({ selectedTab: tab }, false, 'agent/setSelectedTab');
        },

        // -------------------------------------------------------------------------
        // Actions - List view
        // -------------------------------------------------------------------------
        setListTab: (tab) => {
          set({ listTab: tab }, false, 'agent/setListTab');
        },

        setSearchQuery: (query) => {
          set({ searchQuery: query }, false, 'agent/setSearchQuery');
        },

        setFilters: (filters) => {
          set(
            (state) => ({
              filters: { ...state.filters, ...filters },
            }),
            false,
            'agent/setFilters'
          );
        },

        setSort: (sort) => {
          set({ sort }, false, 'agent/setSort');
        },

        setSortField: (field) => {
          set(
            (state) => ({
              sort: {
                ...state.sort,
                field,
                // Reset to desc when changing field for better UX
                direction: 'desc',
              },
            }),
            false,
            'agent/setSortField'
          );
        },

        toggleSortDirection: () => {
          set(
            (state) => ({
              sort: {
                ...state.sort,
                direction: state.sort.direction === 'asc' ? 'desc' : 'asc',
              },
            }),
            false,
            'agent/toggleSortDirection'
          );
        },

        setViewMode: (mode) => {
          set({ viewMode: mode }, false, 'agent/setViewMode');
        },

        // -------------------------------------------------------------------------
        // Actions - UI
        // -------------------------------------------------------------------------
        toggleSidebar: () => {
          set(
            (state) => ({ sidebarOpen: !state.sidebarOpen }),
            false,
            'agent/toggleSidebar'
          );
        },

        setSidebarOpen: (open) => {
          set({ sidebarOpen: open }, false, 'agent/setSidebarOpen');
        },

        openModal: (modal) => {
          set(
            (state) => ({
              modals: { ...state.modals, [modal]: true },
            }),
            false,
            `agent/openModal/${modal}`
          );
        },

        closeModal: (modal) => {
          set(
            (state) => ({
              modals: { ...state.modals, [modal]: false },
            }),
            false,
            `agent/closeModal/${modal}`
          );
        },

        closeAllModals: () => {
          set({ modals: initialModalState }, false, 'agent/closeAllModals');
        },

        // -------------------------------------------------------------------------
        // Actions - Groups
        // -------------------------------------------------------------------------
        setSelectedGroupId: (id) => {
          set({ selectedGroupId: id }, false, 'agent/setSelectedGroupId');
        },

        toggleGroupExpanded: (id) => {
          set(
            (state) => ({
              expandedGroups: state.expandedGroups.includes(id)
                ? state.expandedGroups.filter((g) => g !== id)
                : [...state.expandedGroups, id],
            }),
            false,
            'agent/toggleGroupExpanded'
          );
        },

        addGroup: (group) => {
          set(
            (state) => {
              const newGroup: AgentGroup = {
                ...group,
                order: state.groups.length,
              };
              return { groups: [...state.groups, newGroup] };
            },
            false,
            'agent/addGroup'
          );
        },

        updateGroup: (id, updates) => {
          set(
            (state) => ({
              groups: state.groups.map((g) =>
                g.id === id ? { ...g, ...updates } : g
              ),
            }),
            false,
            'agent/updateGroup'
          );
        },

        deleteGroup: (id) => {
          set(
            (state) => ({
              groups: state.groups.filter((g) => g.id !== id),
              // Clear selection if the deleted group was selected
              selectedGroupId:
                state.selectedGroupId === id ? null : state.selectedGroupId,
            }),
            false,
            'agent/deleteGroup'
          );
        },

        reorderGroups: (groupIds) => {
          set(
            (state) => {
              const reordered = groupIds
                .map((id) => state.groups.find((g) => g.id === id))
                .filter((g): g is AgentGroup => g !== undefined);
              return {
                groups: reordered.map((g, i) => ({ ...g, order: i })),
              };
            },
            false,
            'agent/reorderGroups'
          );
        },

        assignAgentToGroup: (agentId, groupId) => {
          set(
            (state) => ({
              groups: state.groups.map((g) =>
                g.id === groupId && !g.agentIds.includes(agentId)
                  ? { ...g, agentIds: [...g.agentIds, agentId] }
                  : g
              ),
            }),
            false,
            'agent/assignAgentToGroup'
          );
        },

        removeAgentFromGroup: (agentId, groupId) => {
          set(
            (state) => ({
              groups: state.groups.map((g) =>
                g.id === groupId
                  ? { ...g, agentIds: g.agentIds.filter((id) => id !== agentId) }
                  : g
              ),
            }),
            false,
            'agent/removeAgentFromGroup'
          );
        },

        // -------------------------------------------------------------------------
        // Actions - Editing
        // -------------------------------------------------------------------------
        startCreating: () => {
          set(
            {
              isCreating: true,
              isEditing: false,
              isCloning: false,
              draftAgent: {
                name: '',
                description: '',
                status: 'inactive',
                config: {
                  provider: 'copilot',
                  systemPrompt: '',
                  toolsEnabled: [],
                },
              },
              modals: { ...initialModalState, create: true },
            },
            false,
            'agent/startCreating'
          );
        },

        startEditing: (agent) => {
          set(
            {
              isCreating: false,
              isEditing: true,
              isCloning: false,
              draftAgent: { ...agent },
              modals: { ...initialModalState, edit: true },
            },
            false,
            'agent/startEditing'
          );
        },

        startCloning: (agent) => {
          set(
            {
              isCreating: false,
              isEditing: false,
              isCloning: true,
              draftAgent: {
                ...agent,
                id: '', // Will be generated
                name: `${agent.name} (Copy)`,
                createdAt: new Date().toISOString(),
              },
              modals: { ...initialModalState, clone: true },
            },
            false,
            'agent/startCloning'
          );
        },

        cancelEditing: () => {
          set(
            {
              isCreating: false,
              isEditing: false,
              isCloning: false,
              draftAgent: null,
              modals: initialModalState,
            },
            false,
            'agent/cancelEditing'
          );
        },

        updateDraft: (updates) => {
          set(
            (state) => ({
              draftAgent: state.draftAgent
                ? { ...state.draftAgent, ...updates }
                : updates,
            }),
            false,
            'agent/updateDraft'
          );
        },

        // -------------------------------------------------------------------------
        // Legacy Actions (for backward compatibility)
        // -------------------------------------------------------------------------
        setSelectedAgentId: (id) => {
          set({ selectedAgentId: id }, false, 'agent/setSelectedAgentId');
        },

        setIsCreating: (value) => {
          set({ isCreating: value }, false, 'agent/setIsCreating');
        },

        setIsEditing: (value) => {
          set({ isEditing: value }, false, 'agent/setIsEditing');
        },

        setIsCloning: (value) => {
          set({ isCloning: value }, false, 'agent/setIsCloning');
        },
      }),
      {
        name: 'pinchy-agents-store',
        // Only persist UI preferences, not ephemeral state
        partialize: (state) => ({
          viewMode: state.viewMode,
          sidebarOpen: state.sidebarOpen,
          sort: state.sort,
          filters: state.filters,
          groups: state.groups,
          expandedGroups: state.expandedGroups,
        }),
        // Optional: add version for migrations
        version: 1,
      }
    ),
    {
      name: 'AgentStore',
      // Enable Redux DevTools in development only
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);

// ============================================================================
// Selectors (for granular subscriptions)
// ============================================================================

export const selectAgentSelection = (state: AgentStore) => ({
  selectedAgentId: state.selectedAgentId,
  selectedTab: state.selectedTab,
});

export const selectAgentListState = (state: AgentStore) => ({
  listTab: state.listTab,
  searchQuery: state.searchQuery,
  filters: state.filters,
  sort: state.sort,
  viewMode: state.viewMode,
});

export const selectAgentUIState = (state: AgentStore) => ({
  sidebarOpen: state.sidebarOpen,
  modals: state.modals,
});

export const selectAgentGroups = (state: AgentStore) => ({
  groups: state.groups,
  selectedGroupId: state.selectedGroupId,
  expandedGroups: state.expandedGroups,
});

export const selectAgentEditingState = (state: AgentStore) => ({
  isCreating: state.isCreating,
  isEditing: state.isEditing,
  isCloning: state.isCloning,
  draftAgent: state.draftAgent,
});

// ============================================================================
// Re-export types
// ============================================================================

export type { AgentStore };
