import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { useSessionsQuery, useDeleteSessionMutation, qk } from "@/api/queries";
import { Button } from "@/components/ui";
import { cn, humanBytes, estimateMessages } from "@/lib/utils";
import { sendOneShot } from "@/hooks/use-gateway";
import type { SessionSummary } from "@/api/schemas";

interface SessionSidebarProps {
  readonly agentId: string;
  readonly currentSessionId: string | null;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onSessionCleared?: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function SessionSidebar({
  agentId,
  currentSessionId,
  onSelectSession,
  onSessionCleared,
}: SessionSidebarProps) {
  const { data, isLoading } = useSessionsQuery(agentId);
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteSessionMutation(agentId);

  const sessions = data?.sessions ?? [];

  const handleNewSession = useCallback(async () => {
    await sendOneShot("/new", agentId);
    // Wait for the backend to process the /new command before invalidating
    await delay(500);
    await queryClient.invalidateQueries({ queryKey: qk.sessions(agentId) });
    await queryClient.invalidateQueries({ queryKey: qk.currentSession(agentId) });
    // After refetch, read the new current session and navigate to it
    const current = queryClient.getQueryData<{ session_id?: string }>(
      qk.currentSession(agentId),
    );
    if (current?.session_id) {
      onSelectSession(current.session_id);
    }
  }, [agentId, queryClient, onSelectSession]);

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const isActive = sessionId === currentSessionId;
      deleteMutation.mutate(sessionId, {
        onSuccess: () => {
          if (isActive) {
            // Navigate to first remaining session, or clear
            const remaining = sessions.filter((s) => s.session_id !== sessionId);
            if (remaining.length > 0 && remaining[0] !== undefined) {
              onSelectSession(remaining[0].session_id);
            } else if (onSessionCleared) {
              onSessionCleared();
            }
          }
        },
      });
    },
    [currentSessionId, deleteMutation, sessions, onSelectSession, onSessionCleared],
  );

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-surface-1">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-text-2">Sessions</span>
        <Button variant="ghost" size="xs" onClick={() => void handleNewSession()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="px-3 py-4 text-xs text-text-3">Loading...</p>
        )}
        {!isLoading && sessions.length === 0 && (
          <p className="px-3 py-4 text-xs text-text-3">No sessions</p>
        )}
        {sessions.map((session) => (
          <SessionRow
            key={session.session_id}
            session={session}
            isActive={session.session_id === currentSessionId}
            onSelect={onSelectSession}
            onDelete={handleDeleteSession}
          />
        ))}
      </div>
    </aside>
  );
}

// ── Session Row ──────────────────────────────────────

interface SessionRowProps {
  readonly session: SessionSummary;
  readonly isActive: boolean;
  readonly onSelect: (sessionId: string) => void;
  readonly onDelete: (sessionId: string) => void;
}

function SessionRow({ session, isActive, onSelect, onDelete }: SessionRowProps) {
  const title = session.title ?? session.session_id.slice(0, 8);
  const sizeLabel =
    session.size != null
      ? `${humanBytes(session.size)} (~${estimateMessages(session.size)} msgs)`
      : "";

  return (
    <button
      type="button"
      onClick={() => onSelect(session.session_id)}
      className={cn(
        "group flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left transition-colors",
        isActive
          ? "bg-accent-subtle text-accent"
          : "text-text-2 hover:bg-[var(--color-elevated)]",
      )}
    >
      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{title}</div>
        {sizeLabel.length > 0 && (
          <div className="mt-0.5 text-[10px] text-text-3">{sizeLabel}</div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm("Delete this session?")) {
            onDelete(session.session_id);
          }
        }}
        className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
        aria-label="Delete session"
      >
        <Trash2 className="h-3 w-3 text-danger" />
      </button>
    </button>
  );
}
