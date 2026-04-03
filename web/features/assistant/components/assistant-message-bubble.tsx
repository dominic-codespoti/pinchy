'use client';

import { Button } from '@/components/ui/button';
import { Bot, User, Copy } from 'lucide-react';
import { ChatMessage } from '../types';

interface AssistantMessageBubbleProps {
  message: ChatMessage;
  onCopy?: (content: string) => void;
  showCopyButton?: boolean;
}

export function AssistantMessageBubble({
  message,
  onCopy,
  showCopyButton = true,
}: AssistantMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[90%] space-y-1">
        <div
          className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <div
            className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
              isUser ? 'bg-primary' : 'bg-muted'
            }`}
          >
            {isUser ? (
              <User
                className={`h-3.5 w-3.5 ${isUser ? 'text-primary-foreground' : ''}`}
              />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
          </div>
          <div
            className={`rounded-md p-2.5 text-sm ${
              isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>

        {!isUser && showCopyButton && message.content && onCopy && (
          <div className="flex items-center gap-1 ml-8">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onCopy(message.content)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
