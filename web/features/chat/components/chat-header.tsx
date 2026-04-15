'use client';

import { useMemo } from 'react';
import { Wifi, WifiOff, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/shared/lib/utils';
import { Agent } from '@/features/agents/types';
import { Session } from '../types';
import { SessionsSidebar } from './sessions-sidebar';
import { AgentSelector } from './agent-selector';

interface ChatHeaderProps {
  currentSession?: Session;
  selectedAgentId: string;
  agents?: Agent[];
  isWsConnected: boolean;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  agentsLoading: boolean;
  sessionsLoading: boolean;
  filteredSessions: Session[];
  currentSessionId: string | null;
  onSessionClick: (sessionId: string) => void;
  onAgentSelect: (id: string) => void;
  onNewChat: () => void;
  isCreatingSession?: boolean;
}

export function ChatHeader({
  currentSession,
  selectedAgentId,
  agents,
  isWsConnected,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  agentsLoading,
  sessionsLoading,
  filteredSessions,
  currentSessionId,
  onSessionClick,
  onAgentSelect,
  onNewChat,
  isCreatingSession = false,
}: ChatHeaderProps) {
  const selectedAgentName = useMemo(() => {
    return agents?.find(a => a.id === selectedAgentId)?.name;
  }, [agents, selectedAgentId]);

  const title = currentSession?.title ||
    (selectedAgentId ? `Chat with ${selectedAgentName || selectedAgentId}` : 'Select an Agent');

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b">
      <div className="flex items-center gap-3">
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
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
                  onSelect={(id) => { onAgentSelect(id); setMobileSidebarOpen(false); }}
                  isLoading={agentsLoading}
                />
              </div>

              <SessionsSidebar
                sessions={filteredSessions}
                selectedId={currentSessionId}
                onNewChat={() => { onNewChat(); setMobileSidebarOpen(false); }}
                onSessionClick={(id) => { onSessionClick(id); setMobileSidebarOpen(false); }}
                isCreating={isCreatingSession}
              />
            </div>
          </SheetContent>
        </Sheet>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold truncate max-w-[200px] sm:max-w-[300px] lg:max-w-[400px]">
              {title}
            </h1>
            {currentSession && (
              <span className="text-xs text-muted-foreground">{currentSession.messageCount} messages</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', isWsConnected ? 'bg-green-500' : 'bg-destructive')} />
            <span>{isWsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-2">
        {isWsConnected ? <Wifi className="size-4 text-green-500" /> : <WifiOff className="size-4 text-destructive" />}
      </div>
    </header>
  );
}
