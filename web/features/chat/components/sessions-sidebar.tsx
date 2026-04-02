'use client';

import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatSession } from '../types';
import { SessionItem } from './session-item';

interface SessionsSidebarProps {
  sessions?: ChatSession[];
  selectedId: string | null;
  onNewChat: () => void;
  onSessionClick: (sessionId: string) => void;
  isCreating?: boolean;
}

export function SessionsSidebar({
  sessions,
  selectedId,
  onNewChat,
  onSessionClick,
  isCreating = false,
}: SessionsSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 border-b p-4">
        <h2 className="font-semibold">Sessions</h2>
        <Button onClick={onNewChat} disabled={isCreating}>
          <Plus className="size-4" />
          New Chat
        </Button>
      </div>
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        onSessionClick={onSessionClick}
        isCreating={isCreating}
      />
    </div>
  );
}

interface SessionListProps {
  sessions?: ChatSession[];
  selectedId: string | null;
  onSessionClick: (sessionId: string) => void;
}

function SessionList({ sessions, selectedId, onSessionClick, isCreating = false }: SessionListProps & { isCreating?: boolean }) {
  if (!sessions?.length && !isCreating) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No sessions yet.
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-1 p-2">
        {isCreating && (
          <div className="w-full flex items-center gap-2 px-2 py-2 rounded-md bg-accent/50 text-accent-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm font-medium">Creating new session...</span>
          </div>
        )}
        {sessions?.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isSelected={selectedId === session.id}
            onClick={() => onSessionClick(session.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
