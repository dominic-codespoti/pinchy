import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Layers,
  Trash2,
  Download,
  Pencil,
  ChevronLeft,
  Bot,
  User,
  AlertCircle,
  MoreVertical,
} from "lucide-react";

import {
  type SessionMessage,
  deleteSession,
  getSession,
  listAgents,
  listSessions,
  queryKeys,
  updateSession,
} from "@/shared/api/client";
import { Button, Dialog, DialogContent, Separator, TextArea } from "@/shared/ui/components/ui";
import { BottomSheet, ActionSheet } from "@/shared/ui/components/BottomSheet";
import { useViewport } from "@/shared/lib/useViewport";
import { humanBytes, estimateMessages, toText, formatRelativeTime, cn } from "@/shared/lib/utils";

import { SessionsHeader, MobileSessionList } from "./SessionsComponents";

export function SessionsListRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile } = useViewport();
  const [selectedAgent, setSelectedAgent] = useState("default");
  const [confirmDelete, setConfirmDelete] = useState<{ type: "single" | "cron" | "all"; id?: string } | null>(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });
  const agentIds = useMemo(
    () => (agentsQuery.data?.agents ?? []).map((agent) => agent.id),
    [agentsQuery.data],
  );

  useEffect(() => {
    if (!agentIds.length) return;
    if (agentIds.includes(selectedAgent)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAgent(agentIds[0]);
  }, [agentIds, selectedAgent]);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions(selectedAgent),
    queryFn: () => listSessions(selectedAgent),
    enabled: Boolean(selectedAgent),
  });

  const sessions = useMemo(
    () =>
      (sessionsQuery.data?.sessions ?? [])
        .filter((s) => !s.file.endsWith(".receipts.jsonl"))
        .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0)),
    [sessionsQuery.data],
  );

  const deleteMutation = useMutation({
    mutationFn: (sf: string) => deleteSession(selectedAgent, sf),
    onSuccess: (_, sf) => {
      toast.success("Session deleted: " + sf);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(selectedAgent) });
      void deleteSession(selectedAgent, sf.replace(/\.jsonl$/, ".receipts.jsonl")).catch(() => undefined);
    },
    onError: (error) => toast.error("Delete failed: " + error.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async (targets: typeof sessions) => {
      const results = await Promise.allSettled(
        targets.flatMap((s) => [
          deleteSession(selectedAgent, s.session_id),
          deleteSession(selectedAgent, s.session_id.replace(/\.jsonl$/, ".receipts.jsonl")).catch(() => undefined),
        ]),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} deletion(s) failed`);
    },
    onSuccess: (_, targets) => {
      toast.success(`Deleted ${targets.length} session(s)`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(selectedAgent) });
    },
    onError: (error) => toast.error("Bulk delete failed: " + error.message),
  });

  const cronSessions = useMemo(() => sessions.filter((s) => s.session_id.startsWith("cron_")), [sessions]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.sessions(selectedAgent) });
  };

  const handleSessionClick = (s: typeof sessions[0]) => {
    navigate({
      to: "/sessions/$agentId/$sessionFile",
      params: { agentId: selectedAgent, sessionFile: s.session_id },
    });
  };

  const handleSessionDelete = (s: typeof sessions[0]) => {
    setConfirmDelete({ type: "single", id: s.session_id });
  };

  // Mobile: Use bottom sheet for delete confirmation
  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === "single" && confirmDelete.id) {
      deleteMutation.mutate(confirmDelete.id, { 
        onSettled: () => {
          setConfirmDelete(null);
          setShowDeleteSheet(false);
        }
      });
    } else if (confirmDelete.type === "cron") {
      deleteAllMutation.mutate(cronSessions, { 
        onSettled: () => {
          setConfirmDelete(null);
          setShowDeleteSheet(false);
        }
      });
    } else {
      deleteAllMutation.mutate(sessions, { 
        onSettled: () => {
          setConfirmDelete(null);
          setShowDeleteSheet(false);
        }
      });
    }
  };

  const openDeleteConfirmation = (type: "single" | "cron" | "all", id?: string) => {
    setConfirmDelete({ type, id });
    if (isMobile) {
      setShowDeleteSheet(true);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      <SessionsHeader
        selectedAgent={selectedAgent}
        setSelectedAgent={setSelectedAgent}
        agentIds={agentIds}
        sessionCount={sessions.length}
        cronSessionCount={cronSessions.length}
        hasCronSessions={cronSessions.length > 0}
        onDeleteCron={() => openDeleteConfirmation("cron")}
        onDeleteAll={() => openDeleteConfirmation("all")}
        isDeleting={deleteAllMutation.isPending || deleteMutation.isPending}
        isRefreshing={sessionsQuery.isFetching}
      />

      {/* Mobile: Use mobile-optimized list with pull-to-refresh */}
      {isMobile ? (
        <MobileSessionList
          sessions={sessions}
          isLoading={sessionsQuery.isLoading}
          onRefresh={handleRefresh}
          onSessionClick={handleSessionClick}
          onSessionDelete={handleSessionDelete}
        />
      ) : (
        /* Desktop: Original list view */
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-1">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                type="button"
                onClick={() =>
                  navigate({
                    to: "/sessions/$agentId/$sessionFile",
                    params: { agentId: selectedAgent, sessionFile: s.session_id },
                  })
                }
                className="w-full flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04] group"
              >
                <div className="h-2 w-2 rounded-full bg-emerald-400/40 group-hover:bg-emerald-400 transition-colors shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{formatSessionLabel(s.session_id, s.title)}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {s.modified ? new Date(s.modified * 1000).toLocaleString() : "Unknown"}
                    {s.size != null ? (" · " + humanBytes(s.size)) : ""}
                    {s.size != null ? ` · ~${estimateMessages(s.size)} msgs` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteConfirmation("single", s.session_id);
                    }}
                    className="rounded-lg border border-white/[0.06] px-2 py-1 text-[10px] text-rose-400/60 hover:text-rose-300 hover:border-rose-400/20 cursor-pointer transition-all duration-200"
                  >
                    <Trash2 className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))}

            {sessionsQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-12">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
                <span className="text-sm text-slate-500">Loading sessions...</span>
              </div>
            )}

            {!sessions.length && !sessionsQuery.isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Layers className="h-8 w-8 text-slate-700 mb-3" />
                <p className="text-sm text-slate-400">No sessions found</p>
                <p className="text-xs text-slate-600 mt-1">Sessions appear here as agents interact.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop: Dialog for delete confirmation */}
      {!isMobile && (
        <Dialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
          <DialogContent>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
                  <Trash2 className="h-5 w-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    {confirmDelete?.type === "single" ? "Delete Session" : confirmDelete?.type === "cron" ? "Delete Cron Sessions" : "Delete All Sessions"}
                  </p>
                  <p className="text-xs text-slate-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm text-slate-300">
                {confirmDelete?.type === "single" && <>Delete session <span className="font-mono text-rose-300">{confirmDelete.id}</span>?</>}
                {confirmDelete?.type === "cron" && <>Delete all <span className="text-rose-300">{cronSessions.length}</span> cron session(s) for <span className="font-mono text-rose-300">{selectedAgent}</span>?</>}
                {confirmDelete?.type === "all" && <>Delete <strong>all {sessions.length}</strong> session(s) for <span className="font-mono text-rose-300">{selectedAgent}</span>?</>}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="!bg-rose-500 hover:!bg-rose-400"
                  disabled={deleteMutation.isPending || deleteAllMutation.isPending}
                  onClick={handleConfirmDelete}
                >
                  {(deleteMutation.isPending || deleteAllMutation.isPending) ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile: Bottom Sheet for delete confirmation */}
      {isMobile && (
        <BottomSheet
          isOpen={showDeleteSheet && !!confirmDelete}
          onClose={() => {
            setShowDeleteSheet(false);
            setConfirmDelete(null);
          }}
          title={confirmDelete?.type === "single" ? "Delete Session" : confirmDelete?.type === "cron" ? "Delete Cron Sessions" : "Delete All Sessions"}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-400/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <p className="text-sm text-slate-300">
                  {confirmDelete?.type === "single" && <>Delete <span className="font-mono text-rose-300">{confirmDelete.id}</span>?</>}
                  {confirmDelete?.type === "cron" && <>Delete all <span className="text-rose-300">{cronSessions.length}</span> cron sessions?</>}
                  {confirmDelete?.type === "all" && <>Delete <strong>all {sessions.length}</strong> sessions?</>}
                </p>
                <p className="text-xs text-slate-500 mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteSheet(false);
                  setConfirmDelete(null);
                }}
                className="flex-1 h-12 rounded-xl bg-white/[0.08] text-sm font-medium text-slate-200 active:bg-white/[0.12] touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending || deleteAllMutation.isPending}
                className="flex-1 h-12 rounded-xl bg-rose-500 text-sm font-medium text-white active:bg-rose-600 disabled:opacity-50 touch-manipulation"
              >
                {(deleteMutation.isPending || deleteAllMutation.isPending) ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

export function SessionDetailRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile } = useViewport();
  const { agentId, sessionFile } = useParams({ strict: false }) as { agentId: string; sessionFile: string };
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<number | null>(null);
  const [showMessageActions, setShowMessageActions] = useState<number | null>(null);

  const sessionQuery = useQuery({
    queryKey: queryKeys.sessionMessages(agentId, sessionFile),
    queryFn: () => getSession(agentId, sessionFile),
    enabled: Boolean(agentId && sessionFile),
  });

  const messages = useMemo(() => sessionQuery.data?.messages ?? [], [sessionQuery.data]);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const openEditor = (index: number) => {
    setEditingIndex(index);
    setEditValue(toText(messages[index]?.content));
  };

  const saveMutation = useMutation({
    mutationFn: (updated: SessionMessage[]) => updateSession(agentId, sessionFile, updated),
    onSuccess: () => {
      toast.success("Session saved");
      setEditingIndex(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionMessages(agentId, sessionFile) });
    },
    onError: (error) => toast.error("Save failed: " + error.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSession(agentId, sessionFile),
    onSuccess: () => {
      toast.success("Session deleted");
      navigate({ to: "/sessions" });
    },
    onError: (error) => toast.error("Delete failed: " + error.message),
  });

  const saveEdit = () => {
    if (editingIndex === null) return;
    const updated = messages.map((m, i) => (i === editingIndex ? { ...m, content: editValue } : m));
    saveMutation.mutate(updated);
  };

  const removeMessage = (index: number) => {
    setConfirmDeleteMsg(index);
  };

  const removeEditingMessage = () => {
    if (editingIndex === null) return;
    setConfirmDeleteMsg(editingIndex);
  };

  const exportJsonl = () => {
    const blob = new Blob(
      [messages.map((m) => JSON.stringify(m)).join("\n") + "\n"],
      { type: "application/jsonl" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sessionFile + ".jsonl";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteMessage = () => {
    if (confirmDeleteMsg !== null) {
      saveMutation.mutate(messages.filter((_, i) => i !== confirmDeleteMsg));
      setConfirmDeleteMsg(null);
    }
  };

  const handleMessageLongPress = (index: number) => {
    if (isMobile) {
      setShowMessageActions(index);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Mobile-optimized header */}
      <div className={cn(
        "flex items-center gap-2 px-4 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0",
        isMobile ? "h-14" : "h-12"
      )}>
        <button
          type="button"
          onClick={() => navigate({ to: "/sessions" })}
          className={cn(
            "text-slate-500 hover:text-slate-300 transition-colors mr-1 touch-manipulation",
            isMobile && "p-2 -ml-2"
          )}
        >
          <ChevronLeft className={cn("h-3.5 w-3.5", isMobile && "h-5 w-5")} />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            "inline-flex items-center justify-center rounded-md bg-emerald-400/10",
            isMobile ? "h-8 w-8" : "h-6 w-6"
          )}>
            <Layers className={cn("text-emerald-400", isMobile ? "h-4 w-4" : "h-3.5 w-3.5")} />
          </span>
          <span className={cn(
            "font-semibold text-slate-100 truncate",
            isMobile ? "text-base max-w-[140px]" : "text-sm max-w-[200px]"
          )}>
            {sessionFile}
          </span>
        </div>

        {!isMobile && (
          <>
            <Separator className="!h-5 !w-px !bg-white/[0.08]" />
            <span className="text-xs text-slate-500">{agentId}</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <span className={cn(
            "tabular-nums text-slate-500 mr-2",
            isMobile ? "text-xs" : "text-[10px]"
          )}>
            {messages.length} msgs
          </span>
          
          {/* Mobile: More actions button */}
          {isMobile ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteSession(true)}
              className="p-2.5 rounded-lg text-rose-400/70 hover:text-rose-300 hover:bg-rose-400/10 active:bg-rose-400/20 touch-manipulation"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={exportJsonl}
                className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200"
              >
                <Download className="h-3 w-3" /> Export
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteSession(true)}
                className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2 py-1 text-[10px] text-rose-400/60 hover:text-rose-300 hover:border-rose-400/20 transition-all duration-200"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Message list - mobile optimized */}
      <div className="flex-1 overflow-y-auto">
        <div className={cn(
          "mx-auto",
          isMobile ? "max-w-none px-3 py-3" : "max-w-3xl px-4 py-4"
        )}>
          {messages.map((message, index) => {
            const role = (message.role ?? "unknown").toLowerCase();
            const isUser = role === "user";
            const isSystem = role === "system";
            const isEditing = editingIndex === index;

            return (
              <div
                key={index + "-" + (message.timestamp ?? 0)}
                onClick={() => !isMobile && openEditor(index)}
                onContextMenu={() => handleMessageLongPress(index)}
                className={cn(
                  "group cursor-pointer border-b border-white/[0.04] last:border-0",
                  isMobile ? "py-3" : "py-4",
                  isEditing && "bg-emerald-400/[0.03] rounded-xl"
                )}
                style={isEditing && !isMobile ? { margin: "0 -1rem", padding: "1rem" } : undefined}
              >
                <div className="flex gap-3">
                  <div className={cn(
                    "rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    isUser ? "bg-emerald-400/10" : isSystem ? "bg-amber-400/10" : "bg-white/[0.06]",
                    isMobile ? "h-9 w-9" : "h-7 w-7"
                  )}>
                    {isUser ? <User className={cn("text-emerald-400", isMobile ? "h-4 w-4" : "h-3.5 w-3.5")} />
                      : isSystem ? <AlertCircle className={cn("text-amber-400", isMobile ? "h-4 w-4" : "h-3.5 w-3.5")} />
                      : <Bot className={cn("text-slate-400", isMobile ? "h-4 w-4" : "h-3.5 w-3.5")} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "font-medium text-slate-200",
                        isMobile ? "text-sm" : "text-xs"
                      )}>
                        {isUser ? "You" : isSystem ? "System" : "Agent"}
                      </span>
                      <span className={cn(
                        "tabular-nums text-slate-600",
                        isMobile ? "text-xs" : "text-[10px]"
                      )}>
                        {message.timestamp ? formatRelativeTime(message.timestamp) : ""}
                      </span>
                      
                      {/* Desktop: Hover actions */}
                      {!isMobile && (
                        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditor(index); }}
                            className="text-slate-600 hover:text-slate-300 transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeMessage(index); }}
                            className="text-slate-600 hover:text-rose-300 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      
                      {/* Mobile: Tap to show actions indicator */}
                      {isMobile && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMessageLongPress(index); }}
                          className="ml-auto p-1.5 text-slate-500 hover:text-slate-300 active:bg-white/[0.06] rounded touch-manipulation"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className={cn(
                      "text-slate-300 leading-relaxed whitespace-pre-wrap",
                      isMobile ? "text-sm" : "text-sm"
                    )}>
                      {toText(message.content)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {sessionQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-12">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
              <span className="text-sm text-slate-500">Loading session...</span>
            </div>
          )}
          {sessionQuery.error && <p className="text-sm text-rose-300">Failed to load session.</p>}
          {!messages.length && !sessionQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Layers className={cn("text-slate-700 mb-3", isMobile ? "h-12 w-12" : "h-8 w-8")} />
              <p className="text-sm text-slate-400">No messages in this session</p>
              <p className="text-xs text-slate-600 mt-1">This session file is empty.</p>
            </div>
          )}
        </div>
      </div>

      {/* Editor - mobile optimized */}
      {editingIndex !== null && (
        <div className={cn(
          "shrink-0 border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-sm",
          isMobile && "pb-safe"
        )}>
          <div className={cn(
            "mx-auto space-y-2",
            isMobile ? "max-w-none px-3 py-3" : "max-w-3xl px-4 py-3"
          )}>
            <div className="flex items-center justify-between">
              <span className={cn(
                "uppercase tracking-widest text-slate-500",
                isMobile ? "text-xs" : "text-[10px]"
              )}>
                Editing message #{editingIndex + 1}
              </span>
              <button
                type="button"
                onClick={() => setEditingIndex(null)}
                className={cn(
                  "text-slate-500 hover:text-slate-300 transition-colors touch-manipulation",
                  isMobile ? "text-sm p-2 -mr-2" : "text-[10px]"
                )}
              >
                Cancel
              </button>
            </div>
            <TextArea
              className={cn(
                "text-sm",
                isMobile ? "min-h-[160px] max-h-64 touch-manipulation" : "min-h-[120px] max-h-48"
              )}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
            <div className={cn(
              "flex gap-2",
              isMobile ? "flex-col" : "justify-end"
            )}>
              <button
                type="button"
                onClick={removeEditingMessage}
                disabled={saveMutation.isPending}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-lg border border-rose-400/20 text-rose-300 hover:bg-rose-400/10 disabled:opacity-40 transition-all duration-200 touch-manipulation",
                  isMobile ? "h-12 text-sm" : "h-7 px-3 text-[10px]"
                )}
              >
                <Trash2 className={isMobile ? "h-4 w-4" : "h-3 w-3"} /> Delete
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saveMutation.isPending}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-lg bg-emerald-400 text-slate-950 font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 touch-manipulation",
                  isMobile ? "h-12 text-sm" : "h-7 px-4 text-[10px]"
                )}
              >
                {saveMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: Dialog for session delete */}
      {!isMobile && (
        <Dialog open={confirmDeleteSession} onOpenChange={setConfirmDeleteSession}>
          <DialogContent>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
                  <Trash2 className="h-5 w-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Delete Session</p>
                  <p className="text-xs text-slate-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm text-slate-300">
                Delete session <span className="font-mono text-rose-300">{sessionFile}</span>?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteSession(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="!bg-rose-500 hover:!bg-rose-400"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate()}
                >
                  {deleteMut.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile: Bottom Sheet for session delete */}
      {isMobile && (
        <BottomSheet
          isOpen={confirmDeleteSession}
          onClose={() => setConfirmDeleteSession(false)}
          title="Delete Session"
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-400/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 break-all">
                  Delete <span className="font-mono text-rose-300">{sessionFile}</span>?
                </p>
                <p className="text-xs text-slate-500 mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteSession(false)}
                className="flex-1 h-12 rounded-xl bg-white/[0.08] text-sm font-medium text-slate-200 active:bg-white/[0.12] touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="flex-1 h-12 rounded-xl bg-rose-500 text-sm font-medium text-white active:bg-rose-600 disabled:opacity-50 touch-manipulation"
              >
                {deleteMut.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Desktop: Dialog for message delete */}
      {!isMobile && (
        <Dialog open={confirmDeleteMsg !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteMsg(null); }}>
          <DialogContent>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
                  <Trash2 className="h-5 w-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Delete Message</p>
                  <p className="text-xs text-slate-500">Remove message #{(confirmDeleteMsg ?? 0) + 1}</p>
                </div>
              </div>
              <p className="text-sm text-slate-300">Are you sure you want to delete this message?</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteMsg(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="!bg-rose-500 hover:!bg-rose-400"
                  disabled={saveMutation.isPending}
                  onClick={handleDeleteMessage}
                >
                  {saveMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile: Action Sheet for message actions */}
      {isMobile && showMessageActions !== null && (
        <ActionSheet
          isOpen={showMessageActions !== null}
          onClose={() => setShowMessageActions(null)}
          actions={[
            {
              label: "Edit Message",
              onClick: () => {
                if (showMessageActions !== null) {
                  openEditor(showMessageActions);
                  setShowMessageActions(null);
                }
              },
              icon: Pencil,
            },
            {
              label: "Delete Message",
              onClick: () => {
                if (showMessageActions !== null) {
                  setConfirmDeleteMsg(showMessageActions);
                  setShowMessageActions(null);
                }
              },
              destructive: true,
              icon: Trash2,
            },
          ]}
        />
      )}

      {/* Mobile: Bottom Sheet for message delete confirmation */}
      {isMobile && confirmDeleteMsg !== null && (
        <BottomSheet
          isOpen={confirmDeleteMsg !== null}
          onClose={() => setConfirmDeleteMsg(null)}
          title="Delete Message"
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-400/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <p className="text-sm text-slate-300">
                  Delete message #{confirmDeleteMsg + 1}?
                </p>
                <p className="text-xs text-slate-500 mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteMsg(null)}
                className="flex-1 h-12 rounded-xl bg-white/[0.08] text-sm font-medium text-slate-200 active:bg-white/[0.12] touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMessage}
                disabled={saveMutation.isPending}
                className="flex-1 h-12 rounded-xl bg-rose-500 text-sm font-medium text-white active:bg-rose-600 disabled:opacity-50 touch-manipulation"
              >
                {saveMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function formatSessionLabel(sessionId: string, title?: string | null): string {
  if (title) return title;
  if (sessionId.startsWith("cron_")) return "cron: " + sessionId.replace(/_/g, " ");
  return "chat: " + sessionId;
}


