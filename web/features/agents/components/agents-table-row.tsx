"use client";

import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Agent, AgentGroup } from "../types";
import { GroupBadges } from "./group-badges";
import { AgentRowActions } from "./agent-row-actions";
import { getHeartbeatStatus, HeartbeatBadgeCompact } from "@/shared/components/heartbeat-badge";

interface AgentsTableRowProps {
  agent: Agent;
  groups: AgentGroup[];
  isSelected: boolean;
  onToggleSelection: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onClone: (id: string) => void;
}

AgentsTableRow.displayName = "AgentsTableRow";

export function AgentsTableRow({
  agent,
  groups,
  isSelected,
  onToggleSelection,
  onView,
  onEdit,
  onDelete,
  onClone,
}: AgentsTableRowProps) {
  const heartbeatStatus = getHeartbeatStatus(agent.hasHeartbeat, agent.lastHeartbeatAt);

  return (
    <TableRow
      key={agent.id}
      data-state={isSelected ? "selected" : undefined}
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={() => onView(agent.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(agent.id);
        }
      }}
      aria-label={`View agent ${agent.name}`}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          aria-label={`Select ${agent.name}`}
        />
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {agent.name}
          {agent.status === "inactive" && (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-md truncate text-muted-foreground">
        {agent.description || "—"}
      </TableCell>
      <TableCell>
        <GroupBadges groups={groups} agentId={agent.id} maxVisible={2} />
      </TableCell>
      <TableCell>
        <HeartbeatBadgeCompact status={heartbeatStatus} lastSeen={agent.lastHeartbeatAt} />
      </TableCell>
      <TableCell>
        <Badge variant="outline">{agent.config.provider}</Badge>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <AgentRowActions
          agentId={agent.id}
          agentName={agent.name}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onClone={(id, name) => onClone(id)}
        />
      </TableCell>
    </TableRow>
  );
}
