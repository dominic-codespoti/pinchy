"use client";

import { useState, useMemo, useCallback } from "react";
import { Agent } from "../types";

type SortField = "name" | "provider" | "status";
type SortDirection = "asc" | "desc";

interface SortState {
  field: SortField;
  direction: SortDirection;
}

export function useAgentSorting(agents: Agent[]) {
  const [sort, setSort] = useState<SortState>({ field: "name", direction: "asc" });

  const handleSort = useCallback((field: SortField) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const sortedAgents = useMemo(() => {
    const sorted = [...agents];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sort.field) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "provider":
          comparison = a.config.provider.localeCompare(b.config.provider);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return sort.direction === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [agents, sort]);

  return { sort, handleSort, sortedAgents };
}
