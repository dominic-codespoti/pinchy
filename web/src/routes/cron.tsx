import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  History,
  X,
  Clock,
  CalendarClock,
} from "lucide-react";

import {
  createCronJob,
  deleteCronJob,
  getCronJobRuns,
  listAgents,
  listCronJobs,
  queryKeys,
} from "@/api/client";
import { Badge, Button, Checkbox, Dialog, DialogContent, Input, Select, SelectItem, Separator, TextArea } from "@/components/ui";

type CronJobView = {
  id: string;
  agent_id: string;
  name: string;
  schedule: string;
  message?: string | null;
  kind?: string;
  last_status?: string | null;
};

const CRON_RE = /^(@(annually|yearly|monthly|weekly|daily|midnight|hourly|reboot|every\s+\S+))$|^(\S+\s+){4,6}\S+$/i;

export function CronRoute() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });
  const cronQuery = useQuery({ queryKey: queryKeys.cronJobs, queryFn: listCronJobs });

  const [agentId, setAgentId] = useState("default");
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 * * * *");
  const [message, setMessage] = useState("");
  const [oneShot, setOneShot] = useState(false);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const agentIds = useMemo(
    () => (agentsQuery.data?.agents ?? []).map((agent) => agent.id),
    [agentsQuery.data],
  );

  const runsQuery = useQuery({
    queryKey: ["cron-runs", selectedJobId],
    queryFn: () => getCronJobRuns(selectedJobId ?? ""),
    enabled: Boolean(selectedJobId),
  });

  const createMutation = useMutation({
    mutationFn: createCronJob,
    onSuccess: () => {
      toast.success("Cron job created");
      setName("");
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
    },
    onError: (error) => {
      toast.error(`Create failed: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCronJob,
    onSuccess: () => {
      toast.success("Cron job deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
      setSelectedJobId(null);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  const onCreate = () => {
    if (!agentId) {
      toast.error("Agent is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!schedule.trim()) {
      toast.error("Schedule is required");
      return;
    }
    if (!CRON_RE.test(schedule.trim())) {
      toast.error("Cron schedule looks invalid");
      return;
    }
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }

    createMutation.mutate({
      agent_id: agentId,
      name: name.trim(),
      schedule: schedule.trim(),
      message: message.trim(),
      one_shot: oneShot,
    });
  };

  const jobs = cronQuery.data?.jobs ?? [];

  const runNow = (job: CronJobView) => {
    setRunningJobId(job.id);
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "client_command",
          command: `/cron run ${job.id}`,
          target_agent: job.agent_id,
        }),
      );
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

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <CalendarClock className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Cron Jobs</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <span className="text-xs text-slate-500">Scheduled automation</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-500">
            {jobs.length} jobs
          </span>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

          {/* ── Create job ──────────────────────────── */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-emerald-400/60" />
              <span className="text-xs font-medium text-slate-300">Create Job</span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <Select value={agentId} onValueChange={setAgentId}>
                {(agentIds.length ? agentIds : ["default"]).map((id) => (
                  <SelectItem key={id} value={id}>{id}</SelectItem>
                ))}
              </Select>
              <Input placeholder="job name" value={name} onChange={(event) => setName(event.target.value)} />
              <Input placeholder="cron schedule" value={schedule} onChange={(event) => setSchedule(event.target.value)} />
              <label className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                <Checkbox checked={oneShot} onCheckedChange={(checked) => setOneShot(Boolean(checked))} />
                One-shot
              </label>
            </div>

            <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-2 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-slate-600">Schedule preview</span>
              {!CRON_RE.test(schedule.trim()) ? (
                <p className="text-rose-300 mt-1">Expression appears invalid.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-slate-400">
                  {schedulePreview.map((d, i) => (
                    <li key={i}>{d.toLocaleString()}</li>
                  ))}
                  {!schedulePreview.length ? <li>No preview available for this expression.</li> : null}
                </ul>
              )}
            </div>

            <TextArea
              className="min-h-20"
              placeholder="job message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />

            <div className="flex justify-end">
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={onCreate}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
              >
                <Plus className="h-3.5 w-3.5" />
                {createMutation.isPending ? "Creating..." : "Create Job"}
              </button>
            </div>
          </div>

          {/* ── Job table (desktop) ─────────────────── */}
          {jobs.length > 0 && (
            <div className="hidden md:block rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.06] text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Agent</th>
                    <th className="px-3 py-2.5">Schedule</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <CronRow
                      key={job.id}
                      job={job}
                      onDelete={(jobId, jobName) => setConfirmDelete({ id: jobId, name: jobName })}
                      onEdit={(jobId) => navigate({ to: "/cron/$jobId", params: { jobId: encodeURIComponent(jobId) } })}
                      onShowRuns={(jobId) => setSelectedJobId(jobId)}
                      onRunNow={runNow}
                      running={runningJobId === job.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Job cards (mobile) ──────────────────── */}
          <div className="space-y-2 md:hidden">
            {jobs.map((job) => (
              <CronCard
                key={job.id}
                job={job}
                onDelete={(jobId, jobName) => setConfirmDelete({ id: jobId, name: jobName })}
                onEdit={(jobId) => navigate({ to: "/cron/$jobId", params: { jobId: encodeURIComponent(jobId) } })}
                onShowRuns={(jobId) => setSelectedJobId(jobId)}
                onRunNow={runNow}
                running={runningJobId === job.id}
              />
            ))}
          </div>

          {cronQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
              <span className="text-sm text-slate-500">Loading jobs…</span>
            </div>
          ) : null}
          {cronQuery.error ? <p className="text-sm text-rose-300">Failed to load cron jobs.</p> : null}
          {!jobs.length && !cronQuery.isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarClock className="h-8 w-8 text-slate-700 mb-3" />
              <p className="text-sm text-slate-400">No cron jobs configured</p>
              <p className="text-xs text-slate-600 mt-1">Create a scheduled task above to begin automation.</p>
            </div>
          ) : null}

          {/* ── Run history ─────────────────────────── */}
          {selectedJobId && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-emerald-400/60" />
                  <span className="text-xs font-medium text-slate-300">Run History · {selectedJobId}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedJobId(null)}
                  className="text-slate-600 hover:text-slate-300 transition-colors"
                >
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
                  <article key={`${run.id}`} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-2.5 text-xs">
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
                {!runsQuery.isLoading && !(runsQuery.data?.runs ?? []).length ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <History className="h-5 w-5 text-slate-700 mb-2" />
                    <p className="text-xs text-slate-600">No run history yet</p>
                  </div>
                ) : null}
              </div>
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
                <p className="text-sm font-semibold text-slate-100">Delete Cron Job</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Delete cron job <span className="font-mono text-rose-300">{confirmDelete?.name}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="!bg-rose-500 hover:!bg-rose-400"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirmDelete) {
                    deleteMutation.mutate(confirmDelete.id, { onSettled: () => setConfirmDelete(null) });
                  }
                }}
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

function CronRow({
  job,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  running,
}: {
  job: CronJobView;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  running: boolean;
}) {
  return (
    <tr
      className="border-b border-white/[0.04] align-top text-xs cursor-pointer hover:bg-white/[0.02] transition-colors"
      onClick={() => onEdit(job.id)}
    >
      <td className="px-3 py-2 font-medium text-slate-200">{job.name}</td>
      <td className="px-3 py-2 text-slate-500">{job.agent_id}</td>
      <td className="px-3 py-2">
        <code className="text-slate-400">{job.schedule}</code>
      </td>
      <td className="px-3 py-2">
        <StatusPill status={job.last_status ?? "PENDING"} />
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          {[
            { label: "Edit", icon: Pencil, onClick: () => onEdit(job.id) },
            { label: "History", icon: History, onClick: () => onShowRuns(job.id) },
            { label: running ? "Running..." : "Run", icon: Play, onClick: () => onRunNow(job), disabled: running },
          ].map(({ label, icon: Icon, onClick, disabled }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              disabled={disabled}
              className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] disabled:opacity-40 transition-all duration-200"
            >
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onDelete(job.id, job.name)}
            className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-[10px] text-rose-400/60 hover:text-rose-300 hover:border-rose-400/20 transition-all duration-200"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CronCard({
  job,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  running,
}: {
  job: CronJobView;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  running: boolean;
}) {
  return (
    <article
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
      onClick={() => onEdit(job.id)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 text-emerald-400/60" />
          <p className="text-sm font-medium text-slate-200">{job.name}</p>
        </div>
        <StatusPill status={job.last_status ?? "PENDING"} />
      </div>

      <p className="text-xs text-slate-500">Agent: {job.agent_id}</p>
      <p className="mt-2 rounded-lg border border-white/[0.04] bg-white/[0.01] px-2 py-1 font-mono text-xs text-slate-400">{job.schedule}</p>

      <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {[
          { label: "Edit", icon: Pencil, onClick: () => onEdit(job.id) },
          { label: "History", icon: History, onClick: () => onShowRuns(job.id) },
          { label: running ? "Running..." : "Run", icon: Play, onClick: () => onRunNow(job), disabled: running },
        ].map(({ label, icon: Icon, onClick, disabled }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] disabled:opacity-40 transition-all duration-200"
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onDelete(job.id, job.name)}
          className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-[10px] text-rose-400/60 hover:text-rose-300 hover:border-rose-400/20 transition-all duration-200"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </article>
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

  const minute = parts[0];
  const hour = parts[1];

  const m = minute === "*" ? null : parseInt(minute, 10);
  const h = hour === "*" ? null : parseInt(hour, 10);
  if ((m !== null && Number.isNaN(m)) || (h !== null && Number.isNaN(h))) return [];

  const results: Date[] = [];
  let cursor = new Date();
  cursor.setSeconds(0, 0);

  for (let tries = 0; tries < 1440 * 7 && results.length < count; tries += 1) {
    cursor = new Date(cursor.getTime() + 60_000);
    const cm = cursor.getMinutes();
    const ch = cursor.getHours();
    if ((m === null || cm === m) && (h === null || ch === h)) {
      results.push(new Date(cursor));
    }
  }

  return results;
}
