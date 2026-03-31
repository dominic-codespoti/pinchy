'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebSocket } from '@/shared/providers/websocket';
import { useAgent } from '../hooks';
import { Send, Sparkles, Trash2, Copy, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const PRESET_PROMPTS = [
  'Hello',
  'What can you do?',
  'Help me with a task',
  'What tools do you have?',
  'Tell me about yourself',
];

interface TestMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'pending' | 'completed' | 'error';
  error?: string;
  timestamp: Date;
}

interface AgentTestPageProps {
  id: string;
}

export function AgentTestPage({ id }: AgentTestPageProps) {
  const { data: agent, isLoading: agentLoading } = useAgent(id);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ input?: number; output?: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { send, lastMessage, status } = useWebSocket();
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TestMessage[]>([]);

  // Scroll to bottom on new messages
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

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage || typeof lastMessage !== 'object') return;

    const msg = lastMessage as Record<string, unknown>;

    // Handle agent response messages
    if (msg.type === 'agent_response' && msg.agent_id === id) {
      const content = msg.content as string;
      const usage = msg.usage as { input_tokens?: number; output_tokens?: number } | undefined;

      if (pendingMessageId) {
        updateMessage(pendingMessageId, {
          status: 'completed',
          content,
        });
        setPendingMessageId(null);
        setIsLoading(false);

        const pendingMsg = messages.find((m: TestMessage) => m.id === pendingMessageId);
        if (pendingMsg) {
          const elapsed = Date.now() - new Date(pendingMsg.timestamp).getTime();
          setResponseTime(elapsed);
        }

        if (usage) {
          setTokenUsage({
            input: usage.input_tokens,
            output: usage.output_tokens,
          });
        }
      } else {
        addMessage({
          role: 'assistant',
          content,
          status: 'completed',
        });
        setIsLoading(false);
      }
    }

    // Handle errors
    if (msg.type === 'error' && msg.agent_id === id) {
      setError((msg.error as string) || 'An error occurred');
      setIsLoading(false);

      if (pendingMessageId) {
        updateMessage(pendingMessageId, {
          status: 'error',
          error: (msg.error as string) || 'An error occurred',
        });
        setPendingMessageId(null);
      }
    }
  }, [lastMessage, id, pendingMessageId, messages, addMessage, updateMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || status !== 'connected') return;

    const content = input.trim();
    setInput('');
    setError(null);
    setResponseTime(null);
    setTokenUsage(null);
    setIsLoading(true);

    // Add pending assistant message
    const assistantMessage = addMessage({
      role: 'assistant',
      content: '',
      status: 'pending',
    });
    setPendingMessageId(assistantMessage.id);

    // Add user message to history
    addMessage({
      role: 'user',
      content,
      status: 'completed',
    });

    // Send via WebSocket
    send({
      type: 'test_message',
      agent_id: id,
      content,
      session_id: `test-${id}-${Date.now()}`,
    });

    // Fallback: also send via HTTP if WebSocket fails
    try {
      const startTime = Date.now();
      const response = await fetch('/api/agents/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: id,
          content,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Only update if we haven't already received via WebSocket
      if (pendingMessageId === assistantMessage.id) {
        updateMessage(assistantMessage.id, {
          status: 'completed',
          content: data.response || data.content || 'No response',
        });
        setPendingMessageId(null);
        setIsLoading(false);

        const elapsed = Date.now() - startTime;
        setResponseTime(elapsed);

        if (data.usage) {
          setTokenUsage({
            input: data.usage.input_tokens,
            output: data.usage.output_tokens,
          });
        }
      }
    } catch (err) {
      // Only update if we haven't already received via WebSocket
      if (pendingMessageId === assistantMessage.id) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMessage);
        updateMessage(assistantMessage.id, {
          status: 'error',
          error: errorMessage,
        });
        setPendingMessageId(null);
        setIsLoading(false);
      }
    }
  }, [input, isLoading, status, id, send, addMessage, updateMessage, pendingMessageId]);

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

  const connectionStatus =
    status === 'connected' ? (
      <Badge variant="outline">Connected</Badge>
    ) : (
      <Badge variant="destructive">{status}</Badge>
    );

  if (agentLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href={`/agents/${id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-semibold flex items-center gap-2">
              Test: {agent?.name || id}
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground">Send messages to test agent behavior</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connectionStatus}
          <Button variant="outline" size="sm" onClick={clearHistory} disabled={messages.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Stats */}
      {(responseTime || tokenUsage) && (
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 text-xs text-muted-foreground border-b">
          {responseTime && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Response time: {responseTime}ms</span>
            </div>
          )}
          {tokenUsage?.input !== undefined && <span>Input tokens: {tokenUsage.input}</span>}
          {tokenUsage?.output !== undefined && <span>Output tokens: {tokenUsage.output}</span>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mx-4 mt-4 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Preset Prompts */}
      <div className="px-4 py-3 border-b">
        <div className="flex flex-wrap gap-2">
          {PRESET_PROMPTS.map((prompt) => (
            <Button key={prompt} variant="outline" size="sm" onClick={() => handlePresetClick(prompt)}>
              {prompt}
            </Button>
          ))}
        </div>
      </div>

      {/* Message History */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <Card className="p-8 text-center">
              <Sparkles className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">Ready to test</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Send a message to start testing {agent?.name || id}.
              </p>
              <p className="text-xs text-muted-foreground">
                Use the preset buttons above or type your own message.
              </p>
            </Card>
          ) : (
            messages.map((message: TestMessage) => (
              <div key={message.id} className="group relative">
                <div className={`${message.role === 'user' ? 'flex justify-end' : ''}`}>
                  <div className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-lg p-3`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
                {message.role === 'assistant' && message.status === 'completed' && message.content && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleCopyResponse(message.content)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))
          )}
          {isLoading && !pendingMessageId && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground ml-12">
              <div className="flex gap-1">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce delay-100">.</span>
                <span className="animate-bounce delay-200">.</span>
              </div>
              <span>Thinking</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4 bg-background">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a test message..."
              className="min-h-[80px] resize-none"
              disabled={isLoading || status !== 'connected'}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || status !== 'connected'}
              className="shrink-0 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Press Enter to send, Shift+Enter for new line</span>
            {status !== 'connected' && <span className="text-destructive">WebSocket {status}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
