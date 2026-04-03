'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  Cpu,
  MessageSquare,
  Wrench,
  AlertCircle,
} from 'lucide-react';
import { TurnReceipt, ToolCallRecord } from '../types';
import { ToolCallStatusBadge } from './receipt-status-badge';

interface ReceiptCardProps {
  receipt: TurnReceipt;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(tokens: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): string {
  return `${tokens.total_tokens.toLocaleString()} tokens (${tokens.prompt_tokens.toLocaleString()} prompt, ${tokens.completion_tokens.toLocaleString()} completion)`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function ToolCallItem({ toolCall, index }: { toolCall: ToolCallRecord; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{toolCall.tool}</span>
            <ToolCallStatusBadge toolCall={toolCall} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {formatDuration(toolCall.duration_ms)}
            </span>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-3 space-y-2 border-t pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Arguments Summary</p>
              <p className="text-sm">{toolCall.args_summary}</p>
            </div>
            {toolCall.error && (
              <div className="rounded-md bg-destructive/10 p-2">
                <div className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-xs font-medium">Error</span>
                </div>
                <p className="mt-1 text-xs text-destructive">{toolCall.error}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ReceiptCard({ receipt }: ReceiptCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasToolCalls = receipt.tool_calls.length > 0;
  const hasError = receipt.tool_calls.some((tc) => tc.error);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Turn Receipt</CardTitle>
                {hasError && (
                  <Badge variant="destructive">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Errors
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1 line-clamp-2">
                {receipt.user_prompt}
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-2">
                {isOpen ? (
                  <>
                    <ChevronUp className="mr-1 h-4 w-4" />
                    Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-4 w-4" />
                    More
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formatTimestamp(receipt.started_at)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Cpu className="h-4 w-4" />
              <span>{receipt.model_id}</span>
            </div>
            {receipt.estimated_cost_usd !== undefined && (
              <div className="flex items-center gap-1">
                <Coins className="h-4 w-4" />
                <span>${receipt.estimated_cost_usd.toFixed(4)}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              <span>{formatTokens(receipt.tokens)}</span>
            </div>
            {hasToolCalls && (
              <Badge variant="outline">
                <Wrench className="mr-1 h-3 w-3" />
                {receipt.tool_calls.length} tool call{receipt.tool_calls.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          <CollapsibleContent>
            <div className="mt-4 space-y-4 border-t pt-4">
              {receipt.reply_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Reply Summary</p>
                  <p className="text-sm">{receipt.reply_summary}</p>
                </div>
              )}

              {hasToolCalls && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Tool Calls</p>
                  <div className="space-y-2">
                    {receipt.tool_calls.map((toolCall, index) => (
                      <ToolCallItem key={index} toolCall={toolCall} index={index} />
                    ))}
                  </div>
                </div>
              )}

              {receipt.call_details.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Model Calls</p>
                  <p className="text-sm">{receipt.model_calls} API call(s)</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
