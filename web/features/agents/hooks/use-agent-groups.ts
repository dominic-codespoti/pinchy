'use client';

import { useState, useEffect, useCallback } from 'react';
import { AgentGroup } from '../types';

const STORAGE_KEY = 'pinchy-agent-groups';

const DEFAULT_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-rose-500',
];

export function useAgentGroups() {
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setGroups(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setGroups([]);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    } catch {
      // Ignore storage errors
    }
  }, [groups, isLoaded]);

  const createGroup = useCallback((input: Omit<AgentGroup, 'id' | 'order' | 'agentIds'>) => {
    const newGroup: AgentGroup = {
      ...input,
      id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: groups.length,
      agentIds: [],
    };
    setGroups(prev => [...prev, newGroup]);
    return newGroup;
  }, [groups.length]);

  const updateGroup = useCallback((id: string, updates: Partial<Omit<AgentGroup, 'id'>>) => {
    setGroups(prev => prev.map(group =>
      group.id === id ? { ...group, ...updates } : group
    ));
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setGroups(prev => prev.filter(group => group.id !== id));
  }, []);

  const reorderGroups = useCallback((activeId: string, overId: string) => {
    setGroups(prev => {
      const oldIndex = prev.findIndex(g => g.id === activeId);
      const newIndex = prev.findIndex(g => g.id === overId);

      if (oldIndex === -1 || newIndex === -1) return prev;

      const newGroups = [...prev];
      const [moved] = newGroups.splice(oldIndex, 1);
      newGroups.splice(newIndex, 0, moved);

      return newGroups.map((g, i) => ({ ...g, order: i }));
    });
  }, []);

  const assignAgentsToGroup = useCallback((groupId: string, agentIds: string[]) => {
    setGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        const combined = [...group.agentIds, ...agentIds];
        const unique = combined.filter((id, index) => combined.indexOf(id) === index);
        return { ...group, agentIds: unique };
      }
      return group;
    }));
  }, []);

  const removeAgentsFromGroup = useCallback((groupId: string, agentIds: string[]) => {
    setGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        return { ...group, agentIds: group.agentIds.filter(id => !agentIds.includes(id)) };
      }
      return group;
    }));
  }, []);

  const getUngroupedAgents = useCallback((allAgentIds: string[]) => {
    const groupedAgentIds = new Set(groups.flatMap(g => g.agentIds));
    return allAgentIds.filter(id => !groupedAgentIds.has(id));
  }, [groups]);

  const getGroupsForAgent = useCallback((agentId: string) => {
    return groups.filter(group => group.agentIds.includes(agentId));
  }, [groups]);

  return {
    groups,
    isLoaded,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    assignAgentsToGroup,
    removeAgentsFromGroup,
    getUngroupedAgents,
    getGroupsForAgent,
  };
}
