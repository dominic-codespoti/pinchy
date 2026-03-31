"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { AgentGroup } from "../types";

interface GroupBadgesProps {
  groups: AgentGroup[];
  agentId: string;
  maxVisible?: number;
  size?: "sm" | "md";
}

GroupBadges.displayName = "GroupBadges";

export function GroupBadges({ groups, agentId, maxVisible = 3, size = "sm" }: GroupBadgesProps) {
  const agentGroups = groups.filter((group) => group.agentIds.includes(agentId));

  if (agentGroups.length === 0) {
    return null;
  }

  const visibleGroups = agentGroups.slice(0, maxVisible);
  const remainingCount = agentGroups.length - maxVisible;

  const sizeClasses = size === "sm" ? "size-1.5" : "size-2";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibleGroups.map((group) => (
        <Badge
          key={group.id}
          variant="outline"
          className="px-1.5 py-0 text-[10px] font-normal border-0 bg-muted flex items-center gap-1"
        >
          <div className={cn("rounded-full", sizeClasses, group.color)} />
          <span className="truncate max-w-[80px]">{group.name}</span>
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="outline"
          className="px-1.5 py-0 text-[10px] font-normal border-0 bg-muted"
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}
