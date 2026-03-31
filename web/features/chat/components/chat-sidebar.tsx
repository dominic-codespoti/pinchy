'use client';

import { Plus, Wifi, WifiOff } from 'lucide-react';
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
            {sessionsLoading ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                Loading sessions...
              </div>
            ) : !sessions?.length ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No sessions yet. Start a new chat!
              </div>
            ) : (
              sessions.map(session => (
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
