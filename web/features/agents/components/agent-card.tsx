'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Heart, Clock, Play, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Agent } from '../types';
import { getAgentProviderDisplayLabel, getSelectedAgentModelLabel } from '../model-options';

interface AgentCardProps {
  agent: Agent;
  onTest?: (agentId: string) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'error':
      return 'destructive';
    case 'inactive':
    default:
      return 'secondary';
  }
}

export function AgentCard({ agent, onTest, onEdit, onDelete }: AgentCardProps) {
  const modelLabel = getSelectedAgentModelLabel(agent.config.model, undefined);
  const providerLabel = getAgentProviderDisplayLabel(agent.config.provider);
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
              <CardDescription className="line-clamp-1">
                {modelLabel}
              </CardDescription>
            </div>
          </div>
          <Badge variant={getStatusVariant(agent.status)}>
            {agent.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {providerLabel}
          </span>
          {agent.hasHeartbeat && (
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              Heartbeat
            </span>
          )}
          {agent.sessionCount !== undefined && agent.sessionCount > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {agent.sessionCount} sessions
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex gap-2 pt-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onTest?.(agent.id)}
          aria-label={`Test ${agent.name}`}
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit?.(agent)}
          aria-label={`Edit ${agent.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:text-destructive"
          onClick={() => onDelete?.(agent)}
          aria-label={`Delete ${agent.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Link href={`/agents/${agent.id}`}>
          <Button variant="secondary" size="sm">
            View
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
