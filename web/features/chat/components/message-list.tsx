'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Message } from '@/shared/types/common';
import { MessageBubble } from './message-bubble';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  if (!messages.length && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
        <p className="text-sm">No messages yet.</p>
        <p className="text-xs mt-1">Send a message to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={message.id === 'streaming'}
        />
      ))}
      {isLoading && !messages.find(m => m.id === 'streaming') && <ThinkingIndicator />}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 ml-12">
      <div className="flex gap-1">
        <span className="animate-bounce">.</span>
        <span className="animate-bounce delay-100">.</span>
        <span className="animate-bounce delay-200">.</span>
      </div>
      <span className="text-sm text-muted-foreground">Thinking</span>
    </div>
  );
}
