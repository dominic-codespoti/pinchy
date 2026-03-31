"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableRow,
} from "@/components/ui/table";
import { Agent, AgentGroup } from "../types";
import { useAgents, useDeleteAgent, useUpdateAgent } from "../hooks";

import { EmptyState } from "./empty-state";
import { TableSkeleton } from "./table-skeleton";
import { GroupHeader } from "./group-header";
import { AgentsTableHeader } from "./agents-table-header";
import { AgentsTableRow } from "./agents-table-row";
import { AgentMobileCard } from "./agent-mobile-card";
import { DeleteDialog } from "./delete-dialog";
import { BulkActionsToolbar } from "./bulk-actions-toolbar";
import { BulkDeleteDialog } from "./bulk-delete-dialog";
import { AssignToGroupDialog } from "./assign-to-group-dialog";
import { CloneAgentDialog } from "./clone-agent-dialog";

import { useAgentSorting } from "./use-agent-sorting";
import { useAgentSelection } from "./use-agent-selection";
import { useAgentDialogs } from "./use-agent-dialogs";
import { filterAgentsByGroup } from "./agent-utils";

interface AgentsTableProps {
  groups: AgentGroup[];
  selectedGroupId: string | null;
  onAssignAgents: (groupId: string, agentIds: string[]) => void;
  onRemoveAgents: (groupId: string, agentIds: string[]) => void;
}

AgentsTable.displayName = "AgentsTable";

export function AgentsTable({
  groups,
  selectedGroupId,
  onAssignAgents,
  onRemoveAgents,
}: AgentsTableProps) {
  const router = useRouter();
  const { data: agents, isLoading } = useAgents();
  const deleteAgent = useDeleteAgent();
  const updateAgent = useUpdateAgent();

  const { sort, handleSort, sortedAgents } = useAgentSorting(agents || []);
  const { selectedIds, toggleSelection, toggleAll, clearSelection, allSelected, someSelected } = useAgentSelection();

  const {
    deleteDialog,
    setDeleteDialog,
    bulkDeleteDialog,
    setBulkDeleteDialog,
    cloneDialog,
    setCloneDialog,
    assignDialogOpen,
    setAssignDialogOpen,
  } = useAgentDialogs();

  const filteredAgents = useMemo(
    () => filterAgentsByGroup(sortedAgents, groups, selectedGroupId),
    [sortedAgents, groups, selectedGroupId]
  );

  const handleView = useCallback((id: string) => router.push(`/agents/${encodeURIComponent(id)}`), [router]);
  const handleEdit = useCallback((id: string) => router.push(`/agents/${encodeURIComponent(id)}`), [router]);

  const handleDelete = useCallback((id: string, name: string) => {
    setDeleteDialog({ open: true, agentId: id, agentName: name });
  }, [setDeleteDialog]);

  const handleClone = useCallback((id: string) => {
    const agent = agents?.find((a) => a.id === id);
    if (agent) setCloneDialog({ open: true, agent });
  }, [agents, setCloneDialog]);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteDialog.agentId) {
      await deleteAgent.mutateAsync(deleteDialog.agentId);
    }
    setDeleteDialog((prev) => ({ ...prev, open: false }));
  }, [deleteDialog.agentId, deleteAgent, setDeleteDialog]);

  const handleConfirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map((id) => deleteAgent.mutateAsync(id)));
    clearSelection();
    setBulkDeleteDialog(false);
  }, [selectedIds, deleteAgent, clearSelection, setBulkDeleteDialog]);

  const handleBulkEnable = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(
      ids.map((id) => updateAgent.mutateAsync({ id, data: { enabled: true } }))
    );
  }, [selectedIds, updateAgent]);

  const handleBulkDisable = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(
      ids.map((id) => updateAgent.mutateAsync({ id, data: { enabled: false } }))
    );
  }, [selectedIds, updateAgent]);

  if (isLoading) return <TableSkeleton />;
  if (!agents?.length) return <EmptyState />;

  const selectedAgents = filteredAgents.filter((a) => selectedIds.has(a.id));

  return (
    <>
      <GroupHeader
        groups={groups}
        selectedGroupId={selectedGroupId}
        filteredCount={filteredAgents.length}
      />

      <div className="hidden md:block rounded-md border">
        <Table>
          <AgentsTableHeader
            allSelected={allSelected(filteredAgents.length)}
            someSelected={someSelected(filteredAgents.length)}
            onToggleAll={() => toggleAll(filteredAgents)}
            onSort={handleSort}
          />
          <TableBody>
            {filteredAgents.map((agent) => (
              <AgentsTableRow
                key={agent.id}
                agent={agent}
                groups={groups}
                isSelected={selectedIds.has(agent.id)}
                onToggleSelection={() => toggleSelection(agent.id)}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onClone={handleClone}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-3">
        {filteredAgents.map((agent) => (
          <AgentMobileCard
            key={agent.id}
            agent={agent}
            isSelected={selectedIds.has(agent.id)}
            onSelect={() => toggleSelection(agent.id)}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onClone={handleClone}
            groups={groups}
          />
        ))}
      </div>

      <BulkActionsToolbar
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        onDelete={() => setBulkDeleteDialog(true)}
        onEnable={handleBulkEnable}
        onDisable={handleBulkDisable}
        isProcessing={deleteAgent.isPending || updateAgent.isPending}
        onAssignToGroup={() => setAssignDialogOpen(true)}
      />

      <DeleteDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
        agentName={deleteDialog.agentName}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteAgent.isPending}
      />

      <BulkDeleteDialog
        open={bulkDeleteDialog}
        onOpenChange={setBulkDeleteDialog}
        agents={selectedAgents}
        onConfirm={handleConfirmBulkDelete}
        isDeleting={deleteAgent.isPending}
      />

      <CloneAgentDialog
        agent={cloneDialog.agent}
        open={cloneDialog.open}
        onOpenChange={(open) => setCloneDialog((prev) => ({ ...prev, open }))}
        existingAgentNames={agents?.map((a) => a.name) || []}
      />

      <AssignToGroupDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        agents={agents || []}
        groups={groups}
        onAssign={onAssignAgents}
        onRemoveFromGroup={onRemoveAgents}
      />
    </>
  );
}
