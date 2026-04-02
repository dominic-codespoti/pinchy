'use client';

import { Plus, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Agent } from '@/features/agents/types';
import { ChatSession } from '../types';
import { SessionItem } from './session-item';
import { AgentSelector } from './agent-selector';

interface ChatSidebarProps {
  agents?: Agent[];
  selectedAgentId: string;
  onAgentSelect: (id: string) => void;
  agentsLoading: boolean;
  sessions?: ChatSession[];
  sessionsLoading: boolean;
  currentSessionId: string | null;
  onSessionClick: (sessionId: string) => void;
  onNewChat: () => void;
  isWsConnected: boolean;
  isCreatingSession?: boolean;
}

export function ChatSidebar({
  agents,
  selectedAgentId,
  onAgentSelect,
  agentsLoading,
  sessions,
  sessionsLoading,
  currentSessionId,
  onSessionClick,
  onNewChat,
  isWsConnected,
  isCreatingSession = false,
}: ChatSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Chat</h2>
          {isWsConnected ? (
            <Wifi className="size-4 text-green-500" />
          ) : (
            <WifiOff className="size-4 text-destructive" />
          )}
        </div>

        <AgentSelector
          agents={agents}
          selectedId={selectedAgentId}
          onSelect={onAgentSelect}
          isLoading={agentsLoading}
        />

        <Button
          onClick={onNewChat}
          disabled={!selectedAgentId}
          className="w-full"
        >
          <Plus className="size-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recent Sessions
          </h3>
          <div className="space-y-1">
            {isCreatingSession && (
              <div className="w-full flex items-center gap-2 px-2 py-2 rounded-md bg-accent/50 text-accent-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm font-medium">Creating new session...</span>
              </div>
            )}
            {sessionsLoading ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                Loading sessions...
              </div>
            ) : !sessions?.length && !isCreatingSession ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No sessions yet. Start a new chat!
              </div>
            ) : (
              sessions?.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isSelected={session.id === currentSessionId}
                  onClick={() => onSessionClick(session.id)}
                />
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
