'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Receipt, Clock, Filter, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useAgentReceipts } from '../hooks';
import { ReceiptCard } from './receipt-card';
import { TurnReceipt } from '../types';

interface ReceiptsListProps {
  agentId: string;
  sessionId?: string;
  onBack?: () => void;
}

function groupReceiptsBySession(receipts: TurnReceipt[]): Map<string, TurnReceipt[]> {
  const groups = new Map<string, TurnReceipt[]>();
  
  for (const receipt of receipts) {
    const sessionId = receipt.session || 'default';
    if (!groups.has(sessionId)) {
      groups.set(sessionId, []);
    }
    groups.get(sessionId)!.push(receipt);
  }
  
  // Sort receipts within each session by timestamp (descending)
  for (const [sessionId, sessionReceipts] of groups) {
    groups.set(
      sessionId,
      sessionReceipts.sort((a, b) => b.started_at - a.started_at)
    );
  }
  
  return groups;
}

function formatSessionId(sessionId: string): string {
  // Format: default-1706000000000 -> Session (Jan 23, 2024)
  if (sessionId.startsWith('default-') || sessionId.includes('-')) {
    const timestamp = sessionId.split('-').pop();
    if (timestamp && !isNaN(Number(timestamp))) {
      const date = new Date(Number(timestamp));
      return `Session (${date.toLocaleDateString()})`;
    }
  }
  return sessionId;
}

export function ReceiptsList({ agentId, sessionId, onBack }: ReceiptsListProps) {
  const { data, isLoading, error, refetch } = useAgentReceipts(agentId);
  const [selectedSession, setSelectedSession] = useState<string>(sessionId || 'all');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Failed to load receipts</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refetch} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
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
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <CardTitle>Receipts</CardTitle>
              </div>
              <CardDescription>Tool call records for this agent</CardDescription>
            </div>
            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Receipt className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No receipts found. Tool calls will be recorded here when the agent performs actions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group receipts by session
  const sessionGroups = groupReceiptsBySession(receipts);
  const sessionIds = Array.from(sessionGroups.keys());

  // Filter receipts based on selection
  const filteredReceipts =
    selectedSession === 'all'
      ? receipts.sort((a, b) => b.started_at - a.started_at)
      : sessionGroups.get(selectedSession) || [];

  // Calculate stats
  const totalToolCalls = receipts.reduce((sum, r) => sum + r.tool_calls.length, 0);
  const successfulToolCalls = receipts.reduce(
    (sum, r) => sum + r.tool_calls.filter((tc) => tc.success && !tc.error).length,
    0
  );
  const failedToolCalls = totalToolCalls - successfulToolCalls;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <CardTitle>Receipts</CardTitle>
              </div>
              <CardDescription>
                {receipts.length} turn{receipts.length !== 1 ? 's' : ''} • {totalToolCalls} tool call
                {totalToolCalls !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onBack && (
                <Button variant="ghost" onClick={onBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={refetch}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{receipts.length} turns</Badge>
              <Badge variant="default">{successfulToolCalls} successful</Badge>
              {failedToolCalls > 0 && (
                <Badge variant="destructive">{failedToolCalls} failed</Badge>
              )}
            </div>
            
            {sessionIds.length > 1 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedSession} onValueChange={setSelectedSession}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by session" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sessions</SelectItem>
                    {sessionIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {formatSessionId(id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filteredReceipts.map((receipt, index) => (
          <ReceiptCard key={index} receipt={receipt} />
        ))}
      </div>
    </div>
  );
}
