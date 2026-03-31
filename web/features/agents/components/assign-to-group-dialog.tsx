"use client";

import { useState, useMemo } from "react";
import { Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/shared/lib/utils";
import { AgentGroup, Agent } from "../types";

interface AssignToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  groups: AgentGroup[];
  onAssign: (groupId: string, agentIds: string[]) => void;
  onRemoveFromGroup: (groupId: string, agentIds: string[]) => void;
}

export function AssignToGroupDialog({
  open,
  onOpenChange,
  agents,
  groups,
  onAssign,
  onRemoveFromGroup,
}: AssignToGroupDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const query = searchQuery.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.id.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query)
    );
  }, [agents, searchQuery]);

  const getGroupsForAgent = (agentId: string) => {
    return groups.filter((g) => g.agentIds.includes(agentId));
  };

  const handleToggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedAgentIds.size === filteredAgents.length) {
      setSelectedAgentIds(new Set());
    } else {
      setSelectedAgentIds(new Set(filteredAgents.map((a) => a.id)));
    }
  };

  const handleSubmit = () => {
    if (!selectedGroupId || selectedAgentIds.size === 0) return;

    const agentIds = Array.from(selectedAgentIds);

    if (isRemoving) {
      onRemoveFromGroup(selectedGroupId, agentIds);
    } else {
      onAssign(selectedGroupId, agentIds);
    }

    handleClose();
  };

  const handleClose = () => {
    setSelectedGroupId(null);
    setSelectedAgentIds(new Set());
    setSearchQuery("");
    setIsRemoving(false);
    onOpenChange(false);
  };

  const selectedAgents = agents.filter((a) => selectedAgentIds.has(a.id));
  const groupedAgentIds = new Set(
    selectedGroupId ? groups.find((g) => g.id === selectedGroupId)?.agentIds || [] : []
  );
  const agentsInSelectedGroup = selectedAgents.filter((a) => groupedAgentIds.has(a.id));
  const agentsNotInSelectedGroup = selectedAgents.filter((a) => !groupedAgentIds.has(a.id));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-w-[95vw] w-full max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign to Group</DialogTitle>
          <DialogDescription>
            Select agents and assign them to a group. Agents can belong to multiple groups.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 flex-1 overflow-hidden">
          <div className="grid gap-2">
            <Label>Group</Label>
            <ToggleGroup
              type="single"
              value={selectedGroupId || ""}
              onValueChange={(value) => setSelectedGroupId(value || null)}
              className="flex flex-wrap gap-2 justify-start"
            >
              <ToggleGroupItem
                value=""
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors data-[state=off]:border-border data-[state=off]:hover:bg-muted",
                  selectedGroupId === null && "border-primary bg-primary/5"
                )}
              >
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span>Select a group</span>
              </ToggleGroupItem>
              {groups.map((group) => (
                <ToggleGroupItem
                  key={group.id}
                  value={group.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors data-[state=off]:border-border data-[state=off]:hover:bg-muted",
                    selectedGroupId === group.id && "border-primary bg-primary/5"
                  )}
                >
                  <div className={cn("h-3 w-3 rounded-full", group.color)} />
                  <span>{group.name}</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {group.agentIds.length}
                  </Badge>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {selectedGroupId && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="remove-mode"
                checked={isRemoving}
                onCheckedChange={(checked) => setIsRemoving(checked as boolean)}
              />
              <Label htmlFor="remove-mode" className="text-sm cursor-pointer">
                Remove mode (remove selected agents from this group)
              </Label>
            </div>
          )}

          <div className="grid gap-2 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <Label>Agents</Label>
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                {selectedAgentIds.size === filteredAgents.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <Input
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <ScrollArea className="flex-1 border rounded-md">
              <div className="p-2 space-y-1">
                {filteredAgents.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No agents found
                  </div>
                ) : (
                  filteredAgents.map((agent) => {
                    const isSelected = selectedAgentIds.has(agent.id);
                    const agentGroups = getGroupsForAgent(agent.id);
                    const isInSelectedGroup = selectedGroupId
                      ? agentGroups.some((g) => g.id === selectedGroupId)
                      : false;

                    return (
                      <Button
                        key={agent.id}
                        variant="ghost"
                        onClick={() => handleToggleAgent(agent.id)}
                        className={cn(
                          "w-full flex items-start gap-3 p-2 rounded-md text-left transition-colors justify-start h-auto",
                          isSelected ? "bg-accent" : "hover:bg-muted"
                        )}
                      >
                        <Checkbox checked={isSelected} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{agent.name}</span>
                            {isInSelectedGroup && selectedGroupId && (
                              <Badge variant="secondary" className="text-[10px]">
                                In group
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {agent.description || "No description"}
                          </p>
                          {agentGroups.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {agentGroups.slice(0, 3).map((g) => (
                                <Badge
                                  key={g.id}
                                  variant="secondary"
                                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px]"
                                >
                                  <div className={cn("h-1.5 w-1.5 rounded-full", g.color)} />
                                  <span className="truncate max-w-[60px]">{g.name}</span>
                                </Badge>
                              ))}
                              {agentGroups.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{agentGroups.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </Button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {selectedAgentIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {selectedAgentIds.size} selected
                </span>
                {selectedGroupId && (
                  <>
                    {isRemoving ? (
                      agentsInSelectedGroup.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {agentsInSelectedGroup.length} will be removed
                        </Badge>
                      )
                    ) : (
                      agentsNotInSelectedGroup.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {agentsNotInSelectedGroup.length} will be added
                        </Badge>
                      )
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedGroupId || selectedAgentIds.size === 0}
            variant={isRemoving ? "destructive" : "default"}
            className="w-full sm:w-auto"
          >
            {isRemoving ? "Remove from Group" : "Assign to Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
