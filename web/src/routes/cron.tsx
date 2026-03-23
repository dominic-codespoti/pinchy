import { createSignal, createMemo, Show, For } from "solid-js";
import { A } from "@solidjs/router";
import {
  Clock, Plus, Play, Trash2, ChevronRight, Pencil,
} from "@/components/icons";
import { PageShell, PageTitle } from "@/components/layout";
import { createQuery, createMutation, invalidateQueries } from "@/api/use-api";
import {
  qk, fetchCronJobs, fetchCronJobRuns,
  deleteCronJob, triggerCronJob,
} from "@/api/queries";
import type { CronJob, CronRun } from "@/api/schemas";
import { formatTimestamp } from "@/lib/utils";
import { toast } from "@/components/toast";

// ── Status pill ──────────────────────────────────────

function StatusPill(props: { status: string }) {
  const cls = () => {
    const s = props.status.toLowerCase();
    if (s === "success" || s === "ok" || s === "completed") return "cron-status-success";
    if (s === "failed" || s === "error") return "cron-status-failed";
    if (s === "running") return "cron-status-running";
    return "cron-status-pending";
  };
  return <span class={`cron-status ${cls()}`}>{props.status}</span>;
}

// ── Run History ──────────────────────────────────────

function RunHistory(props: { jobId: string }) {
  const runsQ = createQuery({
    key: qk.cronJobRuns(props.jobId),
    fn: () => fetchCronJobRuns(props.jobId),
  });

  const runs = createMemo<readonly CronRun[]>(
    () => runsQ.data?.runs ?? [],
  );

  return (
    <div class="cron-runs">
      <Show when={runsQ.isLoading}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-1)" }}>
          <div class="skeleton" style={{ height: "36px" }} />
          <div class="skeleton" style={{ height: "36px" }} />
        </div>
      </Show>

      <Show when={!runsQ.isLoading && runs().length === 0}>
        <p class="cron-runs-empty">No runs recorded yet.</p>
      </Show>

      <Show when={!runsQ.isLoading && runs().length > 0}>
        <p class="cron-runs-label">Recent runs</p>
        <For each={runs().slice(0, 10)}>
          {(run) => (
            <div class="cron-run-row">
              <StatusPill status={run.status} />
              <span class="cron-run-time">
                {run.executed_at != null ? formatTimestamp(run.executed_at) : "-"}
              </span>
              <Show when={run.duration_ms != null}>
                <span class="cron-run-duration">{run.duration_ms}ms</span>
              </Show>
              <span class="cron-run-output">
                {run.output_preview ?? run.error ?? ""}
              </span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

// ── Job Card ─────────────────────────────────────────

function JobCard(props: {
  job: CronJob;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  const triggerMut = createMutation({
    fn: (jobId: string) => triggerCronJob(jobId),
    onSuccess: () => {
      invalidateQueries(qk.cronJobs);
      toast.success("Job triggered");
    },
    onError: (msg) => toast.error(msg),
  });

  const deleteMut = createMutation({
    fn: (jobId: string) => deleteCronJob(jobId),
    onSuccess: () => {
      invalidateQueries(qk.cronJobs);
      setConfirmDelete(false);
      toast.success("Job deleted");
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <div class="cron-card">
      {/* Header: name + agent badge + status + actions */}
      <div class="cron-card-header">
        <div class="cron-card-info">
          <span class="cron-card-name">{props.job.name}</span>
          <span class="badge badge-outline" style={{ "font-size": "10px" }}>
            {props.job.agent_id}
          </span>
          <StatusPill status={props.job.last_status ?? "PENDING"} />
        </div>

        <div class="cron-card-actions">
          <button
            class="btn btn-ghost btn-sm"
            disabled={triggerMut.isLoading}
            onClick={() => triggerMut.mutate(props.job.id)}
            title="Run now"
          >
            <Play size={12} /> Run
          </button>

          <A
            href={`/cron/edit/${props.job.id}`}
            class="btn btn-ghost btn-sm"
            style={{ "text-decoration": "none" }}
            title="Edit"
          >
            <Pencil size={12} />
          </A>

          <Show when={!confirmDelete()}>
            <button
              class="btn btn-ghost btn-sm"
              style={{ color: "oklch(from var(--destructive) l c h / 60%)" }}
              onClick={() => setConfirmDelete(true)}
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </Show>

          <Show when={confirmDelete()}>
            <div class="cron-delete-confirm">
              <button
                class="btn btn-ghost btn-sm"
                style={{ color: "var(--destructive)", "font-size": "var(--text-xs)" }}
                disabled={deleteMut.isLoading}
                onClick={() => deleteMut.mutate(props.job.id)}
              >
                {deleteMut.isLoading ? "..." : "Confirm"}
              </button>
              <button
                class="btn btn-ghost btn-sm"
                style={{ color: "var(--muted-foreground)", "font-size": "var(--text-xs)" }}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          </Show>

          <button
            class="btn btn-ghost btn-icon btn-sm"
            onClick={() => props.onToggle()}
          >
            <span
              class="session-list-chevron"
              classList={{ "session-list-chevron-open": props.isExpanded }}
            >
              <ChevronRight size={14} />
            </span>
          </button>
        </div>
      </div>

      {/* Body: schedule + metadata */}
      <div class="cron-card-body">
        <div class="cron-card-meta">
          <span class="cron-card-schedule">
            <Clock size={12} style={{ opacity: 0.4 }} />
            <code>{props.job.schedule}</code>
          </span>
          <Show when={props.job.max_retries != null && props.job.max_retries! > 0}>
            <span>retries: {props.job.retry_count ?? 0}/{props.job.max_retries}</span>
          </Show>
          <Show when={props.job.retry_delay_secs != null && props.job.retry_delay_secs! > 0}>
            <span>delay: {props.job.retry_delay_secs}s</span>
          </Show>
          <Show when={!!props.job.depends_on}>
            <span>depends on: {props.job.depends_on}</span>
          </Show>
        </div>
      </div>

      {/* Collapsible run history */}
      <Show when={props.isExpanded}>
        <RunHistory jobId={props.job.id} />
      </Show>
    </div>
  );
}

// ── Main Component ───────────────────────────────────

export default function Cron() {
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const jobsQ = createQuery({
    key: qk.cronJobs,
    fn: fetchCronJobs,
  });

  const jobs = createMemo<readonly CronJob[]>(() => jobsQ.data?.jobs ?? []);

  return (
    <PageShell
      maxWidth="3xl"
      header={
        <PageTitle icon={<Clock size={14} />} title="Cron Jobs">
          <span style={{ "font-size": "10px", color: "var(--muted-foreground)", "font-variant-numeric": "tabular-nums" }}>
            {jobs().length} job{jobs().length !== 1 ? "s" : ""}
          </span>
          <A href="/cron/edit" class="btn btn-primary btn-sm" style={{ "text-decoration": "none" }}>
            <Plus size={14} /> New Job
          </A>
        </PageTitle>
      }
    >
      <div class="route-enter cron-stack">
        {/* Loading */}
        <Show when={jobsQ.isLoading}>
          <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
            <div class="skeleton" style={{ height: "80px", "border-radius": "var(--radius-lg)" }} />
            <div class="skeleton" style={{ height: "80px", "border-radius": "var(--radius-lg)" }} />
            <div class="skeleton" style={{ height: "80px", "border-radius": "var(--radius-lg)" }} />
          </div>
        </Show>

        {/* Error */}
        <Show when={jobsQ.isError}>
          <p style={{ "font-size": "var(--text-sm)", color: "var(--destructive)" }}>
            Failed to load cron jobs.
          </p>
        </Show>

        {/* Empty */}
        <Show when={!jobsQ.isLoading && !jobsQ.isError && jobs().length === 0}>
          <div class="empty-state">
            <Clock size={24} />
            <p>No cron jobs yet</p>
            <span style={{ "font-size": "var(--text-xs)", color: "var(--muted-foreground)" }}>
              Create a scheduled task to begin automation.
            </span>
          </div>
        </Show>

        {/* Job list */}
        <Show when={!jobsQ.isLoading && jobs().length > 0}>
          <For each={jobs()}>
            {(job) => (
              <JobCard
                job={job}
                isExpanded={expandedId() === job.id}
                onToggle={() =>
                  setExpandedId(expandedId() === job.id ? null : job.id)
                }
              />
            )}
          </For>
        </Show>
      </div>
    </PageShell>
  );
}
