'use client';

import { useMemo } from 'react';
import { Clock, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/shared/lib/utils';
import { ChatSession } from '../types';

interface SessionItemProps {
  session: ChatSession;
  isSelected: boolean;
  onClick: () => void;
}

export function SessionItem({ session, isSelected, onClick }: SessionItemProps) {
  const timeAgo = useMemo(() => {
    return formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true });
  }, [session.updatedAt]);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors',
        isSelected
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted'
      )}
    >
      <MessageSquare
        className={cn(
          'size-4 mt-0.5 shrink-0',
          isSelected ? 'text-accent-foreground' : 'text-muted-foreground'
        )}
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium truncate',
            isSelected ? 'text-accent-foreground' : 'text-foreground'
          )}
        >
          {session.title || 'Untitled Session'}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {timeAgo}
          </span>
          <span>{session.messageCount} messages</span>
        </div>
      </div>
    </button>
  );
}
