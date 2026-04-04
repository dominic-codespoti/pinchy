'use client';

import { useState } from 'react';
import { AgentsList } from '@/features/agents';
import { CreateAgentDialog, DeleteAgentDialog, EditAgentSheet } from '@/features/agents/components';
import { useCreateAgent, useDeleteAgent, useUpdateAgent } from '@/features/agents/hooks';
import { Agent } from '@/features/agents/types';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

function AgentsListLoading() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="mb-2 h-8 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}

function AgentsPageContent() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [agentToEdit, setAgentToEdit] = useState<Agent | null>(null);
  const { createAgent, isPending: isCreating } = useCreateAgent();
  const { deleteAgent, isPending: isDeleting } = useDeleteAgent();
  const { updateAgent, isPending: isUpdating } = useUpdateAgent();
  const router = useRouter();

  const handleCreateAgent = async (data: { id: string; model: string; provider: string }) => {
    await createAgent({
      id: data.id,
      model: data.model,
      provider: data.provider,
    });
    setCreateDialogOpen(false);
  };

  const handleDeleteAgent = async (agentId: string) => {
    await deleteAgent(agentId);
    setAgentToDelete(null);
  };

  const handleEditAgent = (agent: Agent) => {
    setAgentToEdit(agent);
  };

  const handleUpdateAgent = async (agentId: string, data: Partial<Agent>) => {
    await updateAgent(agentId, {
      model: data.config?.model,
      heartbeat_secs: data.heartbeatInterval,
      enabled_skills: data.enabledSkills ?? undefined,
    });
    setAgentToEdit(null);
  };

  const handleTestAgent = (agentId: string) => {
    router.push(`/agents/${agentId}?tab=test`);
  };

  return (
    <>
      <AgentsList
        onCreateAgent={() => setCreateDialogOpen(true)}
        onDeleteAgent={(agent) => setAgentToDelete(agent)}
        onEditAgent={handleEditAgent}
        onTestAgent={handleTestAgent}
      />
      
      <CreateAgentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={handleCreateAgent}
      />
      
      <DeleteAgentDialog
        agent={agentToDelete}
        open={!!agentToDelete}
        onOpenChange={(open) => {
          if (!open) setAgentToDelete(null);
        }}
        onDelete={handleDeleteAgent}
      />

      {agentToEdit && (
        <EditAgentSheet
          agent={agentToEdit}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAgentToEdit(null);
          }}
          onSave={handleUpdateAgent}
        />
      )}
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<AgentsListLoading />}>
      <AgentsPageContent />
    </Suspense>
  );
}
