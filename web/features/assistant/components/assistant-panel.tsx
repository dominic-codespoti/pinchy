'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Send,
  Trash2,
  Bot,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { usePinchyChat } from '../hooks';
import { PinchyContext } from '../types';
import { AssistantMessageBubble, AssistantLoadingIndicator } from './';

interface AssistantPanelProps {
  context: PinchyContext;
  title?: string;
  defaultOpen?: boolean;
}

export function AssistantPanel({
  context,
  title = 'Pinchy',
  defaultOpen = true,
}: AssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendMessage, clearMessages } = usePinchyChat({
    context,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    await sendMessage(input.trim());
    setInput('');
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyResponse = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const contextLabel =
    context.type === 'agent'
      ? `Agent: ${context.agentName}`
      : context.type === 'group'
      ? `Group: ${context.groupName}`
      : 'Global';

  const contextBadge = context.type === 'agent' ? 'Agent' : context.type === 'group' ? 'Group' : 'Global';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Badge variant="outline" className="text-xs">
              {contextBadge}
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {contextLabel}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {(context.type === 'group' || context.type === 'global') && (
          <p className="text-xs text-muted-foreground sm:hidden mt-1">{contextLabel}</p>
        )}
      </CardHeader>

      {isOpen && (
        <CardContent className="space-y-3 pt-0">
          <ScrollArea className="h-[250px] border rounded-md">
            <div ref={scrollRef} className="p-3 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8">
                  <p>Chat with Pinchy about {context.type === 'global' ? 'your agents' : `this ${context.type}`}.</p>
                  <p className="mt-1">
                    Pinchy can help with agent management, file editing, and more.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <AssistantMessageBubble
                    key={message.id}
                    message={message}
                    onCopy={handleCopyResponse}
                  />
                ))
              )}
              {isLoading && (
                <AssistantLoadingIndicator className="text-sm text-muted-foreground" />
              )}
            </div>
          </ScrollArea>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask Pinchy about this ${context.type}...`}
                className="min-h-[60px] resize-none text-sm"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="shrink-0 h-[60px]"
                size="sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Enter to send, Shift+Enter for new line</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                disabled={messages.length === 0}
                className="h-6 px-2 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
