"use client";

import { useState } from "react";
import { Plus, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageContainer } from "@/shared/components/page-container";
import { cn } from "@/shared/lib/utils";
import { Agent } from "../types";
import { useCreateAgent, useAgents, useDeleteAgent } from "../hooks";
import { useAgentGroups } from "../hooks/use-agent-groups";
import { AgentsTable } from "./agents-table";
import { GroupManager } from "./group-manager/group-manager";
import { CreateAgentForm } from "./create-agent-form";
import { DeleteDialog } from "./delete-dialog";
import { CloneAgentDialog } from "./clone-agent-dialog";

// Note: Export button is a feature of agents but uses shared export functionality
// For now, we'll leave this as a placeholder that can be wired up later
function ExportAgentsButton() {
  return (
    <Button variant="outline" size="sm">
      Export
    </Button>
  );
}

AgentsPage.displayName = "AgentsPage";

export function AgentsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloningAgent, setCloningAgent] = useState<Agent | null>(null);

  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const { data: agents } = useAgents();

  const {
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    assignAgentsToGroup,
    removeAgentsFromGroup,
    getUngroupedAgents,
  } = useAgentGroups();

  const handleDelete = (agent: Agent) => {
    setDeletingAgent(agent);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingAgent) {
      await deleteAgent.mutateAsync(deletingAgent.id);
      setDeleteDialogOpen(false);
      setDeletingAgent(null);
    }
  };

  const handleClone = (agent: Agent) => {
    setCloningAgent(agent);
    setCloneDialogOpen(true);
  };

  const agentCounts = agents?.reduce((acc, agent) => {
    groups.forEach((group) => {
      if (group.agentIds.includes(agent.id)) {
        acc[group.id] = (acc[group.id] || 0) + 1;
      }
    });
    return acc;
  }, {} as Record<string, number>) || {};

  const allAgentIds = agents?.map((a) => a.id) || [];
  const ungroupedAgentIds = getUngroupedAgents(allAgentIds);

  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Agents</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn("w-full sm:w-auto", !sidebarOpen && "lg:hidden")}
          >
            <Folder data-icon />
            {sidebarOpen ? "Hide Groups" : "Show Groups"}
          </Button>
          <ExportAgentsButton />
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus data-icon />
                New Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] max-w-[95vw] w-full">
              <DialogHeader>
                <DialogTitle>Create New Agent</DialogTitle>
                <DialogDescription>
                  Create a new agent with a unique ID. The agent will be
                  initialized with default configuration files.
                </DialogDescription>
              </DialogHeader>
              <CreateAgentForm
                onClose={() => setCreateDialogOpen(false)}
                onCreate={async (id: string, model: string) => {
                  await createAgent.mutateAsync({ id: id.trim(), model: model || undefined });
                  setCreateDialogOpen(false);
                }}
                isPending={createAgent.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-6">
        <aside
          className={cn(
            "w-64 shrink-0 transition-all duration-200",
            sidebarOpen ? "block" : "hidden lg:block"
          )}
        >
          <div className="sticky top-4 space-y-4">
            <GroupManager
              groups={groups}
              onCreate={createGroup}
              onUpdate={updateGroup}
              onDelete={deleteGroup}
              onReorder={reorderGroups}
              selectedGroupId={selectedGroupId}
              onSelectGroup={setSelectedGroupId}
              agentCounts={agentCounts}
              ungroupedCount={ungroupedAgentIds.length}
            />
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <AgentsTable
            groups={groups}
            selectedGroupId={selectedGroupId}
            onAssignAgents={assignAgentsToGroup}
            onRemoveAgents={removeAgentsFromGroup}
          />
        </main>
      </div>

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        agentName={deletingAgent?.name || ""}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteAgent.isPending}
      />

      <CloneAgentDialog
        agent={cloningAgent}
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        existingAgentNames={agents?.map((a) => a.name) || []}
      />
    </PageContainer>
  );
}
