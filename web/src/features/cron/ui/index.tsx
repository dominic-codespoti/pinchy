import { useMemo, useRef, useState, useEffect } from "react";
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
  MoreVertical,
  RefreshCw,
} from "lucide-react";

import {
  createCronJob,
  deleteCronJob,
  getCronJobRuns,
  listAgents,
  listCronJobs,
  queryKeys,
  triggerCronJob,
} from "@/shared/api/client";
import { Button, Checkbox, Dialog, DialogContent, Input, Select, SelectItem, Separator, StatusPill, TextArea } from "@/shared/ui/components/ui";
import { BottomSheet, ActionSheet } from "@/shared/ui/components/BottomSheet";
import { CRON_RE, computeNextFires, formatInTz } from "@/shared/lib/utils";
import { useViewport } from "@/shared/lib/useViewport";
import { useSwipe, usePullToRefresh } from "@/shared/lib/useTouch";
import { cn } from "@/shared/lib/utils";

type CronJobView = {
  id: string;
  agent_id: string;
  name: string;
  schedule: string;
  message?: string | null;
  kind?: string;
  last_status?: string | null;
};

export function CronRoute() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isMobile, touchSupported } = useViewport();
  const contentRef = useRef<HTMLDivElement>(null);

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
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showRunsSheet, setShowRunsSheet] = useState(false);
  const [actionSheetJob, setActionSheetJob] = useState<CronJobView | null>(null);

  // Pull-to-refresh for mobile
  const { pullDistance, isRefreshing } = usePullToRefresh(contentRef, async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
  });

  const agentIds = useMemo(
    () => (agentsQuery.data?.agents ?? []).map((agent) => agent.id),
    [agentsQuery.data],
  );

  const agentTzMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const agent of agentsQuery.data?.agents ?? []) {
      map[agent.id] = agent.timezone ?? null;
    }
    return map;
  }, [agentsQuery.data]);

  const agentTz = useMemo(() => {
    const agent = (agentsQuery.data?.agents ?? []).find((a) => a.id === agentId);
    return agent?.timezone ?? null;
  }, [agentsQuery.data, agentId]);

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
      setShowCreateSheet(false);
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
      setActionSheetJob(null);
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
    triggerCronJob(job.id)
      .then(() => {
        toast.success(`Triggered ${job.name}`);
        void queryClient.invalidateQueries({ queryKey: ["cron-runs", job.id] });
      })
      .catch(() => toast.error("Failed to trigger cron run"))
      .finally(() => setRunningJobId(null));
  };

  const schedulePreview = computeNextFires(schedule, 5, agentTz);

  const handleShowRuns = (jobId: string) => {
    setSelectedJobId(jobId);
    if (isMobile) {
      setShowRunsSheet(true);
    }
  };

  const handleEdit = (jobId: string) => {
    navigate({ to: "/cron/$jobId", params: { jobId: encodeURIComponent(jobId) } });
  };

  const CreateForm = (
    <div className="space-y-4">
      <div className="space-y-3">
        <Select value={agentId} onValueChange={setAgentId}>
          {(agentIds.length ? agentIds : ["default"]).map((id) => (
            <SelectItem key={id} value={id}>{id}</SelectItem>
          ))}
        </Select>
        <Input 
          placeholder="Job name" 
          value={name} 
          onChange={(event) => setName(event.target.value)}
          className="h-11 touch-manipulation"
        />
        <Input 
          placeholder="Cron schedule (e.g., 0 * * * *)" 
          value={schedule} 
          onChange={(event) => setSchedule(event.target.value)}
          className="h-11 font-mono touch-manipulation"
        />
        <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-sm text-slate-400 min-h-[44px]">
          <Checkbox checked={oneShot} onCheckedChange={(checked) => setOneShot(Boolean(checked))} />
          <span>One-shot (delete after first run)</span>
        </label>
      </div>

      <div className={cn(
        "rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-sm",
        isMobile && "text-xs"
      )}>
        <span className="text-[10px] uppercase tracking-widest text-slate-600">Schedule preview{agentTz ? ` · ${agentTz}` : ""}</span>
        {!CRON_RE.test(schedule.trim()) ? (
          <p className="text-rose-300 mt-1">Expression appears invalid.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-slate-400">
            {schedulePreview.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-emerald-400/40" />
                {formatInTz(d, agentTz)}
              </li>
            ))}
            {!schedulePreview.length ? <li>No preview available for this expression.</li> : null}
          </ul>
        )}
      </div>

      <TextArea
        className="min-h-[120px] touch-manipulation"
        placeholder="What should this job do? (supports /slash commands)"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />

      <button
        type="button"
        disabled={createMutation.isPending}
        onClick={onCreate}
        className="w-full flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 touch-manipulation"
      >
        <Plus className="h-4 w-4" />
        {createMutation.isPending ? "Creating..." : "Create Job"}
      </button>
    </div>
  );

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

        <span className="text-xs text-slate-500 hidden sm:inline">Scheduled automation</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-500">
            {jobs.length} jobs
          </span>
          {/* Mobile: FAB for create */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowCreateSheet(true)}
              className="flex items-center justify-center h-9 w-9 rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 transition-all"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto relative">
        {/* Pull-to-refresh indicator */}
        {touchSupported && (
          <div 
            className={cn(
              "absolute top-0 left-0 right-0 z-10 flex items-center justify-center transition-transform duration-200",
              isRefreshing ? "text-emerald-400" : "text-slate-500"
            )}
            style={{ 
              transform: `translateY(${Math.min(pullDistance * 0.5, 60)}px)`,
              opacity: pullDistance > 20 ? Math.min((pullDistance - 20) / 40, 1) : 0
            }}
          >
            <div className="flex items-center gap-2 py-2">
              {isRefreshing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
              )}
              <span className="text-xs">{isRefreshing ? "Refreshing..." : "Pull to refresh"}</span>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

          {/* ── Create job (desktop only) ──────────────────────────── */}
          {!isMobile && (
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
                <span className="text-[10px] uppercase tracking-widest text-slate-600">Schedule preview{agentTz ? ` · ${agentTz}` : ""}</span>
                {!CRON_RE.test(schedule.trim()) ? (
                  <p className="text-rose-300 mt-1">Expression appears invalid.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-slate-400">
                    {schedulePreview.map((d, i) => (
                      <li key={i}>{formatInTz(d, agentTz)}</li>
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
          )}

          {/* ── Job table (desktop) ─────────────────── */}
          {jobs.length > 0 && (
            <div className="hidden md:block rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.06] text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Agent</th>
                    <th className="px-3 py-2.5">Schedule</th>
                    <th className="px-3 py-2.5">Next fire</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <CronRow
                      key={job.id}
                      job={job}
                      agentTz={agentTzMap[job.agent_id] ?? null}
                      onDelete={(jobId, jobName) => setConfirmDelete({ id: jobId, name: jobName })}
                      onEdit={handleEdit}
                      onShowRuns={handleShowRuns}
                      onRunNow={runNow}
                      running={runningJobId === job.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Job cards (mobile) ──────────────────── */}
          <div className="space-y-3 md:hidden">
            {jobs.map((job) => (
              <SwipeableCronCard
                key={job.id}
                job={job}
                agentTz={agentTzMap[job.agent_id] ?? null}
                onDelete={(jobId, jobName) => setConfirmDelete({ id: jobId, name: jobName })}
                onEdit={handleEdit}
                onShowRuns={handleShowRuns}
                onRunNow={runNow}
                onShowActions={() => setActionSheetJob(job)}
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
              <p className="text-xs text-slate-600 mt-1">{isMobile ? "Tap + to create a job" : "Create a scheduled task above to begin automation."}</p>
            </div>
          ) : null}

          {/* ── Run history (desktop inline) ─────────────────────────── */}
          {selectedJobId && !isMobile && (
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
              <RunHistoryContent runs={runsQuery.data?.runs ?? []} isLoading={runsQuery.isLoading} agentTz={agentTzMap[jobs.find(j => j.id === selectedJobId)?.agent_id ?? ""] ?? null} />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile: Create Job BottomSheet ─────────────────────────── */}
      <BottomSheet
        isOpen={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        title="Create Cron Job"
      >
        {CreateForm}
      </BottomSheet>

      {/* ── Mobile: Run History BottomSheet ─────────────────────────── */}
      <BottomSheet
        isOpen={showRunsSheet}
        onClose={() => {
          setShowRunsSheet(false);
          setSelectedJobId(null);
        }}
        title={selectedJobId ? `Run History · ${jobs.find(j => j.id === selectedJobId)?.name ?? selectedJobId}` : "Run History"}
      >
        <RunHistoryContent 
          runs={runsQuery.data?.runs ?? []} 
          isLoading={runsQuery.isLoading} 
          agentTz={agentTzMap[jobs.find(j => j.id === selectedJobId)?.agent_id ?? ""] ?? null}
          isMobile
        />
      </BottomSheet>

      {/* ── Mobile: Job Actions ActionSheet ─────────────────────────── */}
      <ActionSheet
        isOpen={!!actionSheetJob}
        onClose={() => setActionSheetJob(null)}
        actions={actionSheetJob ? [
          { 
            label: "Run Now", 
            icon: Play,
            onClick: () => { 
              runNow(actionSheetJob); 
              setActionSheetJob(null); 
            } 
          },
          { 
            label: "View History", 
            icon: History,
            onClick: () => { 
              handleShowRuns(actionSheetJob.id); 
              setActionSheetJob(null); 
            } 
          },
          { 
            label: "Edit Job", 
            icon: Pencil,
            onClick: () => { 
              handleEdit(actionSheetJob.id); 
              setActionSheetJob(null); 
            } 
          },
          { 
            label: "Delete", 
            icon: Trash2,
            destructive: true,
            onClick: () => { 
              setConfirmDelete({ id: actionSheetJob.id, name: actionSheetJob.name }); 
              setActionSheetJob(null); 
            } 
          },
        ] : []}
      />

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
  agentTz,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  running,
}: {
  job: CronJobView;
  agentTz: string | null;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  running: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const nextFires = computeNextFires(job.schedule, 5, agentTz);
  const nextFire = nextFires[0] ?? null;
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
      <td
        className="px-3 py-2 text-slate-500 tabular-nums"
        onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
      >
        {nextFire ? (
          <div>
            <span className="flex items-center gap-1 hover:text-slate-300 transition-colors cursor-pointer">
              <Clock className="h-3 w-3 text-emerald-400/40" />
              {formatInTz(nextFire, agentTz)}
            </span>
            {expanded && nextFires.length > 1 && (
              <ul className="mt-1.5 space-y-0.5 pl-4 border-l border-white/[0.06]">
                {nextFires.slice(1).map((d, i) => (
                  <li key={i} className="text-[10px] text-slate-600">{formatInTz(d, agentTz)}</li>
                ))}
                {agentTz && <li className="text-[10px] text-slate-700 mt-1">{agentTz}</li>}
              </ul>
            )}
          </div>
        ) : "—"}
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
  agentTz,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  onShowActions,
  running,
  className,
}: {
  job: CronJobView;
  agentTz: string | null;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  onShowActions?: () => void;
  running: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const nextFires = computeNextFires(job.schedule, 5, agentTz);
  const nextFire = nextFires[0] ?? null;
  return (
    <article
      className={cn(
        "rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 cursor-pointer active:bg-white/[0.04] transition-colors touch-manipulation",
        className
      )}
      onClick={() => onEdit(job.id)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 shrink-0">
            <CalendarClock className="h-4 w-4 text-emerald-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{job.name}</p>
            <p className="text-xs text-slate-500">{job.agent_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={job.last_status ?? "PENDING"} />
          {onShowActions && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onShowActions(); }}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2 font-mono text-sm text-slate-400">{job.schedule}</p>
        {nextFire && (
          <div
            className="flex items-center gap-2"
            onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
          >
            <Clock className="h-3.5 w-3.5 text-emerald-400/40" />
            <p className="text-sm text-slate-400 hover:text-slate-300 transition-colors cursor-pointer">
              Next: {formatInTz(nextFire, agentTz)}
            </p>
          </div>
        )}
        {expanded && nextFires.length > 1 && (
          <ul className="ml-6 space-y-1 border-l border-white/[0.06] pl-3">
            {nextFires.slice(1).map((d, i) => (
              <li key={i} className="text-xs text-slate-600">{formatInTz(d, agentTz)}</li>
            ))}
            {agentTz && <li className="text-xs text-slate-700 mt-1">{agentTz}</li>}
          </ul>
        )}
      </div>

      {/* Touch-friendly action buttons */}
      <div className="mt-4 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onRunNow(job)}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:border-white/[0.12] disabled:opacity-40 transition-all duration-200 min-h-[44px] touch-manipulation"
        >
          <Play className="h-3.5 w-3.5" />
          {running ? "Running..." : "Run"}
        </button>
        <button
          type="button"
          onClick={() => onShowRuns(job.id)}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200 min-h-[44px] touch-manipulation"
        >
          <History className="h-3.5 w-3.5" /> History
        </button>
        <button
          type="button"
          onClick={() => onDelete(job.id, job.name)}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-2.5 text-xs text-rose-400/60 hover:text-rose-300 hover:border-rose-400/20 transition-all duration-200 min-h-[44px] touch-manipulation"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </article>
  );
}

// Swipeable job card with delete/trigger actions
function SwipeableCronCard({
  job,
  agentTz,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  onShowActions,
  running,
}: {
  job: CronJobView;
  agentTz: string | null;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  onShowActions: () => void;
  running: boolean;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const { isMobile } = useViewport();

  const { deltaX, isDragging } = useSwipe(cardRef as React.RefObject<HTMLElement>, {
    onSwipeRight: () => {
      if (swipeOffset < -80) {
        // Swiped far enough right - trigger action
        onRunNow(job);
      }
      setSwipeOffset(0);
    },
    onSwipeLeft: () => {
      if (swipeOffset > 80) {
        // Swiped far enough left - delete
        onDelete(job.id, job.name);
      }
      setSwipeOffset(0);
    },
    onSwipeStart: () => {},
    onSwipeEnd: () => {
      // Snap back if not swiped far enough
      if (Math.abs(swipeOffset) < 80) {
        setSwipeOffset(0);
      }
    },
    threshold: 20,
    preventDefault: false,
  });

  // Update swipe offset during drag
  useEffect(() => {
    if (isDragging && isMobile) {
      const maxOffset = 120;
      const dampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaX * 0.6));
      setSwipeOffset(dampedOffset);
    }
  }, [deltaX, isDragging, isMobile]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background actions revealed during swipe */}
      <div 
        className="absolute inset-0 flex items-center justify-between px-4"
        style={{
          background: swipeOffset > 0 
            ? 'linear-gradient(to right, rgba(244, 63, 94, 0.2), rgba(244, 63, 94, 0.1))'
            : swipeOffset < 0 
              ? 'linear-gradient(to left, rgba(52, 211, 153, 0.2), rgba(52, 211, 153, 0.1))'
              : 'transparent'
        }}
      >
        {/* Left swipe = Delete */}
        <div className={cn(
          "flex items-center gap-2 text-rose-400 transition-opacity",
          swipeOffset > 40 ? "opacity-100" : "opacity-0"
        )}>
          <Trash2 className="h-5 w-5" />
          <span className="text-sm font-medium">Delete</span>
        </div>
        {/* Right swipe = Run */}
        <div className={cn(
          "flex items-center gap-2 text-emerald-400 transition-opacity",
          swipeOffset < -40 ? "opacity-100" : "opacity-0"
        )}>
          <span className="text-sm font-medium">{running ? "Running..." : "Run Now"}</span>
          <Play className="h-5 w-5" />
        </div>
      </div>

      {/* Main card */}
      <div
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        <CronCard
          job={job}
          agentTz={agentTz}
          onDelete={onDelete}
          onEdit={onEdit}
          onShowRuns={onShowRuns}
          onRunNow={onRunNow}
          onShowActions={onShowActions}
          running={running}
        />
      </div>
    </div>
  );
}

// Mobile-optimized run history component
function RunHistoryContent({ 
  runs, 
  isLoading, 
  agentTz,
  isMobile = false 
}: { 
  runs: Array<{
    id: string | number;
    status: string;
    executed_at?: number | null;
    duration_ms?: number | null;
    output_preview?: string | null;
    error?: string | null;
  }>;
  isLoading: boolean;
  agentTz: string | null;
  isMobile?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
        <span className="text-sm text-slate-500">Loading runs…</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", isMobile && "pb-4")}>
      {runs.slice(0, isMobile ? 50 : 20).map((run) => (
        <article 
          key={String(run.id)} 
          className={cn(
            "rounded-lg border border-white/[0.04] bg-white/[0.01] text-xs",
            isMobile ? "p-3" : "p-2.5"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <StatusPill status={run.status} />
            <span className="text-[10px] tabular-nums text-slate-600">
              {run.executed_at ? new Date(run.executed_at * 1000).toLocaleString() : "-"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 mb-1">
            <span>Duration: {run.duration_ms ?? "-"} ms</span>
            {agentTz && <span className="text-slate-600">· {agentTz}</span>}
          </div>
          <p className={cn(
            "text-slate-300",
            isMobile ? "line-clamp-3" : "truncate"
          )}>
            {run.output_preview ?? run.error ?? "-"}
          </p>
        </article>
      ))}
      {!runs.length && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <History className="h-5 w-5 text-slate-700 mb-2" />
          <p className="text-xs text-slate-600">No run history yet</p>
        </div>
      )}
    </div>
  );
}

