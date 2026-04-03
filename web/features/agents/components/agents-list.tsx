'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Bot, Search } from 'lucide-react';
import { useAgents } from '../hooks/use-agents';
import { Agent } from '../types';
import { AgentCard } from './agent-card';

interface AgentsListProps {
  onCreateAgent?: () => void;
  onTestAgent?: (agentId: string) => void;
  onEditAgent?: (agent: Agent) => void;
  onDeleteAgent?: (agent: Agent) => void;
}

export function AgentsList({
  onCreateAgent,
  onTestAgent,
  onEditAgent,
  onDeleteAgent,
}: AgentsListProps) {
  const { agents, isLoading, error } = useAgents();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const query = searchQuery.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.id.toLowerCase().includes(query) ||
        agent.config.provider.toLowerCase().includes(query) ||
        (agent.config.model && agent.config.model.toLowerCase().includes(query))
    );
  }, [agents, searchQuery]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Agents</h1>
            <p className="text-muted-foreground">Manage your AI agents</p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            New Agent
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error loading agents</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground">Manage your AI agents</p>
        </div>
        <Button onClick={onCreateAgent}>
          <Plus className="mr-2 h-4 w-4" />
          New Agent
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search agents by name, ID, provider, or model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filteredAgents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <Bot className="mb-4 h-12 w-12 text-muted-foreground" />
          <CardTitle className="mb-2">
            {searchQuery ? 'No matching agents' : 'No agents yet'}
          </CardTitle>
          <CardDescription className="mb-4 text-center max-w-sm">
            {searchQuery
              ? 'Try adjusting your search query'
              : 'Create your first agent to get started with AI automation'}
          </CardDescription>
          {!searchQuery && (
            <Button onClick={onCreateAgent}>
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onTest={onTestAgent}
              onEdit={onEditAgent}
              onDelete={onDeleteAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
