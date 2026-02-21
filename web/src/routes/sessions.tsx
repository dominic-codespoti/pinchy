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
  Clock,
} from "lucide-react";

import {
  type SessionMessage,
  deleteSession,
  getSession,
  listAgents,
  listSessions,
  queryKeys,
  updateSession,
} from "@/api/client";
import { Button, Dialog, DialogContent, Select, SelectItem, Separator, TextArea } from "@/components/ui";
import { humanBytes, estimateMessages } from "@/lib/utils";

export function SessionsListRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState("default");
  const [confirmDelete, setConfirmDelete] = useState<{ type: "single" | "cron" | "all"; id?: string } | null>(null);

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });
  const agentIds = useMemo(
    () => (agentsQuery.data?.agents ?? []).map((agent) => agent.id),
    [agentsQuery.data],
  );

  useEffect(() => {
    if (!agentIds.length) return;
    if (agentIds.includes(selectedAgent)) return;
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

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Sessions</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <Select
          value={selectedAgent}
          onValueChange={setSelectedAgent}
        >
          {(agentIds.length ? agentIds : ["default"]).map((id) => (
            <SelectItem key={id} value={id}>{id}</SelectItem>
          ))}
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {cronSessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="!h-7 gap-1 text-[10px] text-slate-400 hover:text-rose-300"
              disabled={deleteAllMutation.isPending}
              onClick={() => setConfirmDelete({ type: "cron" })}
            >
              <Clock className="h-3 w-3" />
              <Trash2 className="h-3 w-3" />
              Cron
            </Button>
          )}
          {sessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="!h-7 gap-1 text-[10px] text-slate-400 hover:text-rose-300"
              disabled={deleteAllMutation.isPending}
              onClick={() => setConfirmDelete({ type: "all" })}
            >
              <Trash2 className="h-3 w-3" />
              All
            </Button>
          )}
          <span className="text-[10px] tabular-nums text-slate-500">
            {sessions.length} sessions
          </span>
        </div>
      </div>

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
                <p className="text-sm text-slate-200 truncate">{formatSessionLabel(s.session_id)}</p>
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
                    setConfirmDelete({ type: "single", id: s.session_id });
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
                onClick={() => {
                  if (!confirmDelete) return;
                  if (confirmDelete.type === "single" && confirmDelete.id) {
                    deleteMutation.mutate(confirmDelete.id, { onSettled: () => setConfirmDelete(null) });
                  } else if (confirmDelete.type === "cron") {
                    deleteAllMutation.mutate(cronSessions, { onSettled: () => setConfirmDelete(null) });
                  } else {
                    deleteAllMutation.mutate(sessions, { onSettled: () => setConfirmDelete(null) });
                  }
                }}
              >
                {(deleteMutation.isPending || deleteAllMutation.isPending) ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SessionDetailRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { agentId, sessionFile } = useParams({ strict: false }) as { agentId: string; sessionFile: string };
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<number | null>(null);

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
    setEditValue(stringifyValue(messages[index]?.content));
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

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <button
          type="button"
          onClick={() => navigate({ to: "/sessions" })}
          className="text-slate-500 hover:text-slate-300 transition-colors mr-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100 truncate max-w-[200px]">{sessionFile}</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <span className="text-xs text-slate-500">{agentId}</span>

        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] tabular-nums text-slate-500 mr-2">{messages.length} msgs</span>
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {messages.map((message, index) => {
            const role = (message.role ?? "unknown").toLowerCase();
            const isUser = role === "user";
            const isSystem = role === "system";

            return (
              <div
                key={index + "-" + (message.timestamp ?? 0)}
                className={"py-4 group cursor-pointer border-b border-white/[0.04] last:border-0" + (editingIndex === index ? " bg-emerald-400/[0.03] -mx-4 px-4 rounded-xl" : "")}
                onClick={() => openEditor(index)}
              >
                <div className="flex gap-3">
                  <div className={"h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 " + (isUser ? "bg-emerald-400/10" : isSystem ? "bg-amber-400/10" : "bg-white/[0.06]")}>
                    {isUser ? <User className="h-3.5 w-3.5 text-emerald-400" />
                      : isSystem ? <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                      : <Bot className="h-3.5 w-3.5 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-200">
                        {isUser ? "You" : isSystem ? "System" : "Agent"}
                      </span>
                      <span className="text-[10px] tabular-nums text-slate-600">
                        {message.timestamp ? formatTimestamp(message.timestamp) : ""}
                      </span>
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
                    </div>
                    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{stringifyValue(message.content)}</div>
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
              <Layers className="h-8 w-8 text-slate-700 mb-3" />
              <p className="text-sm text-slate-400">No messages in this session</p>
              <p className="text-xs text-slate-600 mt-1">This session file is empty.</p>
            </div>
          )}
        </div>
      </div>

      {editingIndex !== null && (
        <div className="shrink-0 border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Editing message #{editingIndex + 1}</span>
              <button
                type="button"
                onClick={() => setEditingIndex(null)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
            <TextArea
              className="min-h-[120px] max-h-48 text-sm"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={removeEditingMessage}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 h-7 px-3 rounded-lg border border-rose-400/20 text-[10px] text-rose-300 hover:bg-rose-400/10 disabled:opacity-40 transition-all duration-200"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 h-7 px-4 rounded-lg bg-emerald-400 text-slate-950 text-[10px] font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
              >
                {saveMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                onClick={() => {
                  if (confirmDeleteMsg !== null) {
                    saveMutation.mutate(messages.filter((_, i) => i !== confirmDeleteMsg));
                    setConfirmDeleteMsg(null);
                  }
                }}
              >
                {saveMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function formatSessionLabel(sessionId: string): string {
  if (sessionId.startsWith("cron_")) return "cron: " + sessionId.replace(/_/g, " ");
  return "chat: " + sessionId;
}

function formatTimestamp(ts: number): string {
  const ms = ts > 10000000000 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString();
}

