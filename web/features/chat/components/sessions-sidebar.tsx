'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Session } from '../types';
import { SessionList } from './session-list';

interface SessionsSidebarProps {
  sessions?: Session[];
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
