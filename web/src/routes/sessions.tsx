import { useState, useCallback } from "react";
import {
  Layers, Trash2, ChevronDown, ChevronRight,
  RefreshCw, HardDrive, MessageSquare,
} from "lucide-react";
import {
  useAgentsQuery, useSessionsQuery, useSessionMessagesQuery, useDeleteSessionMutation,
} from "@/api/queries";
import type { SessionSummary } from "@/api/schemas";
import {
  Card, CardHeader, CardTitle, CardContent, Button,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Separator, Skeleton, EmptyState,
} from "@/components/ui";
import { PageShell, PageTitle } from "@/components/layout";
import { MessageRow } from "@/components/chat/message-list";
import { cn, humanBytes, estimateMessages, mutationOpts } from "@/lib/utils";

function SessionMessages({ agentId, sessionId }: { readonly agentId: string; readonly sessionId: string }) {
  const { data, isLoading, error } = useSessionMessagesQuery(agentId, sessionId);
  const messages = data?.messages ?? [];

  if (isLoading) return (
    <div className="space-y-3 py-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
  if (error) return <p className="text-sm text-destructive py-2">Failed to load messages.</p>;
  if (messages.length === 0) return <p className="text-xs text-muted-foreground opacity-60 py-2">No messages in this session.</p>;

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      {messages.map((msg, i) => (
        <MessageRow key={`${i}-${msg.timestamp ?? 0}`} message={msg} />
      ))}
    </div>
  );
}

function SessionCard({ session, agentId, isExpanded, onToggle }: {
  readonly session: SessionSummary;
  readonly agentId: string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteSessionMutation(agentId);

  const handleDelete = useCallback(() => {
    deleteMutation.mutate(session.session_id,
      mutationOpts("Session deleted", () => setConfirmDelete(false)),
    );
  }, [deleteMutation, session.session_id]);

  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <Card>
      <CardHeader>
        <button type="button" onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <Chevron className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <CardTitle className="truncate">{session.title ?? session.session_id}</CardTitle>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {session.size != null && (
            <>
              <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                <HardDrive className="h-3 w-3" />{humanBytes(session.size)}
              </span>
              <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                <MessageSquare className="h-3 w-3" />~{estimateMessages(session.size)}
              </span>
            </>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Deleting..." : "Confirm"}
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground"
                onClick={() => setConfirmDelete(false)} disabled={deleteMutation.isPending}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)} aria-label="Delete session">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <SessionMessages agentId={agentId} sessionId={session.session_id} />
        </CardContent>
      )}
    </Card>
  );
}

export function SessionsRoute() {
  const [selectedAgent, setSelectedAgent] = useState("default");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const agentsQuery = useAgentsQuery();
  const agentIds = (agentsQuery.data?.agents ?? []).map((a) => a.id);
  const activeAgent = agentIds.includes(selectedAgent) ? selectedAgent : agentIds[0] ?? "default";

  const sessionsQuery = useSessionsQuery(activeAgent);
  const sessions = (sessionsQuery.data?.sessions ?? [])
    .filter((s) => !s.file.endsWith(".receipts.jsonl"))
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));

  return (
    <PageShell
      maxWidth="3xl"
      header={
        <PageTitle icon={<Layers className="h-3.5 w-3.5" />} title="Sessions">
          <Separator orientation="vertical" className="!h-5" />
          <Select value={activeAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              {(agentIds.length > 0 ? agentIds : ["default"]).map((id) => (
                <SelectItem key={id} value={id}>{id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0"
            onClick={() => void sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}
            aria-label="Refresh sessions">
            <RefreshCw className={cn("h-3 w-3", sessionsQuery.isFetching && "animate-spin")} />
          </Button>
          <span className="text-[10px] tabular-nums text-muted-foreground">{sessions.length} sessions</span>
        </PageTitle>
      }
    >
      {sessionsQuery.isLoading && [1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-muted p-4 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}

      {sessions.map((s) => (
        <SessionCard key={s.session_id} session={s} agentId={activeAgent}
          isExpanded={expandedId === s.session_id}
          onToggle={() => setExpandedId(expandedId === s.session_id ? null : s.session_id)} />
      ))}

      {!sessions.length && !sessionsQuery.isLoading && (
        <EmptyState icon={<Layers />} title="No sessions found" subtitle="Sessions appear here as agents interact." />
      )}

      {sessionsQuery.error != null && (
        <p className="text-sm text-destructive mt-4">Failed to load sessions.</p>
      )}
    </PageShell>
  );
}
