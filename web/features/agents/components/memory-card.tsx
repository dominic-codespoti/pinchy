'use client';

import { useState } from 'react';
import { Memory } from '../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { DeleteMemoryDialog } from './delete-memory-dialog';
import { Card, CardContent } from '@/components/ui/card';

const MEMORY_CATEGORIES = [
  { id: 'general', label: 'General', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { id: 'important', label: 'Important', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { id: 'todo', label: 'Todo', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { id: 'note', label: 'Note', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
];

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface MemoryCardProps {
  memory: Memory;
  onDelete?: (memoryId: string) => Promise<void>;
}

const MAX_PREVIEW_LENGTH = 150;

export function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const category = memory.category?.toLowerCase() || 'general';
  const categoryStyle = MEMORY_CATEGORIES.find(c => c.id === category)?.color ||
    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  const categoryLabel = MEMORY_CATEGORIES.find(c => c.id === category)?.label ||
    category.charAt(0).toUpperCase() + category.slice(1);

  const isLongContent = memory.content.length > MAX_PREVIEW_LENGTH;
  const displayContent = isExpanded || !isLongContent
    ? memory.content
    : memory.content.slice(0, MAX_PREVIEW_LENGTH) + '...';

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsLoading(true);
    try {
      await onDelete(memory.id);
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <Card className="group hover:bg-muted/50 transition-colors">
        <CardContent className="pt-6">
          <p className="text-sm whitespace-pre-wrap">{displayContent}</p>

          {isLongContent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-muted-foreground hover:text-primary mt-1 flex items-center gap-1 h-auto px-0 py-1"
            >
              {isExpanded ? (
                <><ChevronUp className="h-3 w-3" /> Show less</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> Show more</>
              )}
            </Button>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={`text-xs ${categoryStyle}`}>
                {categoryLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(memory.timestamp)}
              </span>
            </div>

            {onDelete && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <DeleteMemoryDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        isLoading={isLoading}
      />
    </>
  );
}
