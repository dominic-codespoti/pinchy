/**
 * useAgentUrlState Hook
 *
 * Syncs agent UI state with URL parameters using nuqs.
 * Enables shareable URLs and browser history integration.
 */

'use client';

import { useCallback, useEffect } from 'react';
import {
  useQueryState,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import {
  AgentDetailTab,
  AgentsListTab,
  AgentViewMode,
  AgentSortField,
  AgentSortDirection,
  AgentStatusFilter,
} from '../store/types';

// ============================================================================
// Valid Values
// ============================================================================

const VALID_DETAIL_TABS: AgentDetailTab[] = [
  'overview',
  'files',
  'memory',
  'sessions',
  'test',
  'settings',
];

const VALID_LIST_TABS: AgentsListTab[] = ['all', 'active', 'heartbeat', 'recent'];

const VALID_VIEW_MODES: AgentViewMode[] = ['grid', 'list', 'table'];

const VALID_SORT_FIELDS: AgentSortField[] = [
  'name',
  'createdAt',
  'status',
  'lastHeartbeat',
  'sessionCount',
];

const VALID_SORT_DIRECTIONS: AgentSortDirection[] = ['asc', 'desc'];

const VALID_STATUS_FILTERS: AgentStatusFilter[] = [
  'all',
  'active',
  'inactive',
  'error',
];

// ============================================================================
// URL State Hook
// ============================================================================

export interface AgentUrlState {
  // Detail page tab
  tab: AgentDetailTab | null;
  setTab: (tab: AgentDetailTab | null) => void;

  // Search query
  search: string | null;
  setSearch: (search: string | null) => void;

  // View mode
  view: AgentViewMode | null;
  setView: (view: AgentViewMode | null) => void;

  // Sort configuration
  sortField: AgentSortField | null;
  setSortField: (field: AgentSortField | null) => void;
  sortDir: AgentSortDirection | null;
  setSortDir: (dir: AgentSortDirection | null) => void;

  // Filters
  status: AgentStatusFilter | null;
  setStatus: (status: AgentStatusFilter | null) => void;
  group: string | null;
  setGroup: (group: string | null) => void;

  // Batch updates
  resetUrlState: () => void;
  syncToStore: (storeState: {
    setSelectedTab: (tab: AgentDetailTab) => void;
    setSearchQuery: (query: string) => void;
    setViewMode: (mode: AgentViewMode) => void;
    setSort: (sort: { field: AgentSortField; direction: AgentSortDirection }) => void;
    setFilters: (filters: { status: AgentStatusFilter; groupId: string | null }) => void;
  }) => void;
}

export function useAgentUrlState(): AgentUrlState {
  // Detail tab
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral(VALID_DETAIL_TABS)
  );

  // Search query
  const [search, setSearch] = useQueryState(
    'q',
    parseAsString.withDefault('')
  );

  // View mode
  const [view, setView] = useQueryState(
    'view',
    parseAsStringLiteral(VALID_VIEW_MODES)
  );

  // Sort field
  const [sortField, setSortField] = useQueryState(
    'sort',
    parseAsStringLiteral(VALID_SORT_FIELDS)
  );

  // Sort direction
  const [sortDir, setSortDir] = useQueryState(
    'dir',
    parseAsStringLiteral(VALID_SORT_DIRECTIONS)
  );

  // Status filter
  const [status, setStatus] = useQueryState(
    'status',
    parseAsStringLiteral(VALID_STATUS_FILTERS)
  );

  // Group filter
  const [group, setGroup] = useQueryState(
    'group',
    parseAsString
  );

  // ---------------------------------------------------------------------------
  // Batch Updates
  // ---------------------------------------------------------------------------

  const resetUrlState = useCallback(() => {
    setTab(null);
    setSearch('');
    setView(null);
    setSortField(null);
    setSortDir(null);
    setStatus(null);
    setGroup(null);
  }, [setTab, setSearch, setView, setSortField, setSortDir, setStatus, setGroup]);

  // ---------------------------------------------------------------------------
  // Sync URL to Store
  // ---------------------------------------------------------------------------

  const syncToStore = useCallback(
    (storeState: {
      setSelectedTab: (tab: AgentDetailTab) => void;
      setSearchQuery: (query: string) => void;
      setViewMode: (mode: AgentViewMode) => void;
      setSort: (sort: { field: AgentSortField; direction: AgentSortDirection }) => void;
      setFilters: (filters: { status: AgentStatusFilter; groupId: string | null }) => void;
    }) => {
      // Sync tab
      if (tab && VALID_DETAIL_TABS.includes(tab)) {
        storeState.setSelectedTab(tab);
      }

      // Sync search
      if (search !== null) {
        storeState.setSearchQuery(search);
      }

      // Sync view
      if (view && VALID_VIEW_MODES.includes(view)) {
        storeState.setViewMode(view);
      }

      // Sync sort
      const field = sortField || 'createdAt';
      const direction = sortDir || 'desc';
      if (VALID_SORT_FIELDS.includes(field)) {
        storeState.setSort({ field, direction });
      }

      // Sync filters
      const filterStatus = status || 'all';
      const groupId = group || null;
      if (VALID_STATUS_FILTERS.includes(filterStatus)) {
        storeState.setFilters({ status: filterStatus, groupId });
      }
    },
    [tab, search, view, sortField, sortDir, status, group]
  );

  return {
    tab,
    setTab,
    search,
    setSearch,
    view,
    setView,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    status,
    setStatus,
    group,
    setGroup,
    resetUrlState,
    syncToStore,
  };
}

// ============================================================================
// Sync Component (for one-way URL -> Store sync)
// ============================================================================

export interface UrlStateSyncProps {
  store: {
    setSelectedTab: (tab: AgentDetailTab) => void;
    setSearchQuery: (query: string) => void;
    setViewMode: (mode: AgentViewMode) => void;
    setSort: (sort: { field: AgentSortField; direction: AgentSortDirection }) => void;
    setFilters: (filters: { status: AgentStatusFilter; groupId: string | null }) => void;
  };
}

/**
 * Hook to automatically sync URL state to store on mount.
 * Use this in page components to initialize store from URL.
 */
export function useSyncAgentUrlToStore({ store }: UrlStateSyncProps): void {
  const urlState = useAgentUrlState();

  useEffect(() => {
    urlState.syncToStore(store);
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ============================================================================
// Convenience Hooks for Individual Params
// ============================================================================

/**
 * Hook for detail page tab state
 */
export function useAgentTab(): {
  tab: AgentDetailTab;
  setTab: (tab: AgentDetailTab) => void;
} {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral(VALID_DETAIL_TABS).withDefault('overview')
  );

  return {
    tab: tab || 'overview',
    setTab,
  };
}

/**
 * Hook for search query state
 */
export function useAgentSearch(): {
  search: string;
  setSearch: (search: string) => void;
} {
  const [search, setSearch] = useQueryState(
    'q',
    parseAsString.withDefault('')
  );

  return {
    search: search || '',
    setSearch,
  };
}

/**
 * Hook for list view mode state
 */
export function useAgentViewMode(): {
  view: AgentViewMode;
  setView: (view: AgentViewMode) => void;
} {
  const [view, setView] = useQueryState(
    'view',
    parseAsStringLiteral(VALID_VIEW_MODES).withDefault('grid')
  );

  return {
    view: view || 'grid',
    setView,
  };
}
