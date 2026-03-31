"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folder, Users } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AgentGroup } from "../types";

interface GroupHeaderProps {
  groups: AgentGroup[];
  selectedGroupId: string | null;
  filteredCount: number;
}

export function GroupHeader({ groups, selectedGroupId, filteredCount }: GroupHeaderProps) {
  if (!selectedGroupId) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Showing all {filteredCount} agents
        </span>
      </div>
    );
  }

  if (selectedGroupId === "ungrouped") {
    return (
      <div className="flex items-center gap-2 mb-4">
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Showing {filteredCount} ungrouped agents
        </span>
      </div>
    );
  }

  const group = groups.find((g) => g.id === selectedGroupId);

  if (!group) return null;

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={cn("h-3 w-3 rounded-full", group.color)} />
      <span className="font-medium">{group.name}</span>
      <Badge variant="secondary" className="text-xs">
        {filteredCount} agents
      </Badge>
      {group.description && (
        <span className="text-sm text-muted-foreground hidden sm:inline">
          — {group.description}
        </span>
      )}
    </div>
  );
}
