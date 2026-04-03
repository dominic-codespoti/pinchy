'use client';

import { useState } from 'react';
import { MemoriesPage } from '@/features/memories';
import { useAgents } from '@/features/agents';
import { Skeleton } from '@/components/ui/skeleton';
import { PageContainer } from '@/shared/components/page-container';
import { Brain } from 'lucide-react';

export default function MemoriesIndexPage() {
  const { agents, isLoading } = useAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  if (isLoading) {
    return (
      <PageContainer className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Brain className="size-6" />
          <h1 className="text-2xl font-bold">Memories</h1>
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  return (
    <MemoriesPage
      agents={agents}
      selectedAgentId={selectedAgentId}
      onSelectAgent={setSelectedAgentId}
    />
  );
}
