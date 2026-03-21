import { useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Play, Trash2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import {
  useCronJobsQuery, useCronJobRunsQuery,
  useDeleteCronJobMutation, useTriggerCronJobMutation,
} from "@/api/queries";
import type { CronRun } from "@/api/schemas";
import {
  Card, CardHeader, CardTitle, CardContent,
  Button, Badge, StatusPill, Skeleton, EmptyState,
} from "@/components/ui";
import { PageShell, PageTitle } from "@/components/layout";
import { formatTimestamp, mutationOpts } from "@/lib/utils";

export function CronRoute() {
  const jobsQuery = useCronJobsQuery();
  const deleteMut = useDeleteCronJobMutation();
  const triggerMut = useTriggerCronJobMutation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const jobs = jobsQuery.data?.jobs ?? [];

  const handleTrigger = useCallback((jobId: string, jobName: string) => {
    triggerMut.mutate(jobId, mutationOpts(`Triggered "${jobName}"`));
  }, [triggerMut]);

  const handleDelete = useCallback((jobId: string) => {
    deleteMut.mutate(jobId, mutationOpts("Cron job deleted", () => setConfirmDeleteId(null)));
  }, [deleteMut]);

  return (
    <PageShell
      header={
        <PageTitle icon={<Clock className="h-3.5 w-3.5" />} title="Cron Jobs">
          <span className="text-xs text-text-3">{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
          <Button asChild variant="primary" size="sm">
            <Link to="/cron/$jobId" params={{ jobId: "new" }}><Plus className="h-3.5 w-3.5 mr-1" /> New Job</Link>
          </Button>
        </PageTitle>
      }
    >
      {jobsQuery.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}
      {jobsQuery.error && <p className="text-sm text-danger">Failed to load cron jobs.</p>}
      {!jobsQuery.isLoading && jobs.length === 0 && (
        <EmptyState icon={<Clock />} title="No cron jobs yet" subtitle="Create a scheduled task to begin automation." />
      )}

      {jobs.map((job) => {
        const isExpanded = expandedId === job.id;
        const isConfirming = confirmDeleteId === job.id;
        return (
          <Card key={job.id}>
            <CardHeader>
              <div className="flex items-center gap-2 min-w-0">
                <CardTitle className="truncate">{job.name}</CardTitle>
                <Badge variant="neutral" className="text-[10px] shrink-0">{job.agent_id}</Badge>
                <StatusPill status={job.last_status ?? "PENDING"} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="xs" className="gap-1"
                  disabled={triggerMut.isPending} onClick={() => handleTrigger(job.id, job.name)}>
                  <Play className="h-3 w-3" /> Run
                </Button>
                {isConfirming ? (
                  <div className="flex items-center gap-1">
                    <Button variant="danger" size="xs"
                      disabled={deleteMut.isPending} onClick={() => handleDelete(job.id)}>
                      {deleteMut.isPending ? "Deleting..." : "Confirm"}
                    </Button>
                    <Button variant="ghost" size="xs"
                      onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="xs"
                    className="text-danger/60 hover:text-danger"
                    onClick={() => setConfirmDeleteId(job.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="!h-7 !w-7 !p-0"
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}>
                  {isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-3">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-accent opacity-40" />
                  <code>{job.schedule}</code>
                </span>
                {job.max_retries != null && job.max_retries > 0 && (
                  <span>retries: {job.retry_count ?? 0}/{job.max_retries}</span>
                )}
                {job.retry_delay_secs != null && job.retry_delay_secs > 0 && (
                  <span>delay: {job.retry_delay_secs}s</span>
                )}
                {job.depends_on && <span>depends on: {job.depends_on}</span>}
              </div>
              {isExpanded && <RunHistory jobId={job.id} />}
            </CardContent>
          </Card>
        );
      })}
    </PageShell>
  );
}

function RunHistory({ jobId }: { readonly jobId: string }) {
  const runsQuery = useCronJobRunsQuery(jobId);
  const runs = runsQuery.data?.runs ?? [];
  if (runsQuery.isLoading) {
    return (
      <div className="mt-3 space-y-1">
        {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (runs.length === 0) {
    return <p className="mt-3 text-xs text-text-3 opacity-60">No runs recorded yet.</p>;
  }
  return (
    <div className="mt-3 space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-text-3 mb-1">Recent runs</p>
      {runs.slice(0, 10).map((run) => <RunRow key={String(run.id)} run={run} />)}
    </div>
  );
}

function RunRow({ run }: { readonly run: CronRun }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-[var(--color-elevated)] px-3 py-2 text-xs">
      <StatusPill status={run.status} />
      <span className="text-text-3 tabular-nums">
        {run.executed_at != null ? formatTimestamp(run.executed_at) : "-"}
      </span>
      {run.duration_ms != null && <span className="text-text-3 opacity-60">{run.duration_ms}ms</span>}
      <span className="ml-auto truncate max-w-[40%] text-text-2">
        {run.output_preview ?? run.error ?? ""}
      </span>
    </div>
  );
}
