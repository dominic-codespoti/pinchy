'use client';

import { useState } from 'react';
import { Search, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageContainer } from '@/shared/components/page-container';
import { Agent } from '@/features/agents/types';
import { MemoryQueryBuilder } from './query/memory-query-builder';
import { useAgentMemories } from '../hooks';
import { Memory } from '../types';

interface MemoryQueryProps {
  agents?: Agent[];
}

export function MemoryQueryPage({ agents = [] }: MemoryQueryProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const { data: memories, isLoading } = useAgentMemories(selectedAgentId);

  // Collect all memories from all agents if no specific agent selected
  const allMemories: Memory[] = memories || [];

  if (isLoading) {
    return (
      <PageContainer className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Search className="h-6 w-6" />
              Memory Query Builder
            </h1>
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-5" />
            Select Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {agents.map((agent) => (
              <Button
                key={agent.id}
                variant={selectedAgentId === agent.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedAgentId(agent.id)}
              >
                {agent.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedAgentId ? (
        <MemoryQueryBuilder memories={allMemories} agents={agents} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Brain className="size-12 mx-auto mb-4 opacity-50" />
            <p>Select an agent to start building queries</p>
            <p className="text-sm mt-1">
              Query builder helps you filter and search through agent memories
            </p>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
