'use client';

import { Bot } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/shared/lib/utils';
import { Agent } from '@/features/agents/types';

interface AgentSelectorProps {
  agents?: Agent[];
  selectedId: string;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

export function AgentSelector({
  agents,
  selectedId,
  onSelect,
  isLoading,
}: AgentSelectorProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading agents...</span>
      </div>
    );
  }

  if (!agents?.length) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">No agents available</span>
      </div>
    );
  }

  const selectedAgent = agents.find(a => a.id === selectedId);

  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2">
          <Bot className="size-4" />
          <span className="truncate">
            {selectedAgent?.name || selectedId || 'Select agent...'}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {agents.map(agent => (
          <SelectItem key={agent.id} value={agent.id}>
            <div className="flex items-center gap-2">
              <Bot className="size-4" />
              <span>{agent.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
