'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MarkdownContent } from '@/shared/components/markdown-content';
import { cn } from '@/shared/lib/utils';
import { Message } from '@/shared/types/common';
import { ReasoningPreview } from './reasoning-preview';
import { ToolReceipts } from './tool-receipts';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function formatClockTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const [openReceipt, setOpenReceipt] = useState(false);
  const isUser = message.role === 'user';
  const hasReceiptSurface = Boolean(message.turn_receipt) || !!message.tool_calls?.length || !!message.turn_receipt?.tool_calls.length;
  const hasContent = message.content.trim().length > 0;
  const time = formatClockTime(message.timestamp);
  const reasoningPreview = message.reasoning_preview ?? message.turn_receipt?.reasoning_text;
  const resolvedReasoningPreview = reasoningPreview?.trim();

  // Guard: Don't render empty messages (no content, no receipts, not streaming)
  if (!hasContent && !hasReceiptSurface && !isStreaming) {
    return null;
  }

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex w-full max-w-[97%] gap-2 sm:max-w-[92%] sm:gap-3 lg:max-w-[85%]',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        <Avatar className="size-7 shrink-0 sm:size-8">
          <AvatarFallback className={cn('text-xs', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
            {isUser ? 'U' : 'A'}
          </AvatarFallback>
        </Avatar>
        <div className={cn('flex min-w-0 w-full flex-1 flex-col gap-2', isUser && 'items-end')}>
          {hasContent && (
            <div
              className={cn(
                'overflow-hidden rounded-2xl px-3 py-3 sm:px-4',
                isUser ? 'bg-primary text-primary-foreground w-fit max-w-full' : 'bg-muted w-full'
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

          {!isUser && isStreaming && resolvedReasoningPreview && (
            <ReasoningPreview
              text={resolvedReasoningPreview}
              isStreaming={isStreaming}
              onViewDetails={hasReceiptSurface ? () => setOpenReceipt(true) : undefined}
            />
          )}

          {hasContent && !isUser && !hasReceiptSurface && !isStreaming && (
            <span className="text-xs text-muted-foreground">{time}</span>
          )}

          {!isUser && hasReceiptSurface && (
            <ToolReceipts
              timestamp={message.timestamp}
              turnReceipt={message.turn_receipt}
              toolCalls={message.tool_calls}
              toolResults={message.tool_results}
              receiptToolCalls={message.turn_receipt?.tool_calls}
              forceOpen={openReceipt}
              onForceOpenHandled={() => setOpenReceipt(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
