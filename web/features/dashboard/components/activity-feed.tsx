'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import {
  Bot,
  Clock,
  ChevronRight,
  RefreshCw,
  Loader2,
  MessageSquare,
  Sparkles,
  User,
  AlertCircle,
  Brain,
  Cpu,
  FileCode2,
  Wrench,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { JsonViewer } from '@/components/ui/json-viewer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/shared/api/client';
import { getRelativeTime } from '@/shared/lib/date-utils';
import { cn } from '@/shared/lib/utils';
import { STALE_TIME } from '@/lib/query-config';
import { ToolReceipts } from '@/features/chat/components/tool-receipts';
import type { ModelCallTrace, PromptSnapshot, PromptSnapshotSection, ReasoningTextStatus } from '@/shared/types/common';
import {
  DashboardSession,
  DashboardSessionDiagnosticsReceiptModelCallsResponse,
  DashboardSessionDiagnosticsResponse,
  DashboardSessionDiagnosticsTurn,
  getDashboardSessions,
  getSessionReceiptModelCalls,
  getSessionDiagnostics,
} from '../api';

interface ActivityFeedProps extends React.HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
}

function useDashboardSessions() {
  return useQuery<DashboardSession[], Error>({
    queryKey: ['dashboard', 'sessions'],
    queryFn: getDashboardSessions,
    staleTime: STALE_TIME.SHORT,
  });
}

function useSessionDiagnostics(sessionId: string, enabled: boolean) {
  return useQuery<DashboardSessionDiagnosticsResponse, Error>({
    queryKey: ['dashboard', 'session-diagnostics', sessionId],
    queryFn: () => getSessionDiagnostics(sessionId),
    enabled,
    staleTime: STALE_TIME.SHORT,
  });
}

function useReceiptModelCalls(sessionId: string, receiptId: number | undefined, enabled: boolean) {
  return useQuery<DashboardSessionDiagnosticsReceiptModelCallsResponse, Error>({
    queryKey: ['dashboard', 'session-diagnostics', sessionId, 'receipt-model-calls', receiptId],
    queryFn: () => getSessionReceiptModelCalls(sessionId, receiptId ?? 0),
    enabled: enabled && Boolean(receiptId),
    staleTime: STALE_TIME.SHORT,
  });
}

export const ActivityFeed = React.forwardRef<HTMLDivElement, ActivityFeedProps>(
  ({ loading: propLoading, className, ...props }, ref) => {
    const { data: sessions, isLoading: sessionsLoading } = useDashboardSessions();
    const loading = propLoading || sessionsLoading;

    const sortedSessions = useMemo(() => {
      return (sessions || [])
        .slice()
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5);
    }, [sessions]);

    return (
      <Card ref={ref} className={cn(className)} {...props}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest sessions across all agents</CardDescription>
          </div>
          <Badge variant="secondary">{sortedSessions.length} sessions</Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <div className="space-y-3">
                {sortedSessions.length === 0 ? (
                  <EmptyState />
                ) : (
                  sortedSessions.map((session) => (
                    <ActivityItem key={session.id} session={session} />
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    );
  }
);

ActivityFeed.displayName = 'ActivityFeed';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <MessageSquare className="size-8 text-muted-foreground/50" data-icon="inline-start" />
      <p className="mt-2 text-sm text-muted-foreground">No recent activity</p>
      <p className="text-xs text-muted-foreground">
        Sessions will appear here when agents start conversations
      </p>
    </div>
  );
}

function ActivityItem({ session }: { session: DashboardSession }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useSessionDiagnostics(session.id, open);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);

  const selectedTurn = useMemo(() => {
    if (!data?.turns.length) {
      return null;
    }

    if (selectedTurnId) {
      return data.turns.find((turn) => turn.id === selectedTurnId) ?? null;
    }

    return getDefaultSelectedTurn(data.turns);
  }, [data?.turns, selectedTurnId]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    if (!data?.turns.length) {
      if (selectedTurnId !== null) {
        setSelectedTurnId(null);
      }
      return;
    }

    if (selectedTurnId && data.turns.some((turn) => turn.id === selectedTurnId)) {
      return;
    }

    const nextSelectedTurn = getDefaultSelectedTurn(data.turns);
    setSelectedTurnId(nextSelectedTurn?.id ?? null);
  }, [data?.turns, open, selectedTurnId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Card
        className={cn(
          'overflow-hidden border-border/70 shadow-none transition-colors',
          open && 'border-primary/40 bg-card shadow-sm'
        )}
      >
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'h-auto min-h-0 w-full items-start justify-between whitespace-normal rounded-none px-4 py-4 text-left sm:h-auto',
              open
                ? 'bg-primary/8 text-foreground hover:bg-primary/10'
                : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Avatar className="size-8">
                <AvatarFallback className={cn(open ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
                  <Bot className="size-4" data-icon="inline-center" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3 pb-2">
                  <p className="min-w-0 flex-1 pr-2 text-sm font-medium leading-6 break-words">
                    {session.title || `Session ${session.id.slice(0, 8)}`}
                  </p>
                  <span className={cn('shrink-0 whitespace-nowrap pt-0.5 text-xs', open ? 'text-foreground/80' : 'text-muted-foreground')}>
                    {getRelativeTime(session.updated_at)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="whitespace-nowrap px-3 font-normal">
                    <MessageSquare className="mr-1 size-3" data-icon="inline-start" />
                    {session.message_count} messages
                  </Badge>
                  <Badge variant="outline" className="whitespace-nowrap px-3 font-normal">
                    <Bot className="mr-1 size-3" data-icon="inline-start" />
                    {session.agent_id}
                  </Badge>
                  {data ? <SessionSummaryBadges diagnostics={data} /> : null}
                  {isFetching && !isLoading ? (
                    <Badge variant="secondary" className="whitespace-nowrap px-3 font-normal">
                      <Loader2 className="mr-1 size-3 animate-spin" data-icon="inline-start" />
                      Refreshing
                    </Badge>
                  ) : null}
                  <Badge variant={open ? 'default' : 'secondary'} className="whitespace-nowrap px-3 font-normal">
                    View details
                  </Badge>
                </div>
              </div>
            </div>
          </Button>
        </DialogTrigger>
      </Card>

      <DialogContent className="grid h-[85vh] max-h-[85vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-left">
            <span>{session.title || `Session ${session.id.slice(0, 8)}`}</span>
            <Badge variant="outline" className="font-normal">
              {session.agent_id}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-left">
            <span>{session.message_count} messages</span>
            <span aria-hidden="true">•</span>
            <span>Updated {getRelativeTime(session.updated_at)}</span>
            {data ? (
              <>
                <span aria-hidden="true">•</span>
                <span>{data.summary.total_turns} turns</span>
                <span aria-hidden="true">•</span>
                <span>{data.summary.total_tokens.toLocaleString()} tokens</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden px-6 py-5">
          {isLoading ? <SessionDiagnosticsLoadingState /> : null}

          {isError ? (
            <Alert variant="warning">
              <AlertCircle className="size-4" />
              <AlertTitle>Diagnostics unavailable</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{getErrorMessage(error)}</p>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  <RefreshCw className="mr-2 size-4" />
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {data ? (
            <SessionDiagnosticsPanel
              diagnostics={data}
              selectedTurnId={selectedTurn?.id ?? null}
              onSelectTurn={setSelectedTurnId}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SessionSummaryBadges({ diagnostics }: { diagnostics: DashboardSessionDiagnosticsResponse }) {
  const { summary } = diagnostics;

  return (
    <>
      <Badge variant="secondary" className="whitespace-nowrap px-3 font-normal">
        {summary.tool_call_count} tools
      </Badge>
      <Badge variant="secondary" className="whitespace-nowrap px-3 font-normal">
        {summary.total_tokens.toLocaleString()} tokens
      </Badge>
      <Badge variant="secondary" className="whitespace-nowrap px-3 font-normal">
        <Brain className="mr-1 size-3" data-icon="inline-start" />
        {summary.reasoning_tokens.toLocaleString()} reasoning
      </Badge>
      {summary.estimated_cost_usd > 0 ? (
        <Badge variant="secondary" className="whitespace-nowrap px-3 font-normal">
          {formatCost(summary.estimated_cost_usd)}
        </Badge>
      ) : null}
    </>
  );
}

function SessionDiagnosticsLoadingState() {
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading diagnostics
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Skeleton className="h-[420px] w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    </div>
  );
}

function SessionDiagnosticsPanel({
  diagnostics,
  selectedTurnId,
  onSelectTurn,
}: {
  diagnostics: DashboardSessionDiagnosticsResponse;
  selectedTurnId: string | null;
  onSelectTurn: (turnId: string) => void;
}) {
  const assistantTurns = diagnostics.turns.filter((turn) => turn.role === 'assistant').length;
  const selectedTurn = diagnostics.turns.find((turn) => turn.id === selectedTurnId) ?? getDefaultSelectedTurn(diagnostics.turns);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Badge variant="outline" className="min-w-10 justify-center whitespace-nowrap px-3 font-normal">
            {diagnostics.summary.total_turns}
          </Badge>
          <span>turns</span>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Badge variant="outline" className="min-w-10 justify-center whitespace-nowrap px-3 font-normal">
            {assistantTurns}
          </Badge>
          <span>assistant</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
        <TurnNavigatorCard
          turns={diagnostics.turns}
          selectedTurnId={selectedTurn?.id ?? null}
          onSelectTurn={onSelectTurn}
        />
        <TurnInspectorCard turn={selectedTurn} sessionId={diagnostics.session.id} />
      </div>
    </div>
  );
}

function TurnNavigatorCard({
  turns,
  selectedTurnId,
  onSelectTurn,
}: {
  turns: DashboardSessionDiagnosticsTurn[];
  selectedTurnId: string | null;
  onSelectTurn: (turnId: string) => void;
}) {
  const [showToolStubs, setShowToolStubs] = useState(false);
  const navigatorItems = useMemo(() => buildTurnNavigatorItems(turns, showToolStubs), [turns, showToolStubs]);
  const hiddenStubCount = turns.filter(isHiddenAssistantToolStub).length;

  React.useEffect(() => {
    if (showToolStubs || navigatorItems.length === 0) {
      return;
    }

    if (!selectedTurnId || navigatorItems.some((item) => item.turn.id === selectedTurnId)) {
      return;
    }

    onSelectTurn(navigatorItems[0].turn.id);
  }, [navigatorItems, onSelectTurn, selectedTurnId, showToolStubs]);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden shadow-none">
      <CardHeader className="border-b space-y-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Transcript</CardTitle>
          <CardDescription>Browse meaningful turns without the tool-call noise by default.</CardDescription>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Focus mode</p>
            <p className="text-xs text-muted-foreground">
              {hiddenStubCount > 0
                ? `Hiding ${hiddenStubCount} assistant tool stub${hiddenStubCount === 1 ? '' : 's'}`
                : 'No empty assistant tool stubs in this session'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Show stubs</span>
            <Switch
              checked={showToolStubs}
              onCheckedChange={setShowToolStubs}
              aria-label="Toggle assistant tool-call stubs in transcript"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-3">
            {navigatorItems.map((item) => (
              <TurnListItem
                key={item.turn.id}
                turn={item.turn}
                hiddenStubCount={item.hiddenStubCount}
                hiddenToolCallCount={item.hiddenToolCallCount}
                selected={item.turn.id === selectedTurnId}
                onSelect={() => onSelectTurn(item.turn.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function TurnListItem({
  turn,
  hiddenStubCount,
  hiddenToolCallCount,
  selected,
  onSelect,
}: {
  turn: DashboardSessionDiagnosticsTurn;
  hiddenStubCount: number;
  hiddenToolCallCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = getTurnRoleIcon(turn.role);
  const preview = getTurnPreview(turn);
  const previewText = preview || 'No message content';
  const statusSummary = getTurnNavigatorSummary(turn, hiddenStubCount, hiddenToolCallCount);

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-xl border shadow-none',
        selected
          ? 'border-primary/30 bg-primary/5 text-foreground'
          : 'border-border/70 bg-background text-foreground'
      )}
    >
      <button
        type="button"
        className={cn(
          'block w-full min-w-0 space-y-3 px-4 py-3.5 text-left transition-colors',
          selected ? 'bg-primary/5' : 'hover:bg-muted/30'
        )}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selected ? 'default' : 'outline'} className="gap-1.5 font-normal capitalize">
                <Icon className="size-3.5" />
                {turn.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{formatTime(turn.timestamp)}</p>
          </div>
          <div className="flex items-center gap-2 pl-2">
            <span className="text-xs text-muted-foreground">Inspect</span>
            <ChevronRight
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                selected && 'translate-x-0.5 text-foreground'
              )}
            />
          </div>
        </div>
        <p
          className={cn(
            'line-clamp-3 text-sm leading-5 text-foreground/85',
            !preview && 'italic text-muted-foreground/80'
          )}
        >
          {previewText}
        </p>
        {statusSummary ? (
          <p className="text-xs leading-5 text-muted-foreground">{statusSummary}</p>
        ) : null}
        {selected ? <div className="h-px w-full bg-primary/20" aria-hidden="true" /> : null}
      </button>
    </Card>
  );
}

function getTurnNavigatorSummary(
  turn: DashboardSessionDiagnosticsTurn,
  hiddenStubCount: number,
  hiddenToolCallCount: number,
): string {
  const summaryParts = getTurnNavigatorBadges(turn, hiddenToolCallCount).slice(0, 2);

  if (hiddenStubCount > 0) {
    summaryParts.unshift(`${hiddenStubCount} hidden stub${hiddenStubCount === 1 ? '' : 's'} folded in`);
  }

  return summaryParts.join(' • ');
}

function TurnInspectorCard({
  turn,
  sessionId,
}: {
  turn: DashboardSessionDiagnosticsTurn | null;
  sessionId: string;
}) {
  if (!turn) {
    return <EmptyDiagnosticsSection message="No turn is available to inspect." />;
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden shadow-none">
      <CardHeader className="border-b pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base capitalize">{turn.role} turn</CardTitle>
            <CardDescription>{formatLongTime(turn.timestamp)}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-normal capitalize">
              {turn.role}
            </Badge>
            {getTurnNavigatorBadges(turn).map((badge) => (
              <Badge key={badge} variant="secondary" className="font-normal">
                {badge}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden p-4">
        <ScrollArea className="h-full">
          {turn.role === 'assistant' ? (
            <AssistantTurnInspector turn={turn} sessionId={sessionId} />
          ) : (
            <SimpleTurnInspector turn={turn} />
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SimpleTurnInspector({ turn }: { turn: DashboardSessionDiagnosticsTurn }) {
  return (
    <div className="space-y-4 pr-1">
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Message</CardTitle>
          <CardDescription>
            {turn.role === 'user' ? 'User input for this turn.' : 'System context that shaped the conversation.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm leading-6 text-foreground/90">
            {turn.content || 'No content'}
          </pre>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard icon={Clock} label="Time" value={formatTime(turn.timestamp)} />
        <MetricCard icon={MessageSquare} label="Length" value={`${(turn.content || '').length} chars`} />
      </div>
    </div>
  );
}

function AssistantTurnInspector({ turn, sessionId }: { turn: DashboardSessionDiagnosticsTurn; sessionId: string }) {
  const toolCount = turn.tool_calls?.length ?? turn.turn_receipt?.tool_calls?.length ?? 0;
  const hasPromptSnapshot = Boolean(turn.turn_receipt?.prompt_snapshot);
  const hasLazyTraces = Boolean(turn.turn_receipt?.has_model_call_traces);
  const stubWithoutReceipt = turn.role === 'assistant' && !turn.turn_receipt && Boolean(turn.tool_calls?.length);

  return (
    <div className="space-y-4 pr-1">
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Response</CardTitle>
          <CardDescription>Selected assistant reply and captured diagnostics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {toolCount > 0 ? (
              <Badge variant="secondary" className="font-normal">
                {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
              </Badge>
            ) : null}
            {hasPromptSnapshot ? (
              <Badge variant="secondary" className="font-normal">
                <Brain className="mr-1 size-3" data-icon="inline-start" />
                prompt snapshot
              </Badge>
            ) : null}
            {hasLazyTraces ? (
              <Badge variant="secondary" className="font-normal">
                <Cpu className="mr-1 size-3" data-icon="inline-start" />
                request trace
              </Badge>
            ) : null}
          </div>
          <ScrollArea className="max-h-72 rounded-md bg-muted">
            <pre className="whitespace-pre-wrap break-words p-3 text-sm leading-6 text-foreground/90">
              {turn.content || turn.turn_receipt?.reply_summary || 'No response text'}
            </pre>
          </ScrollArea>
          {stubWithoutReceipt ? (
            <Alert>
              <AlertCircle className="size-4" />
              <AlertTitle>Tool-call stub selected</AlertTitle>
              <AlertDescription>
                This assistant message only requested tools. Diagnostics for this user turn are attached to the later final assistant reply.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="request">Request</TabsTrigger>
          <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
          <TabsTrigger value="model">Model + Tokens</TabsTrigger>
          <TabsTrigger value="behind-the-scenes" disabled={!hasPromptSnapshot}>
            Behind the Scenes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <AssistantTurnOverview turn={turn} />
        </TabsContent>

        <TabsContent value="tools" className="mt-0 space-y-4">
          <ToolReceipts
            timestamp={turn.timestamp}
            turnReceipt={turn.turn_receipt}
            toolCalls={turn.tool_calls}
            toolResults={turn.tool_results}
            receiptToolCalls={turn.turn_receipt?.tool_calls}
          />
        </TabsContent>

        <TabsContent value="request" className="mt-0 space-y-4">
          <AssistantTurnRequestDetails turn={turn} sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="reasoning" className="mt-0 space-y-4">
          <AssistantTurnReasoningDetails turn={turn} sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="model" className="mt-0 space-y-4">
          <AssistantTurnModelDetails turn={turn} sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="behind-the-scenes" className="mt-0 space-y-4">
          {turn.turn_receipt?.prompt_snapshot ? (
            <PromptSnapshotPanel snapshot={turn.turn_receipt.prompt_snapshot} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AssistantTurnOverview({ turn }: { turn: DashboardSessionDiagnosticsTurn }) {
  const receipt = turn.turn_receipt;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={Clock}
        label="Duration"
        value={receipt ? formatDuration(receipt.duration_ms) : 'n/a'}
      />
      <MetricCard
        icon={Cpu}
        label="Model"
        value={receipt?.model_id || 'unknown'}
      />
      <MetricCard
        icon={MessageSquare}
        label="Model Calls"
        value={String(receipt?.model_calls ?? 0)}
      />
      <MetricCard
        icon={Brain}
        label="Reasoning Tokens"
        value={String(receipt?.tokens.reasoning_tokens ?? 0)}
      />
    </div>
  );
}

function AssistantTurnModelDetails({ turn, sessionId }: { turn: DashboardSessionDiagnosticsTurn; sessionId: string }) {
  const receipt = turn.turn_receipt;
  const tracesQuery = useReceiptModelCalls(sessionId, receipt?.receipt_id, Boolean(receipt?.has_model_call_traces));
  const traceItems = tracesQuery.data?.model_calls ?? [];
  const summaryItems = receipt?.call_details ?? [];

  if (!receipt) {
    return <EmptyDiagnosticsSection message="No model or token details were recorded for this turn." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard icon={Cpu} label="Model" value={receipt.model_id} />
        <MetricCard icon={MessageSquare} label="Prompt Tokens" value={receipt.tokens.prompt_tokens.toLocaleString()} />
        <MetricCard icon={Sparkles} label="Completion Tokens" value={receipt.tokens.completion_tokens.toLocaleString()} />
        <MetricCard icon={Brain} label="Reasoning Tokens" value={receipt.tokens.reasoning_tokens.toLocaleString()} />
        <MetricCard icon={Clock} label="Total Tokens" value={receipt.tokens.total_tokens.toLocaleString()} />
      </div>

      {(traceItems.length > 0 || summaryItems.length > 0) ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="size-4 text-muted-foreground" />
            Per-call breakdown
          </div>
          {tracesQuery.isLoading ? <Skeleton className="h-20 w-full" /> : null}
          <div className="space-y-2">
            {traceItems.length > 0
              ? traceItems.map((detail) => (
                  <div key={`${detail.model_id}-${detail.call_index}`} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-7">
                    <DetailPair label="Call" value={`#${detail.call_index}`} />
                    <DetailPair label="Model" value={detail.model_id || 'unknown'} />
                    <DetailPair label="Provider" value={detail.provider} />
                    <DetailPair label="Surface" value={detail.api_surface || 'n/a'} />
                    <DetailPair label="Latency" value={formatDuration(detail.latency_ms)} />
                    <DetailPair label="Prompt" value={detail.prompt_tokens.toLocaleString()} />
                    <DetailPair label="Completion" value={detail.completion_tokens.toLocaleString()} />
                  </div>
                ))
              : summaryItems.map((detail, index) => (
                  <div key={`${detail.model}-${index}`} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-7">
                    <DetailPair label="Call" value={`#${detail.call_index || index + 1}`} />
                    <DetailPair label="Model" value={detail.model || 'unknown'} />
                    <DetailPair label="Provider" value={detail.provider || 'unknown'} />
                    <DetailPair label="Surface" value={detail.api_surface || 'n/a'} />
                    <DetailPair label="Latency" value={formatDuration(detail.latency_ms)} />
                    <DetailPair label="Prompt" value={detail.prompt_tokens.toLocaleString()} />
                    <DetailPair label="Completion" value={detail.completion_tokens.toLocaleString()} />
                  </div>
                ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssistantTurnRequestDetails({ turn, sessionId }: { turn: DashboardSessionDiagnosticsTurn; sessionId: string }) {
  const receipt = turn.turn_receipt;
  const [showRawJson, setShowRawJson] = useState(false);
  const tracesQuery = useReceiptModelCalls(sessionId, receipt?.receipt_id, Boolean(receipt?.has_model_call_traces));

  if (!receipt) {
    return <EmptyDiagnosticsSection message={getMissingDiagnosticsMessage(turn)} />;
  }

  if (!receipt.has_model_call_traces) {
    if (receipt.prompt_snapshot) {
      return <PromptSnapshotPanel snapshot={receipt.prompt_snapshot} />;
    }

    return <EmptyDiagnosticsSection message="Legacy turn: exact normalized request capture was not recorded for this turn." />;
  }

  if (tracesQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (tracesQuery.isError) {
    return <EmptyDiagnosticsSection message={getErrorMessage(tracesQuery.error)} />;
  }

  const traces = tracesQuery.data?.model_calls ?? [];
  if (traces.length === 0) {
    return <EmptyDiagnosticsSection message="No model-call request traces were recorded for this receipt." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Normalized request timeline</p>
          <p className="text-xs text-muted-foreground">Exact message/tool payload captured at the provider handoff boundary.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Raw JSON</span>
          <Switch checked={showRawJson} onCheckedChange={setShowRawJson} aria-label="Toggle raw JSON request view" />
        </div>
      </div>

      {traces.map((trace) => {
        const visibleMessages = getVisibleRequestMessages(trace.normalized_messages);

        return (
          <Card key={trace.call_index} className="shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">Call #{trace.call_index}</CardTitle>
              <Badge variant="outline" className="font-normal">{trace.provider}</Badge>
              <Badge variant="outline" className="font-normal">{trace.model_id}</Badge>
              {trace.api_surface ? <Badge variant="outline" className="font-normal">{trace.api_surface}</Badge> : null}
              {trace.request_kind ? <Badge variant="outline" className="font-normal">{trace.request_kind}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Messages</p>
              {showRawJson ? (
                <JsonViewer data={visibleMessages} defaultExpanded={true} maxHeight={360} />
              ) : (
                visibleMessages.length > 0 ? (
                  <div className="space-y-2">
                    {visibleMessages.map((message, index) => (
                      <RequestMessageCard key={`${trace.call_index}-${index}`} message={message} index={index} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No user/system/assistant text messages were present in this request snapshot.</p>
                )
              )}
            </div>
          </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AssistantTurnReasoningDetails({ turn, sessionId }: { turn: DashboardSessionDiagnosticsTurn; sessionId: string }) {
  const receipt = turn.turn_receipt;
  const tracesQuery = useReceiptModelCalls(sessionId, receipt?.receipt_id, Boolean(receipt?.has_model_call_traces));

  if (!receipt) {
    return <EmptyDiagnosticsSection message={getMissingDiagnosticsMessage(turn)} />;
  }

  if (!receipt.has_model_call_traces) {
    return <ReasoningStatusCard status="legacy_not_recorded" reasoningTokens={receipt.tokens.reasoning_tokens} />;
  }

  if (tracesQuery.isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (tracesQuery.isError) {
    return <EmptyDiagnosticsSection message={getErrorMessage(tracesQuery.error)} />;
  }

  const traces = tracesQuery.data?.model_calls ?? [];
  const reasoning = summarizeTurnReasoning(receipt.tokens.reasoning_tokens, traces);

  return (
    <div className="space-y-3">
      <ReasoningStatusCard
        status={reasoning.status}
        reasoningText={reasoning.text}
        reasoningTokens={reasoningTokensLabel(receipt.tokens.reasoning_tokens, traces)}
        title="Turn reasoning"
      />
    </div>
  );
}

function PromptSnapshotPanel({ snapshot }: { snapshot: PromptSnapshot }) {
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal">
          <FileCode2 className="mr-1 size-3" data-icon="inline-start" />
          {snapshot.sections.length} sections
        </Badge>
        <Badge variant="outline" className="font-normal">
          <Wrench className="mr-1 size-3" data-icon="inline-start" />
          {snapshot.available_tools.length} tools exposed
        </Badge>
      </div>

      {snapshot.available_tools.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Available tools</p>
          <div className="flex flex-wrap gap-2">
            {snapshot.available_tools.map((tool) => (
              <Badge key={tool.name} variant="secondary" className="max-w-full font-normal">
                <span className="truncate">{tool.name}</span>
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {snapshot.sections.map((section) => (
          <PromptSectionCard key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}

function PromptSectionCard({ section }: { section: PromptSnapshotSection }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{section.title}</CardTitle>
            {section.note ? <CardDescription className="mt-1">{section.note}</CardDescription> : null}
          </div>
          {section.truncated ? (
            <Badge variant="outline" className="font-normal">
              truncated{section.original_char_count ? ` from ${section.original_char_count.toLocaleString()} chars` : ''}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-5 text-foreground/90">
          {section.content}
        </pre>
      </CardContent>
    </Card>
  );
}

function RequestMessageCard({ message, index }: { message: unknown; index: number }) {
  const role = extractRole(message) || `message ${index + 1}`;
  const content = extractMessageContent(message);

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal capitalize">
            {role}
          </Badge>
          <Badge variant="secondary" className="font-normal">
            #{index + 1}
          </Badge>
        </div>
        {content ? (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-5 text-foreground/90">
            {content}
          </pre>
        ) : (
          <JsonViewer data={message} defaultExpanded={true} maxHeight={220} />
        )}
      </CardContent>
    </Card>
  );
}

function ReasoningStatusCard({
  status,
  reasoningTokens,
  reasoningText,
  title,
}: {
  status: 'captured' | 'provider_did_not_expose' | 'legacy_not_recorded';
  reasoningTokens: number;
  reasoningText?: string;
  title?: string;
}) {
  const statusLabel =
    status === 'captured'
      ? 'Reasoning text captured'
      : status === 'provider_did_not_expose'
        ? 'Provider did not expose reasoning text'
        : 'Legacy turn: reasoning text not recorded';

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {title ? <p className="text-sm font-medium">{title}</p> : null}
          <Badge variant="outline" className="font-normal">
            <Brain className="mr-1 size-3" data-icon="inline-start" />
            {reasoningTokens.toLocaleString()} reasoning tokens
          </Badge>
          <Badge variant={status === 'captured' ? 'secondary' : 'outline'} className="font-normal">
            {statusLabel}
          </Badge>
        </div>
        {status === 'captured' && reasoningText ? (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-5 text-foreground/90">
            {reasoningText}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">{statusLabel}.</p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function EmptyDiagnosticsSection({ message }: { message: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 text-sm text-muted-foreground">{message}</CardContent>
    </Card>
  );
}

function getDefaultSelectedTurn(turns: DashboardSessionDiagnosticsTurn[]): DashboardSessionDiagnosticsTurn | null {
  const navigatorItems = buildTurnNavigatorItems(turns, false);
  return navigatorItems[0]?.turn
    ?? turns.find((turn) => turn.role === 'assistant' && Boolean(turn.turn_receipt))
    ?? turns.find((turn) => turn.role === 'assistant' && Boolean(turn.tool_calls?.length))
    ?? turns.find((turn) => turn.role === 'assistant')
    ?? turns[0]
    ?? null;
}

function getMissingDiagnosticsMessage(turn: DashboardSessionDiagnosticsTurn): string {
  if (turn.role === 'assistant' && turn.tool_calls?.length) {
    return 'This assistant message is a tool-call stub. Select the later final assistant reply in this turn to inspect the recorded diagnostics.';
  }

  return 'No diagnostics were recorded for this turn.';
}

function getTurnRoleIcon(role: DashboardSessionDiagnosticsTurn['role']) {
  if (role === 'assistant') {
    return Bot;
  }

  if (role === 'user') {
    return User;
  }

  return Sparkles;
}

function getTurnPreview(turn: DashboardSessionDiagnosticsTurn): string {
  return getTurnText(turn) || '';
}

function getTurnNavigatorBadges(turn: DashboardSessionDiagnosticsTurn, hiddenToolCallCount = 0): string[] {
  const badges: string[] = [];
  const toolCount = (turn.tool_calls?.length ?? turn.turn_receipt?.tool_calls?.length ?? 0) + hiddenToolCallCount;

  if (toolCount > 0) {
    badges.push(`${toolCount} tool${toolCount === 1 ? '' : 's'}`);
  }

  if (turn.turn_receipt?.has_model_call_traces) {
    badges.push('request trace');
  }

  if ((turn.turn_receipt?.tokens.reasoning_tokens ?? 0) > 0) {
    badges.push('reasoning');
  }

  if (turn.turn_receipt?.prompt_snapshot) {
    badges.push('behind the scenes');
  }

  return badges;
}

function getTurnText(turn: DashboardSessionDiagnosticsTurn): string {
  return (turn.content || turn.turn_receipt?.reply_summary || '').trim();
}

function isHiddenAssistantToolStub(turn: DashboardSessionDiagnosticsTurn): boolean {
  return turn.role === 'assistant'
    && !turn.turn_receipt
    && Boolean(turn.tool_calls?.length)
    && getTurnText(turn).length === 0;
}

interface TurnNavigatorItem {
  turn: DashboardSessionDiagnosticsTurn;
  hiddenStubCount: number;
  hiddenToolCallCount: number;
}

function buildTurnNavigatorItems(
  turns: DashboardSessionDiagnosticsTurn[],
  showToolStubs: boolean,
): TurnNavigatorItem[] {
  if (showToolStubs) {
    return turns.map((turn) => ({
      turn,
      hiddenStubCount: 0,
      hiddenToolCallCount: 0,
    }));
  }

  const items: TurnNavigatorItem[] = [];
  let pendingStubCount = 0;
  let pendingToolCallCount = 0;

  for (const turn of turns) {
    if (isHiddenAssistantToolStub(turn)) {
      pendingStubCount += 1;
      pendingToolCallCount += turn.tool_calls?.length ?? 0;
      continue;
    }

    const attachPending = turn.role === 'assistant' && pendingStubCount > 0;
    items.push({
      turn,
      hiddenStubCount: attachPending ? pendingStubCount : 0,
      hiddenToolCallCount: attachPending ? pendingToolCallCount : 0,
    });

    if (attachPending) {
      pendingStubCount = 0;
      pendingToolCallCount = 0;
    }
  }

  if (pendingStubCount > 0 && items.length > 0) {
    const fallbackIndex = [...items].map((item) => item.turn.role).lastIndexOf('assistant');
    const targetIndex = fallbackIndex >= 0 ? fallbackIndex : items.length - 1;
    const target = items[targetIndex];
    items[targetIndex] = {
      ...target,
      hiddenStubCount: target.hiddenStubCount + pendingStubCount,
      hiddenToolCallCount: target.hiddenToolCallCount + pendingToolCallCount,
    };
  }

  return items;
}

function extractRole(message: unknown): string | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const role = (message as Record<string, unknown>).role;
  return typeof role === 'string' ? role : null;
}

function getVisibleRequestMessages(messages: unknown[]): unknown[] {
  return messages
    .map(sanitizeRequestMessage)
    .filter((message): message is Record<string, unknown> => message !== null);
}

function sanitizeRequestMessage(message: unknown): Record<string, unknown> | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const record = message as Record<string, unknown>;
  const role = extractRole(record);
  if (role === 'tool') {
    return null;
  }

  const toolCalls = record.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    return null;
  }

  if (!('content' in record)) {
    return record;
  }

  const sanitizedContent = sanitizeMessageContent(record.content);
  if (sanitizedContent == null) {
    return null;
  }

  return {
    ...record,
    content: sanitizedContent,
  };
}

function sanitizeMessageContent(content: unknown): unknown | null {
  if (typeof content === 'string') {
    return content.trim().length > 0 ? content : null;
  }

  if (!Array.isArray(content)) {
    return content;
  }

  const visibleParts = content.filter((part) => {
    if (!part || typeof part !== 'object') {
      return false;
    }

    const type = (part as Record<string, unknown>).type;
    return type !== 'tool_use' && type !== 'tool_result';
  });

  return visibleParts.length > 0 ? visibleParts : null;
}

function summarizeTurnReasoning(reasoningTokens: number, traces: ModelCallTrace[]): {
  status: ReasoningTextStatus;
  text?: string;
} {
  const capturedTexts = traces
    .filter((trace) => trace.reasoning_text_status === 'captured' && trace.reasoning_text)
    .map((trace) => trace.reasoning_text?.trim())
    .filter((text): text is string => Boolean(text));

  if (capturedTexts.length > 0) {
    return {
      status: 'captured',
      text: capturedTexts.join('\n\n---\n\n'),
    };
  }

  if (reasoningTokens > 0 || traces.length > 0) {
    return { status: 'provider_did_not_expose' };
  }

  return { status: 'legacy_not_recorded' };
}

function reasoningTokensLabel(receiptReasoningTokens: number, traces: ModelCallTrace[]): number {
  if (receiptReasoningTokens > 0) {
    return receiptReasoningTokens;
  }

  return traces.reduce((sum, trace) => sum + trace.reasoning_tokens, 0);
}

function extractMessageContent(message: unknown): string | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return null;
        }
        const text = (part as Record<string, unknown>).text;
        return typeof text === 'string' ? text : null;
      })
      .filter((part): part is string => Boolean(part))
      .join('\n\n');
  }

  return null;
}

function extractToolName(tool: unknown): string | null {
  if (!tool || typeof tool !== 'object') {
    return null;
  }

  const directName = (tool as Record<string, unknown>).name;
  if (typeof directName === 'string') {
    return directName;
  }

  const fn = (tool as Record<string, unknown>).function;
  if (!fn || typeof fn !== 'object') {
    return null;
  }

  const nestedName = (fn as Record<string, unknown>).name;
  return typeof nestedName === 'string' ? nestedName : null;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLongTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCost(costUsd: number): string {
  return costUsd < 0.01 ? `$${costUsd.toFixed(4)}` : `$${costUsd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(2)}s`;
}
