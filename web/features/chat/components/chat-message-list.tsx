'use client';

import { useRef, useEffect } from 'react';
import { WifiOff, Bot, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Agent } from '@/features/agents/types';
import { Message } from '@/shared/types/common';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';

interface ChatSession {
  id: string;
  title?: string;
  messageCount: number;
}

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingStartTime: Date;
  isWsConnected: boolean;
  selectedAgentId: string;
  sessionsLoading: boolean;
  currentSession?: ChatSession;
  agents?: Agent[];
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  onNewChat: () => void;
  onSelectAgent?: (id: string) => void;
  agentsLoading?: boolean;
  isCreatingSession?: boolean;
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamingContent,
  streamingStartTime,
  isWsConnected,
  selectedAgentId,
  sessionsLoading,
  currentSession,
  agents,
  onSendMessage,
  onStopStreaming,
  onNewChat,
  onSelectAgent,
  agentsLoading,
  isCreatingSession = false,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const hasAgent = !!selectedAgentId;

  const placeholder = !selectedAgentId
    ? 'Select an agent to start chatting...'
    : !isWsConnected
      ? 'Waiting for connection...'
      : isCreatingSession
        ? 'Creating new session...'
        : 'Type a message...';

  // Calculate streaming duration
  const streamingDuration = isStreaming
    ? Math.floor((new Date().getTime() - streamingStartTime.getTime()) / 1000)
    : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1 p-4">
        {sessionsLoading || !currentSession ? (
          <div className="space-y-4">
            <div key="skeleton-1" className="h-20 bg-muted animate-pulse rounded" />
            <div key="skeleton-2" className="h-20 bg-muted animate-pulse rounded" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
            agentsLoading={agentsLoading}
            onNewChat={onNewChat}
          />
        ) : (
          <MessageList messages={messages} isLoading={isStreaming && !streamingContent} />
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      {isStreaming && (
        <div className="px-4 py-2 border-t bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span key="dot-1" className="animate-bounce">.</span>
                <span key="dot-2" className="animate-bounce delay-100">.</span>
                <span key="dot-3" className="animate-bounce delay-200">.</span>
              </div>
              <span className="text-sm text-muted-foreground">Generating response</span>
              <span className="text-xs text-muted-foreground">({streamingDuration}s)</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onStopStreaming}>
              Stop
            </Button>
          </div>
        </div>
      )}

      <Separator />

      <div className="p-4 bg-background">
        <MessageInput
          onSend={onSendMessage}
          disabled={!isWsConnected || !selectedAgentId || isStreaming || isCreatingSession}
          placeholder={placeholder}
        />

        {!isWsConnected && (
          <div className="flex items-center gap-2 mt-2 text-xs text-destructive">
            <WifiOff className="size-3" />
            <span>Disconnected from server. Messages cannot be sent.</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  agents?: Agent[];
  selectedAgentId?: string;
  onSelectAgent?: (id: string) => void;
  agentsLoading?: boolean;
  onNewChat?: () => void;
}

function EmptyState({
  agents,
  selectedAgentId,
  onSelectAgent,
  agentsLoading,
  onNewChat,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-2">
          <Bot className="size-12 mx-auto text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium">Start a new chat</h3>
          <p className="text-sm text-muted-foreground">
            Select an agent and start a conversation
          </p>
        </div>

        <div className="space-y-3">
          <AgentSelectorCompact
            agents={agents}
            selectedId={selectedAgentId || ''}
            onSelect={onSelectAgent || (() => {})}
            isLoading={agentsLoading || false}
          />

          <Button
            onClick={onNewChat}
            disabled={!selectedAgentId}
            className="w-full"
          >
            New Chat
          </Button>
        </div>
      </div>
    </div>
  );
}

interface AgentSelectorCompactProps {
  agents?: Agent[];
  selectedId: string;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

function AgentSelectorCompact({ agents, selectedId, onSelect, isLoading }: AgentSelectorCompactProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading agents...</span>
      </div>
    );
  }

  if (!agents?.length) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">No agents available</span>
      </div>
    );
  }

  const selectedAgent = agents.find(a => a.id === selectedId);

  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2">
          <Bot className="size-4" />
          <span className="truncate">{selectedAgent?.name || selectedId || 'Select agent...'}</span>
        </div>
        <ChevronDown className="size-4 ml-auto" />
      </SelectTrigger>
      <SelectContent>
        {agents.map(agent => (
          <SelectItem key={agent.id} value={agent.id}>
            <div className="flex items-center gap-2">
              <Bot className="size-4" />
              <span>{agent.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
