import { useNavigate } from "@tanstack/react-router";
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
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Separator,
  StatusPill,
  TextArea,
} from "@/shared/ui/components/ui";
import { CRON_RE, formatInTz } from "@/shared/lib/utils";
import { toast } from "sonner";
import { useCronEditRoute } from "../model/useCronEditRoute";

export function CronEditRoute() {
  const navigate = useNavigate();
  const {
    job, form, ui, computed, mutations, queries
  } = useCronEditRoute();

  if (queries.cronQuery.isLoading) {
    return (
      <div className="flex flex-col h-full bg-[var(--bg)]">
        <div className="flex flex-col flex-1 items-center justify-center">
          <span className="text-sm text-slate-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (queries.cronQuery.error) {
    return (
      <div className="flex flex-col h-full bg-[var(--bg)]">
        <div className="flex flex-col flex-1 items-center justify-center gap-4">
          <span className="text-sm text-rose-400">Failed to load jobs</span>
          <Button variant="ghost" onClick={() => navigate({ to: "/cron" })}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col h-full bg-[var(--bg)]">
        <div className="flex flex-col flex-1 items-center justify-center gap-4">
          <span className="text-sm text-slate-400">Job not found</span>
          <Button variant="ghost" onClick={() => navigate({ to: "/cron" })}>Go Back</Button>
        </div>
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
          {form.dirty && (
            <span className="text-[10px] text-amber-400/70 font-medium">Unsaved changes</span>
          )}
          <button
            type="button"
            onClick={mutations.runNow}
            disabled={ui.runningJobId === job.id}
            className="flex items-center gap-1 h-7 px-3 rounded-lg border border-white/[0.06] text-xs text-slate-400 hover:text-slate-200 hover:border-white/[0.12] disabled:opacity-40 transition-all duration-200"
          >
            <Play className="h-3 w-3" />
            {ui.runningJobId === job.id ? "Running…" : "Run Now"}
          </button>
          <button
            type="button"
            onClick={() => ui.setShowRuns((p) => !p)}
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
              value={form.schedule}
              onChange={(e) => form.updateField(form.setSchedule)(e.target.value)}
              placeholder="0 * * * *"
              className="font-mono"
            />
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-slate-600">Next fires{computed.agentTz ? ` · ${computed.agentTz}` : ""}</span>
              {!CRON_RE.test(form.schedule.trim()) ? (
                <p className="text-rose-300 mt-1">Expression appears invalid.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-slate-400">
                  {computed.schedulePreview.map((d, i) => (
                    <li key={i}>{formatInTz(d, computed.agentTz)}</li>
                  ))}
                  {!computed.schedulePreview.length && <li>No preview available.</li>}
                </ul>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <Checkbox
                checked={form.oneShot}
                onCheckedChange={(v) => form.updateField(form.setOneShot)(Boolean(v))}
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
                onClick={() => mutations.enhanceMutation.mutate()}
                disabled={mutations.enhanceMutation.isPending || !form.message.trim()}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg border border-purple-400/20 bg-purple-400/5 text-xs text-purple-300 hover:bg-purple-400/10 hover:border-purple-400/30 disabled:opacity-40 transition-all duration-200"
              >
                {mutations.enhanceMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {mutations.enhanceMutation.isPending ? "Enhancing…" : "AI Enhance"}
              </button>
            </div>
            <TextArea
              className="min-h-[160px]"
              value={form.message}
              onChange={(e) => form.updateField(form.setMessage)(e.target.value)}
              placeholder="Describe what this cron job should do…"
            />
          </section>

          {/* ── Actions ── */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => ui.setConfirmDelete(true)}
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
                onClick={mutations.onSave}
                disabled={mutations.updateMutation.isPending || !form.dirty}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
              >
                <Save className="h-3.5 w-3.5" />
                {mutations.updateMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* ── Run history ── */}
          {ui.showRuns && (
            <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-emerald-400/60" />
                  <span className="text-xs font-medium text-slate-300">Run History</span>
                </div>
                <button type="button" onClick={() => ui.setShowRuns(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
              {queries.runsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
                  <span className="text-sm text-slate-500">Loading runs…</span>
                </div>
              ) : null}
              <div className="space-y-1.5">
                {(queries.runsQuery.data?.runs ?? []).slice(0, 20).map((run) => (
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
                {!queries.runsQuery.isLoading && !(queries.runsQuery.data?.runs ?? []).length && (
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
      <Dialog open={ui.enhanceOpen} onOpenChange={ui.setEnhanceOpen}>
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
                  {form.message}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-purple-400/60">Enhanced</span>
                <div className="mt-1 rounded-lg border border-purple-400/10 bg-purple-400/[0.03] p-3 text-xs text-slate-200 whitespace-pre-wrap">
                  {ui.enhancedText}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => ui.setEnhanceOpen(false)}>
                <X className="h-3 w-3 mr-1" /> Decline
              </Button>
              <button
                type="button"
                onClick={() => {
                  form.updateField(form.setMessage)(ui.enhancedText);
                  ui.setEnhanceOpen(false);
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

      <Dialog open={ui.confirmDelete} onOpenChange={ui.setConfirmDelete}>
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
              <Button variant="secondary" size="sm" onClick={() => ui.setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="!bg-rose-500 hover:!bg-rose-400"
                disabled={mutations.deleteMutation.isPending}
                onClick={() => mutations.deleteMutation.mutate()}
              >
                {mutations.deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

