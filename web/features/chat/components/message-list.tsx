'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Message } from '@/shared/types/common';
import { MessageBubble } from './message-bubble';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  // Filter out duplicate messages by ID and ensure all messages have IDs
  // Must be called unconditionally at the top level (React Hooks rule)
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((message) => {
      // Skip messages without IDs or with empty IDs
      if (!message.id) {
        console.warn('Message without ID found:', message);
        return false;
      }
      // Skip duplicates
      if (seen.has(message.id)) {
        return false;
      }
      seen.add(message.id);
      return true;
    });
  }, [messages]);

  if (!messages.length && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
        <p className="text-sm">No messages yet.</p>
        <p className="text-xs mt-1">Send a message to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {uniqueMessages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={message.id.startsWith('streaming')}
        />
      ))}
      {isLoading && !uniqueMessages.find(m => m.id.startsWith('streaming')) && <ThinkingIndicator />}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 ml-12">
      <div className="flex gap-1">
        <span key="thinking-1" className="animate-bounce">.</span>
        <span key="thinking-2" className="animate-bounce delay-100">.</span>
        <span key="thinking-3" className="animate-bounce delay-200">.</span>
      </div>
      <span className="text-sm text-muted-foreground">Thinking</span>
    </div>
  );
}
