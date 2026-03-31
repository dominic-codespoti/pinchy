"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { getHeartbeatStatus } from "@/shared/components/heartbeat-badge";
import { Agent, AgentGroup } from "../types";
import { GroupBadges } from "./group-badges";
import { AgentRowActions } from "./agent-row-actions";

interface AgentMobileCardProps {
  agent: Agent;
  groups: AgentGroup[];
  isSelected: boolean;
  onSelect: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onClone: (id: string, name: string) => void;
}

export function AgentMobileCard({
  agent,
  groups,
  isSelected,
  onSelect,
  onView,
  onEdit,
  onDelete,
  onClone,
}: AgentMobileCardProps) {
  const heartbeatStatus = getHeartbeatStatus(agent.hasHeartbeat, agent.lastHeartbeatAt);

  return (
    <Card className="relative">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            className="mt-1"
            aria-label={`Select ${agent.name}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{agent.name}</span>
                {agent.status === "inactive" && (
                  <Badge variant="secondary" className="text-xs">Inactive</Badge>
                )}
              </div>
              <AgentRowActions
                agentId={agent.id}
                agentName={agent.name}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                onClone={onClone}
              />
            </div>

            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {agent.description || "No description"}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <GroupBadges groups={groups} agentId={agent.id} maxVisible={2} />
            </div>

            <div className="flex items-center gap-2 mt-2 text-sm">
              <Badge variant="outline" className="text-xs">
                {agent.config.provider}
              </Badge>
              <span className={cn(
                "text-xs",
                heartbeatStatus === "online" && "text-green-600",
                heartbeatStatus === "offline" && "text-red-600",
                heartbeatStatus === "unknown" && "text-muted-foreground"
              )}>
                {heartbeatStatus === "online" ? "Online" : heartbeatStatus === "offline" ? "Offline" : "Unknown"}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
