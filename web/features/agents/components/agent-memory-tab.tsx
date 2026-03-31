'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Memory } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MemoryCard } from './memory-card';
import { AddMemoryDialog } from './add-memory-dialog';
import { MemoryFilters } from './memory-filters';

const MEMORY_CATEGORIES = [
  { id: 'all', label: 'All', color: '' },
  { id: 'general', label: 'General', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { id: 'important', label: 'Important', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { id: 'todo', label: 'Todo', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { id: 'note', label: 'Note', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
];

interface MemoryTabProps {
  memories: Memory[];
  onAddMemory?: (content: string, category?: string) => Promise<void>;
  onUpdateMemory?: (memoryId: string, content: string) => Promise<void>;
  onDeleteMemory?: (memoryId: string) => Promise<void>;
}

export function MemoryTab({
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
}: MemoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const filteredMemories = useMemo(() => {
    return memories.filter((memory) => {
      const matchesSearch = searchQuery === '' ||
        memory.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' ||
        (memory.category?.toLowerCase() || 'general') === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [memories, searchQuery, selectedCategory]);

  const handleAddMemory = async (content: string, category?: string) => {
    if (onAddMemory) {
      await onAddMemory(content, category);
    }
    setIsAddDialogOpen(false);
  };

  if (memories.length === 0 && !searchQuery) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Memory</CardTitle>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Memory
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <CardDescription className="mb-4">No memories recorded yet</CardDescription>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add First Memory
            </Button>
          </div>
          <AddMemoryDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            onSubmit={handleAddMemory}
            categories={MEMORY_CATEGORIES.filter(c => c.id !== 'all')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Memory ({filteredMemories.length})</CardTitle>
        <div className="flex items-center gap-2">
          <Link href="/memories/query">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1" />
              Advanced
            </Button>
          </Link>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Memory
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <MemoryFilters
          categories={MEMORY_CATEGORIES}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        <ScrollArea className="h-[400px] pr-4">
          {filteredMemories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery || selectedCategory !== 'all'
                ? 'No memories match your filters'
                : 'No memories recorded yet'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onUpdate={onUpdateMemory}
                  onDelete={onDeleteMemory}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <AddMemoryDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSubmit={handleAddMemory}
          categories={MEMORY_CATEGORIES.filter(c => c.id !== 'all')}
        />
      </CardContent>
    </Card>
  );
}

export function MemoryTabSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-28" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-20" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-full" />
                <div className="flex items-center gap-2 mt-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
