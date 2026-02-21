import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  History,
  Play,
  Save,
  Sparkles,
  Trash2,
  X,
  Check,
  Loader2,
} from "lucide-react";

import {
  deleteCronJob,
  enhancePrompt,
  getCronJobRuns,
  listAgents,
  listCronJobs,
  queryKeys,
  updateCronJob,
} from "@/api/client";
import type { CronJob, CronRun } from "@/api/client";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Separator,
  TextArea,
} from "@/components/ui";

const CRON_RE = /^(@(annually|yearly|monthly|weekly|daily|midnight|hourly|reboot|every\s+\S+))$|^(\S+\s+){4,6}\S+$/i;

export function CronEditRoute() {
  const { jobId } = useParams({ strict: false }) as { jobId: string };
  const decodedJobId = decodeURIComponent(jobId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });
  const cronQuery = useQuery({ queryKey: queryKeys.cronJobs, queryFn: listCronJobs });

  const job = useMemo(
    () => cronQuery.data?.jobs.find((j) => j.id === decodedJobId) ?? null,
    [cronQuery.data, decodedJobId],
  );

  const [schedule, setSchedule] = useState("");
  const [message, setMessage] = useState("");
  const [oneShot, setOneShot] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!job) return;
    setSchedule(job.schedule);
    setMessage(job.message ?? "");
    setOneShot((job.kind ?? "").toLowerCase() === "oneshot");
    setDirty(false);
  }, [job?.id, job?.schedule, job?.message, job?.kind]);

  const updateField = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [enhancedText, setEnhancedText] = useState("");
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [showRuns, setShowRuns] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const runsQuery = useQuery({
    queryKey: ["cron-runs", decodedJobId],
    queryFn: () => getCronJobRuns(decodedJobId),
    enabled: showRuns,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateCronJob(decodedJobId, {
        schedule: schedule.trim(),
        message: message.trim(),
        one_shot: oneShot,
      }),
    onSuccess: () => {
      toast.success("Cron job updated");
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
    },
    onError: (error) => toast.error(`Update failed: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCronJob(decodedJobId),
    onSuccess: () => {
      toast.success("Cron job deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
      navigate({ to: "/cron" });
    },
    onError: (error) => toast.error(`Delete failed: ${error.message}`),
  });

  const enhanceMutation = useMutation({
    mutationFn: () => enhancePrompt(message),
    onSuccess: (data) => {
      setEnhancedText(data.enhanced);
      setEnhanceOpen(true);
    },
    onError: (error) => toast.error(`AI enhance failed: ${error.message}`),
  });

  const onSave = () => {
    if (!schedule.trim()) { toast.error("Schedule is required"); return; }
    if (!CRON_RE.test(schedule.trim())) { toast.error("Invalid cron expression"); return; }
    if (!message.trim()) { toast.error("Message is required"); return; }
    updateMutation.mutate();
  };

  const runNow = () => {
    if (!job) return;
    setRunningJobId(job.id);
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "client_command",
        command: `/cron run ${job.id}`,
        target_agent: job.agent_id,
      }));
      ws.close();
      setRunningJobId(null);
      toast.success(`Triggered ${job.name}`);
    };
    ws.onerror = () => {
      ws.close();
      setRunningJobId(null);
      toast.error("Failed to trigger cron run");
    };
  };

  const schedulePreview = computeNextFires(schedule, 5);

  if (cronQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
        <span className="text-sm text-slate-500">Loading…</span>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <CalendarClock className="h-8 w-8 text-slate-700" />
        <p className="text-sm text-slate-400">Cron job not found</p>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/cron" })}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <button
          type="button"
          onClick={() => navigate({ to: "/cron" })}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Jobs</span>
        </button>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <CalendarClock className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">{job.name}</span>
        </div>

        <Badge variant="neutral" className="text-[10px]">{job.agent_id}</Badge>

        <StatusPill status={job.last_status ?? "PENDING"} />

        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <span className="text-[10px] text-amber-400/70 font-medium">Unsaved changes</span>
          )}
          <button
            type="button"
            onClick={runNow}
            disabled={runningJobId === job.id}
            className="flex items-center gap-1 h-7 px-3 rounded-lg border border-white/[0.06] text-xs text-slate-400 hover:text-slate-200 hover:border-white/[0.12] disabled:opacity-40 transition-all duration-200"
          >
            <Play className="h-3 w-3" />
            {runningJobId === job.id ? "Running…" : "Run Now"}
          </button>
          <button
            type="button"
            onClick={() => setShowRuns((p) => !p)}
            className="flex items-center gap-1 h-7 px-3 rounded-lg border border-white/[0.06] text-xs text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200"
          >
            <History className="h-3 w-3" />
            History
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {/* ── Schedule ── */}
          <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-emerald-400/60" />
              <span className="text-xs font-medium text-slate-300">Schedule</span>
            </div>
            <Input
              value={schedule}
              onChange={(e) => updateField(setSchedule)(e.target.value)}
              placeholder="0 * * * *"
              className="font-mono"
            />
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-slate-600">Next fires</span>
              {!CRON_RE.test(schedule.trim()) ? (
                <p className="text-rose-300 mt-1">Expression appears invalid.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-slate-400">
                  {schedulePreview.map((d, i) => (
                    <li key={i}>{d.toLocaleString()}</li>
                  ))}
                  {!schedulePreview.length && <li>No preview available.</li>}
                </ul>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <Checkbox
                checked={oneShot}
                onCheckedChange={(v) => updateField(setOneShot)(Boolean(v))}
              />
              One-shot (delete after first run)
            </label>
          </section>

          {/* ── Prompt ── */}
          <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-emerald-400/60" />
                <span className="text-xs font-medium text-slate-300">Prompt</span>
              </div>
              <button
                type="button"
                onClick={() => enhanceMutation.mutate()}
                disabled={enhanceMutation.isPending || !message.trim()}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg border border-purple-400/20 bg-purple-400/5 text-xs text-purple-300 hover:bg-purple-400/10 hover:border-purple-400/30 disabled:opacity-40 transition-all duration-200"
              >
                {enhanceMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {enhanceMutation.isPending ? "Enhancing…" : "AI Enhance"}
              </button>
            </div>
            <TextArea
              className="min-h-[160px]"
              value={message}
              onChange={(e) => updateField(setMessage)(e.target.value)}
              placeholder="Describe what this cron job should do…"
            />
          </section>

          {/* ── Actions ── */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rose-400/20 text-xs text-rose-400/60 hover:text-rose-300 hover:border-rose-400/30 hover:bg-rose-400/5 transition-all duration-200"
            >
              <Trash2 className="h-3 w-3" /> Delete Job
            </button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/cron" })}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={onSave}
                disabled={updateMutation.isPending || !dirty}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
              >
                <Save className="h-3.5 w-3.5" />
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* ── Run history ── */}
          {showRuns && (
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-emerald-400/60" />
                  <span className="text-xs font-medium text-slate-300">Run History</span>
                </div>
                <button type="button" onClick={() => setShowRuns(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
              {runsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
                  <span className="text-sm text-slate-500">Loading runs…</span>
                </div>
              ) : null}
              <div className="space-y-1.5">
                {(runsQuery.data?.runs ?? []).slice(0, 20).map((run) => (
                  <article key={String(run.id)} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-2.5 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <StatusPill status={run.status} />
                      <span className="text-[10px] tabular-nums text-slate-600">
                        {run.executed_at ? new Date(run.executed_at * 1000).toLocaleString() : "-"}
                      </span>
                    </div>
                    <p className="text-slate-500">Duration: {run.duration_ms ?? "-"} ms</p>
                    <p className="mt-1 truncate text-slate-300">{run.output_preview ?? run.error ?? "-"}</p>
                  </article>
                ))}
                {!runsQuery.isLoading && !(runsQuery.data?.runs ?? []).length && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <History className="h-5 w-5 text-slate-700 mb-2" />
                    <p className="text-xs text-slate-600">No run history yet</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── AI Enhance Modal ── */}
      <Dialog open={enhanceOpen} onOpenChange={setEnhanceOpen}>
        <DialogContent>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-purple-400/10">
                <Sparkles className="h-4 w-4 text-purple-400" />
              </span>
              <div>
                <DialogTitle className="text-sm font-semibold text-slate-100">AI Enhanced Prompt</DialogTitle>
                <p className="text-[11px] text-slate-500">Review the improved version below</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-slate-600">Original</span>
                <div className="mt-1 rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-xs text-slate-500 whitespace-pre-wrap">
                  {message}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-purple-400/60">Enhanced</span>
                <div className="mt-1 rounded-lg border border-purple-400/10 bg-purple-400/[0.03] p-3 text-xs text-slate-200 whitespace-pre-wrap">
                  {enhancedText}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setEnhanceOpen(false)}>
                <X className="h-3 w-3 mr-1" /> Decline
              </Button>
              <button
                type="button"
                onClick={() => {
                  updateField(setMessage)(enhancedText);
                  setEnhanceOpen(false);
                  toast.success("Enhanced prompt applied");
                }}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-purple-400 text-slate-950 text-xs font-medium hover:bg-purple-300 transition-all duration-200"
              >
                <Check className="h-3.5 w-3.5" /> Accept
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
                <Trash2 className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Delete Cron Job</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Delete cron job <span className="font-mono text-rose-300">{job.name}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="!bg-rose-500 hover:!bg-rose-400"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const variant = normalized.startsWith("FAILED")
    ? "danger"
    : normalized === "SUCCESS"
      ? "success"
      : normalized === "RUNNING"
        ? "info"
        : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}

function computeNextFires(expr: string, count: number): Date[] {
  if (!expr || !CRON_RE.test(expr)) return [];
  if (expr.startsWith("@")) return [];
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return [];
  const m = parts[0] === "*" ? null : parseInt(parts[0], 10);
  const h = parts[1] === "*" ? null : parseInt(parts[1], 10);
  if ((m !== null && Number.isNaN(m)) || (h !== null && Number.isNaN(h))) return [];
  const results: Date[] = [];
  let cursor = new Date();
  cursor.setSeconds(0, 0);
  for (let tries = 0; tries < 1440 * 7 && results.length < count; tries += 1) {
    cursor = new Date(cursor.getTime() + 60_000);
    if ((m === null || cursor.getMinutes() === m) && (h === null || cursor.getHours() === h)) {
      results.push(new Date(cursor));
    }
  }
  return results;
}
