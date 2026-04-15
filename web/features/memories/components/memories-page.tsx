'use client';

import { useState } from 'react';
import { Brain, Search, Trash2, AlertTriangle, Calendar, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageContainer } from '@/shared/components/page-container';
import { cn } from '@/shared/lib/utils';
import { Agent } from '@/features/agents/types';
import { Memory } from '../types';
import { useAgentMemories, useDeleteMemory } from '../hooks';

interface MemoryListProps {
  memories?: Memory[];
  loading: boolean;
  agentId?: string;
  onDelete?: (memory: Memory) => void;
}

function MemoryList({ memories, loading, agentId, onDelete }: MemoryListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!memories?.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Brain className="size-12 mx-auto mb-4 opacity-50" />
          <p>No memories found for this agent.</p>
          <p className="text-sm mt-1">Memories are created through agent interactions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {memories.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} agentId={agentId} onDelete={onDelete} />
      ))}
    </div>
  );
}

interface MemoryCardProps {
  memory: Memory;
  agentId?: string;
  onDelete?: (memory: Memory) => void;
}

function MemoryCard({ memory, agentId, onDelete }: MemoryCardProps) {
  const formattedDate = new Date(memory.timestamp).toLocaleDateString();

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{memory.content}</p>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {formattedDate}
              </span>
              {memory.category && (
                <span className="flex items-center gap-1">
                  <Tag className="size-3" />
                  <Badge variant="secondary" className="text-xs">
                    {memory.category}
                  </Badge>
                </span>
              )}
              <span className="text-xs font-mono">ID: {memory.id}</span>
            </div>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => onDelete(memory)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MemorySearchProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder?: string;
}

function MemorySearch({ value, onChange, onSearch, placeholder = 'Search memories...' }: MemorySearchProps) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      <Button onClick={onSearch}>
        <Search className="size-4 mr-2" />
        Search
      </Button>
    </div>
  );
}

interface MemoriesPageProps {
  agents?: Agent[];
  selectedAgentId?: string;
  onSelectAgent?: (id: string) => void;
}

export function MemoriesPage({ agents = [], selectedAgentId, onSelectAgent }: MemoriesPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [memoryToDelete, setMemoryToDelete] = useState<Memory | null>(null);

  const { data: memories, isLoading } = useAgentMemories(selectedAgentId || '', activeSearch);
  const deleteMemory = useDeleteMemory(selectedAgentId || '');

  const handleSearch = () => {
    setActiveSearch(searchQuery);
  };

  const handleDelete = async () => {
    if (memoryToDelete) {
      await deleteMemory.mutateAsync(memoryToDelete.id);
      setMemoryToDelete(null);
    }
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <PageContainer className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="size-6" />
            Memories
          </h1>
          <p className="text-muted-foreground">
            View and manage agent memories
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {agents.map((agent) => (
              <Button
                key={agent.id}
                variant={selectedAgentId === agent.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelectAgent?.(agent.id)}
              >
                {agent.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedAgentId && (
        <>
          <MemorySearch
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
          />

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {selectedAgent?.name}&apos;s Memories
            </h2>
            <Badge variant="secondary">
              {memories?.length || 0} memories
            </Badge>
          </div>

          <MemoryList
            memories={memories}
            loading={isLoading}
            agentId={selectedAgentId}
            onDelete={setMemoryToDelete}
          />
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!memoryToDelete} onOpenChange={() => setMemoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Memory?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this memory?
              <br />
              <span className="text-destructive font-medium">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemoryToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMemory.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMemory.isPending ? 'Deleting...' : 'Delete Memory'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
