'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Memory } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Filter, Brain } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MemoryCard } from './memory-card';
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
  onDeleteMemory?: (memoryId: string) => Promise<void>;
}

export function MemoryTab({
  memories,
  onDeleteMemory,
}: MemoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredMemories = useMemo(() => {
    return memories.filter((memory) => {
      const matchesSearch = searchQuery === '' ||
        memory.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' ||
        (memory.category?.toLowerCase() || 'general') === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [memories, searchQuery, selectedCategory]);

  // Empty state - compact with icon
  if (memories.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Brain className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No memories recorded yet
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Memories are created using the save_memory tool
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium">
          Memory ({filteredMemories.length})
        </CardTitle>
        <Link href="/memories/query">
          <Button variant="outline" size="sm">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Advanced
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        <MemoryFilters
          categories={MEMORY_CATEGORIES}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        <ScrollArea className="max-h-[300px] pr-2">
          {filteredMemories.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {searchQuery || selectedCategory !== 'all'
                ? 'No memories match your filters'
                : 'No memories recorded yet'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMemories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onDelete={onDeleteMemory}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function MemoryTabSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <Skeleton className="h-9 w-full" />
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-7 w-16" />
          ))}
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
