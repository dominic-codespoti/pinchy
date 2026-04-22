'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Brain, ChevronDown, CircleCheckBig, CircleHelp, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/shared/lib/utils';
import { ToolCall, ToolCallRecord, ToolResult, TurnReceipt } from '@/shared/types/common';

interface ToolReceiptsProps {
  timestamp: string;
  turnReceipt?: TurnReceipt;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  receiptToolCalls?: ToolCallRecord[];
  forceOpen?: boolean;
  onForceOpenHandled?: () => void;
}

type ToolStatus = 'ok' | 'error' | 'unknown';

interface ExactToolReceiptItem {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  output: string;
  status: ToolStatus;
}

interface SummaryToolReceiptItem {
  id: string;
  name: string;
  argsSummary: string;
  output: string;
  status: ToolStatus;
  durationMs?: number;
}

// Custom collapsible content to avoid Radix overflow issues
interface CustomCollapsibleContentProps {
  isOpen: boolean;
  children: React.ReactNode;
}

function CustomCollapsibleContent({ isOpen, children }: CustomCollapsibleContentProps) {
  return (
    <div
      className={cn(
        'grid overflow-hidden transition-all duration-300 ease-in-out',
        isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      )}
    >
      <div className="min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}

function formatClockTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatDuration(durationMs?: number): string | null {
  if (durationMs === undefined) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

function formatCost(costUsd?: number): string | null {
  if (costUsd === undefined) {
    return null;
  }

  return costUsd < 0.01 ? `$${costUsd.toFixed(4)}` : `$${costUsd.toFixed(2)}`;
}

function getReasoningBadgeLabel(turnReceipt?: TurnReceipt): string | null {
  if (!turnReceipt) {
    return null;
  }

  const reasoningText = turnReceipt.reasoning_text?.trim();
  const reasoningTokens = turnReceipt.tokens.reasoning_tokens;

  if (!reasoningText && reasoningTokens <= 0) {
    return null;
  }

  if (reasoningText && reasoningTokens > 0) {
    return `${formatTokenCount(reasoningTokens)} reasoning`;
  }

  if (reasoningText) {
    return 'Reasoning';
  }

  return `${formatTokenCount(reasoningTokens)} reasoning`;
}

function getToolStatusBadge(status: ToolStatus) {
  if (status === 'ok') {
    return { label: 'ok', className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800', icon: CircleCheckBig, iconClassName: 'text-green-600 dark:text-green-400' };
  }

  if (status === 'error') {
    return { label: 'error', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: AlertCircle, iconClassName: 'text-red-600 dark:text-red-400' };
  }

  return { label: 'unknown', className: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700', icon: CircleHelp, iconClassName: 'text-gray-500 dark:text-gray-400' };
}

function buildExactItems(toolCalls?: ToolCall[], toolResults?: ToolResult[]): ExactToolReceiptItem[] {
  const resultsByToolCallId = new Map((toolResults ?? []).map((result) => [result.tool_call_id, result]));

  return (toolCalls ?? []).map((toolCall) => {
    const result = resultsByToolCallId.get(toolCall.id);
    let status: ToolStatus = 'unknown';

    if (result?.is_error === true) {
      status = 'error';
    } else if (result) {
      status = 'ok';
    }

    return {
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      output: result?.content ?? 'Result not available in session history.',
      status,
    };
  });
}

function buildSummaryItems(receiptToolCalls?: ToolCallRecord[]): SummaryToolReceiptItem[] {
  return (receiptToolCalls ?? []).map((toolCall, index) => ({
    id: `${toolCall.tool}-${index}`,
    name: toolCall.tool,
    argsSummary: toolCall.args_summary || 'No argument summary recorded.',
    output: toolCall.error ?? (toolCall.success ? 'Completed successfully.' : 'Tool failed.'),
    status: toolCall.success ? 'ok' : 'error',
    durationMs: toolCall.duration_ms,
  }));
}

export function ToolReceipts({
  timestamp,
  turnReceipt,
  toolCalls,
  toolResults,
  receiptToolCalls,
  forceOpen = false,
  onForceOpenHandled,
}: ToolReceiptsProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!forceOpen) {
      return;
    }

    setIsOpen(true);
    onForceOpenHandled?.();
  }, [forceOpen, onForceOpenHandled]);

  const exactItems = useMemo(() => buildExactItems(toolCalls, toolResults), [toolCalls, toolResults]);
  const summaryItems = useMemo(
    () => (exactItems.length === 0 ? buildSummaryItems(receiptToolCalls) : []),
    [exactItems.length, receiptToolCalls]
  );
  const toolCount = exactItems.length > 0 ? exactItems.length : summaryItems.length;
  const costLabel = formatCost(turnReceipt?.estimated_cost_usd);
  const reasoningText = turnReceipt?.reasoning_text?.trim();
  const reasoningBadgeLabel = getReasoningBadgeLabel(turnReceipt);

  if (!turnReceipt && toolCount === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full min-w-0">
      <Card className="w-full min-w-0 overflow-hidden border-border/60 bg-background/70 shadow-none">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="h-auto w-full min-w-0 justify-between rounded-xl px-3 py-2 text-left hover:bg-muted/40">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Wrench className="size-4 text-muted-foreground" />
                <span>Details</span>
              </span>
              <Badge variant="outline" className="font-normal">
                {formatClockTime(timestamp)}
              </Badge>
              {turnReceipt && (
                <>
                  <Badge variant="outline" className="font-normal">
                    {turnReceipt.model_id}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    {formatTokenCount(turnReceipt.tokens.total_tokens)} tokens
                  </Badge>
                  {costLabel && (
                    <Badge variant="outline" className="font-normal">
                      {costLabel}
                    </Badge>
                  )}
                  {reasoningBadgeLabel && (
                    <Badge variant="outline" className="font-normal">
                      <Brain className="mr-1 size-3" />
                      {reasoningBadgeLabel}
                    </Badge>
                  )}
                </>
              )}
              {toolCount > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {toolCount === 1 ? '1 tool' : `${toolCount} tools`}
                </Badge>
              )}
            </div>
            <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CustomCollapsibleContent isOpen={isOpen}>
          <div className="w-full min-w-0">
            <CardContent className="w-full min-w-0 space-y-3 px-3 pb-3 pt-0">
            {reasoningText && (
              <div className="w-full min-w-0 rounded-xl border border-border/50 bg-muted/30 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Reasoning
                  </p>
                  {reasoningBadgeLabel && (
                    <Badge variant="secondary" className="font-normal">
                      <Brain className="mr-1 size-3" />
                      {reasoningBadgeLabel}
                    </Badge>
                  )}
                  <Badge variant="outline" className="font-normal">
                    {formatDuration(turnReceipt?.duration_ms)}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                  {reasoningText}
                </p>
              </div>
            )}

            {exactItems.length > 0 && (
              <div className="w-full min-w-0 space-y-3">
                {exactItems.map((item, index) => {
                  const statusMeta = getToolStatusBadge(item.status);
                  const StatusIcon = statusMeta.icon;

                  return (
                    <div key={item.id} className="w-full min-w-0 space-y-3">
                      {index > 0 && <Separator />}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{item.name}</span>
                            <Badge className={cn("font-normal", statusMeta.className)}>
                              {statusMeta.label}
                            </Badge>
                          </div>
                        </div>
                        <StatusIcon className={cn('size-4 shrink-0', statusMeta.iconClassName)} />
                      </div>

                      <div className="w-full min-w-0 space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Arguments</p>
                        <JsonViewer data={item.arguments} defaultExpanded={true} truncateStrings={false} maxHeight={300} />
                      </div>

                      <div className="w-full min-w-0 space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</p>
                        <JsonViewer data={item.output} maxHeight={300} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {summaryItems.length > 0 && (
              <>
                {exactItems.length > 0 && <Separator />}
                <div className="w-full min-w-0 space-y-3">
                  {exactItems.length > 0 && (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Turn summary
                    </p>
                  )}
                  {summaryItems.map((item, index) => {
                    const statusMeta = getToolStatusBadge(item.status);
                    const StatusIcon = statusMeta.icon;

                    return (
                      <div key={item.id} className="w-full min-w-0 space-y-3">
                        {index > 0 && <Separator />}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              <Badge className={cn("font-normal", statusMeta.className)}>
                                {statusMeta.label}
                              </Badge>
                              {exactItems.length > 0 && (
                                <Badge variant="outline" className="font-normal">
                                  summary
                                </Badge>
                              )}
                            </div>
                            {item.durationMs !== undefined && (
                              <p className="text-xs text-muted-foreground">{formatDuration(item.durationMs)}</p>
                            )}
                          </div>
                          <StatusIcon className={cn('size-4 shrink-0', statusMeta.iconClassName)} />
                        </div>

                        <div className="w-full min-w-0 space-y-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Arguments</p>
                          <JsonViewer data={item.argsSummary} defaultExpanded={true} truncateStrings={false} maxHeight={300} />
                        </div>

                        <div className="w-full min-w-0 space-y-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {exactItems.length > 0 ? 'Status' : 'Output'}
                          </p>
                          <JsonViewer data={item.output} maxHeight={300} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            </CardContent>
          </div>
        </CustomCollapsibleContent>
      </Card>
    </Collapsible>
  );
}
