'use client';

import { Plus, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Agent } from '@/features/agents/types';
import { Session } from '../types';
import { AgentSelector } from './agent-selector';
import { SessionList } from './session-list';

interface ChatSidebarProps {
  agents?: Agent[];
  selectedAgentId: string;
  onAgentSelect: (id: string) => void;
  agentsLoading: boolean;
  sessions?: Session[];
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

      <div className="px-3 py-2">
        <h3 className="py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Recent Sessions
        </h3>
      </div>
      {sessionsLoading ? (
        <div className="px-4 py-4 text-center text-sm text-muted-foreground">
          Loading sessions...
        </div>
      ) : !sessions?.length && !isCreatingSession ? (
        <div className="px-4 py-4 text-center text-sm text-muted-foreground">
          No sessions yet. Start a new chat!
        </div>
      ) : (
        <SessionList
          sessions={sessions}
          selectedId={currentSessionId}
          onSessionClick={onSessionClick}
          isCreating={isCreatingSession}
        />
      )}
    </div>
  );
}
