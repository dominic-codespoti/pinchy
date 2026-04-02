'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MarkdownContent } from '@/shared/components/markdown-content';
import { cn } from '@/shared/lib/utils';
import { Message } from '@/shared/types/common';
import { ToolReceipts } from './tool-receipts';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasToolReceipts = !!message.tool_calls?.length;
  const hasContent = message.content.trim().length > 0;
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex w-full max-w-[85%] gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className={cn('text-xs', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
            {isUser ? 'U' : 'A'}
          </AvatarFallback>
        </Avatar>
        <div className={cn('flex min-w-0 flex-1 flex-col gap-2', isUser && 'items-end')}>
          {hasContent && (
            <div
              className={cn(
                'max-w-full rounded-2xl px-4 py-3',
                isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              {isUser ? (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              ) : (
                <div>
                  <MarkdownContent content={message.content} />
                  {isStreaming && (
                    <span className="inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
                  )}
                </div>
              )}
            </div>
          )}

          {!isUser && hasToolReceipts && (
            <ToolReceipts toolCalls={message.tool_calls} toolResults={message.tool_results} />
          )}

          {!hasContent && !hasToolReceipts && !isUser && isStreaming && (
            <div className="rounded-2xl bg-muted px-4 py-3">
              <span className="inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
            </div>
          )}

          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
      </div>
    </div>
  );
}
