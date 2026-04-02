'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronUp, Send, Sparkles, Trash2, Copy, Clock, AlertCircle } from 'lucide-react';
import { sendTestMessage } from '../api/files-api';
import { TestMessageResponseSchema } from '@/lib/validation/schemas';
import { z } from 'zod';

interface TestMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'pending' | 'completed' | 'error';
  error?: string;
  timestamp: Date;
}

type TestMessageResponse = z.infer<typeof TestMessageResponseSchema>;

interface TestAgentPanelProps {
  agentId: string;
  agentName: string;
  defaultOpen?: boolean;
}

const PRESET_PROMPTS = [
  'Hello',
  'What can you do?',
  'Help me with a task',
  'What tools do you have?',
];

export function TestAgentPanel({ agentId, agentName, defaultOpen = false }: TestAgentPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ input?: number; output?: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const addMessage = useCallback((message: Omit<TestMessage, 'id' | 'timestamp'>): TestMessage => {
    const newMessage: TestMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<TestMessage>) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
    );
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    setResponseTime(null);
    setTokenUsage(null);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const content = input.trim();
    setInput('');
    setError(null);
    setResponseTime(null);
    setTokenUsage(null);
    setIsLoading(true);

    addMessage({
      role: 'user',
      content,
      status: 'completed',
    });

    const assistantMessage = addMessage({
      role: 'assistant',
      content: '',
      status: 'pending',
    });
    setPendingMessageId(assistantMessage.id);

    try {
      const startTime = Date.now();
      const data: TestMessageResponse = await sendTestMessage(agentId, content);

      updateMessage(assistantMessage.id, {
        status: 'completed',
        content: data.response || data.content || 'No response',
      });

      const elapsed = Date.now() - startTime;
      setResponseTime(elapsed);

      if (data.usage) {
        setTokenUsage({
          input: data.usage.input_tokens,
          output: data.usage.output_tokens,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      updateMessage(assistantMessage.id, {
        status: 'error',
        error: errorMessage,
      });
    } finally {
      setPendingMessageId(null);
      setIsLoading(false);
    }
  }, [input, isLoading, agentId, addMessage, updateMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePresetClick = (prompt: string) => {
    setInput(prompt);
  };

  const handleCopyResponse = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">Test Agent</CardTitle>
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">HTTP</Badge>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <div className="flex flex-wrap gap-1.5">
              {PRESET_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetClick(prompt)}
                  className="text-xs h-7 px-2"
                >
                  {prompt}
                </Button>
              ))}
            </div>

            {(responseTime || tokenUsage) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {responseTime && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{responseTime}ms</span>
                  </div>
                )}
                {tokenUsage?.input !== undefined && (
                  <span>In: {tokenUsage.input}</span>
                )}
                {tokenUsage?.output !== undefined && (
                  <span>Out: {tokenUsage.output}</span>
                )}
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <ScrollArea className="min-h-[200px] max-h-[400px] border rounded-md">
              <div ref={scrollRef} className="p-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-12">
                    <p>No messages yet.</p>
                    <p>Send a message to test {agentName}.</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
                      <div className={`group relative max-w-[85%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-md p-2.5`}>
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        {message.role === 'assistant' && message.status === 'completed' && message.content && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleCopyResponse(message.content)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isLoading && pendingMessageId && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-8">
                    <div className="flex gap-0.5">
                      <Skeleton className="h-1 w-1 rounded-full animate-bounce" />
                      <Skeleton className="h-1 w-1 rounded-full animate-bounce delay-100" />
                      <Skeleton className="h-1 w-1 rounded-full animate-bounce delay-200" />
                    </div>
                    <span className="text-xs">Thinking</span>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a test message..."
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
              <CardDescription className="flex items-center justify-between text-xs">
                <span>Enter to send, Shift+Enter for new line</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  disabled={messages.length === 0}
                  className="h-6 px-2 text-xs"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </CardDescription>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
