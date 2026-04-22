'use client';

import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Session } from '../types';
import { SessionItem } from './session-item';
import { groupSessionsByRecency } from '../lib/session-grouping';

interface SessionListProps {
  sessions?: Session[];
  selectedId: string | null;
  onSessionClick: (sessionId: string) => void;
  isCreating?: boolean;
}

export function SessionList({ sessions, selectedId, onSessionClick, isCreating = false }: SessionListProps) {
  if (!sessions?.length && !isCreating) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No sessions yet.
      </div>
    );
  }

  const groupedSessions = groupSessionsByRecency(sessions);

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 pl-1 pr-1.5 py-2">
        {isCreating && (
          <div className="w-full flex items-center gap-2 px-2 py-2 rounded-md bg-accent/50 text-accent-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm font-medium">Creating new session...</span>
          </div>
        )}

        {groupedSessions.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-0.5 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isSelected={selectedId === session.id}
                  onClick={() => onSessionClick(session.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
