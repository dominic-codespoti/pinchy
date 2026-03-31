"use client";

import { useState, useCallback } from "react";
import { Agent } from "../types";

export function useAgentSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
      return newSelected;
    });
  }, []);

  const toggleAll = useCallback((filteredAgents: Agent[]) => {
    setSelectedIds((prev) => {
      if (prev.size === filteredAgents.length) {
        return new Set();
      } else {
        return new Set(filteredAgents.map((a) => a.id));
      }
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const allSelected = useCallback(
    (filteredCount: number) => filteredCount > 0 && selectedIds.size === filteredCount,
    [selectedIds.size]
  );

  const someSelected = useCallback(
    (filteredCount: number) => selectedIds.size > 0 && selectedIds.size < filteredCount,
    [selectedIds.size]
  );

  return {
    selectedIds,
    toggleSelection,
    toggleAll,
    clearSelection,
    allSelected,
    someSelected,
  };
}
