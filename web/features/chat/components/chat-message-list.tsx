'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import { Bot, Compass, FileText, Lightbulb, ListChecks, Sparkles, Bug, Scale, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
  sessionIdFromUrl: string | null;
  agents?: Agent[];
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  onNewChat: () => void;
  agentsLoading?: boolean;
  isCreatingSession?: boolean;
  isSessionHydrating?: boolean;
  isMessagesHydrating?: boolean;
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
  sessionIdFromUrl,
  agents,
  onSendMessage,
  onStopStreaming,
  onNewChat,
  agentsLoading,
  isCreatingSession = false,
  isSessionHydrating = false,
  isMessagesHydrating = false,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!(viewport instanceof HTMLDivElement)) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, streamingContent]);

  const selectedAgent = useMemo(
    () => agents?.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId]
  );

  const hasSessionSelection = Boolean(sessionIdFromUrl);
  const showLoadingState = sessionsLoading || isSessionHydrating || (hasSessionSelection && isMessagesHydrating);
  const showMessages = messages.length > 0;
  const showEmptyState = !showLoadingState && !showMessages;

  const handlePromptSelect = (prompt: string) => {
    setDraft(prompt);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const nextLength = prompt.length;
      inputRef.current?.setSelectionRange(nextLength, nextLength);
    });
  };

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
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-w-0 px-3 py-3 sm:p-4">
        {showLoadingState ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : showEmptyState ? (
          <EmptyState
            currentSession={currentSession}
            sessionIdFromUrl={sessionIdFromUrl}
            isSessionHydrating={isSessionHydrating}
            selectedAgentId={selectedAgentId}
            selectedAgentName={selectedAgent?.name}
            agentsLoading={agentsLoading}
            onNewChat={onNewChat}
            onPromptSelect={handlePromptSelect}
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

      <div className="bg-background px-3 pb-2 pt-3 sm:p-4">
        <MessageInput
          onSend={onSendMessage}
          value={draft}
          onValueChange={setDraft}
          disabled={!isWsConnected || !selectedAgentId || isStreaming || isCreatingSession}
          isWorking={isStreaming || isCreatingSession}
          placeholder={placeholder}
          textareaRef={inputRef}
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
  currentSession?: ChatSession;
  sessionIdFromUrl: string | null;
  isSessionHydrating: boolean;
  selectedAgentName?: string;
  selectedAgentId?: string;
  agentsLoading?: boolean;
  onNewChat?: () => void;
  onPromptSelect: (prompt: string) => void;
}

const PROMPT_CARDS = [
  { title: 'Plan my day', prompt: 'Help me plan my day and prioritize the most important tasks.', icon: Compass },
  { title: 'Draft a message', prompt: 'Draft a clear message I can send, then help me tighten the tone.', icon: FileText },
  { title: 'Summarize something', prompt: 'Summarize this clearly and pull out the most important points.', icon: Sparkles },
  { title: 'Brainstorm ideas', prompt: 'Brainstorm a few strong ideas and group them by direction.', icon: Lightbulb },
  { title: 'Debug an issue', prompt: 'Help me debug this issue step by step and suggest likely causes.', icon: Bug },
  { title: 'Learn quickly', prompt: 'Teach me this topic quickly with the essentials, examples, and next steps.', icon: Bot },
  { title: 'Compare options', prompt: 'Compare these options with tradeoffs, risks, and a recommendation.', icon: Scale },
  { title: 'Create a checklist', prompt: 'Turn this into a practical checklist I can work through.', icon: ListChecks },
];

function EmptyState({
  currentSession,
  sessionIdFromUrl,
  isSessionHydrating,
  selectedAgentName,
  selectedAgentId,
  agentsLoading,
  onNewChat,
  onPromptSelect,
}: EmptyStateProps) {
  const hasAgent = Boolean(selectedAgentId);
  const hasSessionSelection = Boolean(sessionIdFromUrl);
  const headline = hasAgent
    ? `What should ${selectedAgentName || 'this agent'} help with?`
    : 'Choose an agent to get started';

  const subtext = hasAgent
    ? hasSessionSelection
      ? currentSession?.title || 'Start with a prompt below, or type your own message.'
      : 'Pick a starter prompt below, or open a blank chat and write your own.'
    : agentsLoading
      ? 'Loading agents...'
      : 'Select an agent from the sidebar, then choose a starter prompt.';

  return (
    <div className="flex h-full items-center justify-center py-8">
      <Card className="mx-auto w-full max-w-5xl border-dashed">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">{headline}</CardTitle>
          <CardDescription className="mx-auto max-w-2xl text-sm sm:text-base">
            {subtext}
          </CardDescription>
          {isSessionHydrating && (
            <CardDescription>Preparing your new chat…</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {hasAgent ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PROMPT_CARDS.map(({ title, prompt, icon: Icon }) => (
                <Button
                  key={title}
                  type="button"
                  variant="outline"
                  className="h-auto min-h-32 flex-col items-start gap-3 whitespace-normal px-4 py-4 text-left"
                  onClick={() => onPromptSelect(prompt)}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{title}</div>
                    <div className="text-sm text-muted-foreground">{prompt}</div>
                  </div>
                </Button>
              ))}
            </div>
          ) : (
            <Card className="mx-auto max-w-xl">
              <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                <Bot className="size-4" />
                <span>Select an agent from the sidebar to unlock starter prompts.</span>
              </CardContent>
            </Card>
          )}

          {!hasSessionSelection && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                onClick={onNewChat}
                disabled={!selectedAgentId}
              >
                Start blank chat
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
