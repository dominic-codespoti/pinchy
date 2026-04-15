/**
 * useFilteredAgents Hook
 *
 * Hook for filtering and sorting agents based on current store state.
 * Uses useMemo for performance optimization.
 */

'use client';

import { useMemo } from 'react';
import { Agent } from '../types';
import {
  AgentFilters,
  AgentSortConfig,
  FilteredAgentsResult,
} from '../store/types';

export interface UseFilteredAgentsOptions {
  agents: Agent[];
  searchQuery: string;
  filters: AgentFilters;
  sort: AgentSortConfig;
}

export interface UseFilteredAgentsResult extends FilteredAgentsResult {
  // Additional computed values
  activeCount: number;
  inactiveCount: number;
  errorCount: number;
  heartbeatCount: number;
}

export function useFilteredAgents({
  agents,
  searchQuery,
  filters,
  sort,
}: UseFilteredAgentsOptions): UseFilteredAgentsResult {
  return useMemo(() => {
    // -------------------------------------------------------------------------
    // Apply Filters
    // -------------------------------------------------------------------------
    let filtered = [...agents];

    // Search filter (case-insensitive, matches name and description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (agent) =>
          agent.name.toLowerCase().includes(query) ||
          agent.description.toLowerCase().includes(query) ||
          agent.id.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter((agent) => agent.status === filters.status);
    }

    // Heartbeat filter
    if (filters.hasHeartbeat !== null) {
      filtered = filtered.filter(
        (agent) => !!agent.hasHeartbeat === filters.hasHeartbeat
      );
    }

    // Group filter
    if (filters.groupId) {
      // This would filter by group membership
      // Implementation depends on how groups are structured
      // For now, we'll assume group filtering is handled separately
    }

    // Provider filter
    if (filters.provider) {
      filtered = filtered.filter(
        (agent) => agent.config.provider === filters.provider
      );
    }

    // -------------------------------------------------------------------------
    // Apply Sorting
    // -------------------------------------------------------------------------
    const sorted = filtered.sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;

        case 'createdAt':
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;

        case 'status':
          const statusOrder = { active: 0, inactive: 1, error: 2 };
          comparison = statusOrder[a.status] - statusOrder[b.status];
          break;

        case 'lastHeartbeat':
          const aHeartbeat = a.lastHeartbeatAt
            ? new Date(a.lastHeartbeatAt).getTime()
            : 0;
          const bHeartbeat = b.lastHeartbeatAt
            ? new Date(b.lastHeartbeatAt).getTime()
            : 0;
          comparison = aHeartbeat - bHeartbeat;
          break;

        case 'sessionCount':
          comparison = (a.sessionCount || 0) - (b.sessionCount || 0);
          break;

        default:
          comparison = 0;
      }

      // Apply direction
      return sort.direction === 'asc' ? comparison : -comparison;
    });

    // -------------------------------------------------------------------------
    // Compute Stats
    // -------------------------------------------------------------------------
    const activeCount = agents.filter((a) => a.status === 'active').length;
    const inactiveCount = agents.filter((a) => a.status === 'inactive').length;
    const errorCount = agents.filter((a) => a.status === 'error').length;
    const heartbeatCount = agents.filter((a) => a.hasHeartbeat).length;

    // -------------------------------------------------------------------------
    // Return Result
    // -------------------------------------------------------------------------
    return {
      agents: sorted,
      totalCount: agents.length,
      filteredCount: sorted.length,
      filtersApplied:
        searchQuery.trim() !== '' ||
        filters.status !== 'all' ||
        filters.hasHeartbeat !== null ||
        filters.provider !== null,
      activeCount,
      inactiveCount,
      errorCount,
      heartbeatCount,
    };
  }, [agents, searchQuery, filters, sort]);
}
