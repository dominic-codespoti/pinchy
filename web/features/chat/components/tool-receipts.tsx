'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/shared/lib/utils';
import { ToolCall, ToolResult } from '@/shared/types/common';

interface ToolReceiptsProps {
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
}

function summarizeResult(result: ToolResult | undefined): string {
  if (!result?.content) {
    return 'Waiting for result';
  }

  try {
    const parsed = JSON.parse(result.content) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length > 0) {
        return keys.slice(0, 3).join(', ');
      }
    }
  } catch {
    // Fall through to string summary.
  }

  return result.content.length > 72 ? `${result.content.slice(0, 72)}...` : result.content;
}

function ToolReceiptCard({ toolCall, toolResult }: { toolCall: ToolCall; toolResult?: ToolResult }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-border/60 bg-background/80 shadow-none">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="h-auto w-full justify-between rounded-xl px-3 py-3 text-left">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Wrench className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{toolCall.name}</span>
                  <Badge variant="secondary">Tool</Badge>
                  {toolResult && <Badge variant="outline">Result</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">{summarizeResult(toolResult)}</p>
              </div>
            </div>
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 px-3 pb-3 pt-0">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Arguments</p>
              <pre className="overflow-x-auto rounded-lg bg-muted/70 p-3 text-xs leading-5 text-foreground">
                <code>{formatJson(toolCall.arguments)}</code>
              </pre>
            </div>
            {toolResult && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</p>
                <pre className="overflow-x-auto rounded-lg bg-muted/70 p-3 text-xs leading-5 text-foreground">
                  <code>{formatJson(toolResult.content)}</code>
                </pre>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function ToolReceipts({ toolCalls, toolResults }: ToolReceiptsProps) {
  const resultsByToolCallId = useMemo(() => {
    return new Map((toolResults ?? []).map((result) => [result.tool_call_id, result]));
  }, [toolResults]);

  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {toolCalls.map((toolCall) => (
        <ToolReceiptCard
          key={toolCall.id}
          toolCall={toolCall}
          toolResult={resultsByToolCallId.get(toolCall.id)}
        />
      ))}
    </div>
  );
}
