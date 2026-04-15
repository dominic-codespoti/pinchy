'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Wrench,
  Coins,
  Cpu,
  MessageSquare,
  FileJson,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useSessionReceipts } from '../hooks';
import { TurnReceipt, ToolCallRecord } from '../types';
import { ToolCallStatusBadge } from './receipt-status-badge';

interface ReceiptDetailProps {
  agentId: string;
  sessionId: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(tokens: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}): string {
  return `${tokens.total_tokens.toLocaleString()} total (${tokens.prompt_tokens.toLocaleString()} prompt, ${tokens.completion_tokens.toLocaleString()} completion)`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function ToolCallDetail({ toolCall }: { toolCall: ToolCallRecord }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{toolCall.tool}</span>
          <ToolCallStatusBadge toolCall={toolCall} />
        </div>
        <span className="text-xs text-muted-foreground">{formatDuration(toolCall.duration_ms)}</span>
      </div>
      
      <div className="mt-3 space-y-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Arguments Summary</p>
          <p className="text-sm font-mono bg-muted p-2 rounded mt-1">{toolCall.args_summary}</p>
        </div>
        
        {toolCall.error && (
          <div className="rounded-md bg-destructive/10 p-3">
            <div className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Error</span>
            </div>
            <p className="mt-1 text-sm text-destructive">{toolCall.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReceiptItem({ receipt }: { receipt: TurnReceipt }) {
  const [activeTab, setActiveTab] = useState('overview');
  const hasToolCalls = receipt.tool_calls.length > 0;
  const hasError = receipt.tool_calls.some((tc) => tc.error);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Receipt</CardTitle>
              {hasError && (
                <Badge variant="destructive">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Error
                </Badge>
              )}
              {!hasError && hasToolCalls && (
                <Badge variant="outline">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Success
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              {formatTimestamp(receipt.started_at)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tools" disabled={!hasToolCalls}>
              Tools ({receipt.tool_calls.length})
            </TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Model</p>
                <div className="flex items-center gap-1">
                  <Cpu className="h-4 w-4" />
                  <span className="text-sm font-medium">{receipt.model_id}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Duration</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">{formatDuration(receipt.duration_ms)}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Model Calls</p>
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-sm font-medium">{receipt.model_calls}</span>
                </div>
              </div>
              {receipt.estimated_cost_usd !== undefined && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <div className="flex items-center gap-1">
                    <Coins className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      ${receipt.estimated_cost_usd.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">User Prompt</p>
              <p className="text-sm bg-muted p-3 rounded">{receipt.user_prompt}</p>
            </div>
            
            {receipt.reply_summary && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Reply Summary</p>
                <p className="text-sm bg-muted p-3 rounded">{receipt.reply_summary}</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="tools" className="space-y-3">
            {receipt.tool_calls.map((toolCall, index) => (
              <ToolCallDetail key={index} toolCall={toolCall} />
            ))}
          </TabsContent>
          
          <TabsContent value="tokens" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Prompt Tokens</p>
                <p className="text-lg font-medium">{receipt.tokens.prompt_tokens.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Completion Tokens</p>
                <p className="text-lg font-medium">
                  {receipt.tokens.completion_tokens.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Tokens</p>
                <p className="text-lg font-medium">{receipt.tokens.total_tokens.toLocaleString()}</p>
              </div>
              {receipt.tokens.cached_tokens > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Cached Tokens</p>
                  <p className="text-lg font-medium">{receipt.tokens.cached_tokens.toLocaleString()}</p>
                </div>
              )}
              {receipt.tokens.reasoning_tokens > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Reasoning Tokens</p>
                  <p className="text-lg font-medium">
                    {receipt.tokens.reasoning_tokens.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function ReceiptDetail({ agentId, sessionId }: ReceiptDetailProps) {
  const { data, isLoading, error, refetch } = useSessionReceipts(agentId, sessionId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Failed to load receipt</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refetch} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const receipts = data?.receipts || [];

  if (receipts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Receipts</CardTitle>
          <CardDescription>
            No tool call receipts found for this session.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {receipts.map((receipt, index) => (
        <ReceiptItem key={index} receipt={receipt} />
      ))}
    </div>
  );
}
