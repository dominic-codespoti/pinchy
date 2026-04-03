'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, Tag, Clock } from 'lucide-react';
import { useAgentMemories } from '@/features/memories/hooks';
import { Agent } from '../types';

interface AgentMemoryTabProps {
  agent: Agent;
}

export function AgentMemoryTab({ agent }: AgentMemoryTabProps) {
  const { data: memories = [], isLoading } = useAgentMemories(agent.id);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>Agent Memory</CardTitle>
          </div>
          <CardDescription>
            {memories.length} memory entries stored for this agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memories.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Brain className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No memories yet. The agent will store important information here during conversations.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {memories.slice(0, 10).map((memory) => (
                <div
                  key={memory.id}
                  className="rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{memory.content}</p>
                    </div>
                    {memory.category && (
                      <Badge variant="secondary" className="shrink-0">
                        {memory.category}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(memory.timestamp).toLocaleDateString()}
                    </span>
                    {memory.tags && memory.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {memory.tags.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {memories.length > 10 && (
                <p className="text-center text-sm text-muted-foreground">
                  + {memories.length - 10} more memories
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
