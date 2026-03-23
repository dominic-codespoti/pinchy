import { createSignal, createMemo, Show, For, createEffect } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { ArrowLeft, Clock, Save } from "@/components/icons";
import { PageShell, FormField } from "@/components/layout";
import { createQuery, createMutation, invalidateQueries } from "@/api/use-api";
import {
  qk, fetchAgents, fetchCronJobs, fetchCronJobRuns,
  createCronJob, updateCronJob,
} from "@/api/queries";
import type {
  CronJob, CronRun,
  CreateCronJobPayload, UpdateCronJobPayload,
} from "@/api/schemas";
import { CRON_RE, computeNextFires, formatInTz, formatTimestamp } from "@/lib/utils";
import { toast } from "@/components/toast";

// ── Helpers ──────────────────────────────────────────

interface CronFormState {
  agentId: string;
  name: string;
  schedule: string;
  message: string;
  oneShot: boolean;
  dependsOn: string;
  maxRetries: string;
  retryDelay: string;
}

function emptyForm(): CronFormState {
  return {
    agentId: "",
    name: "",
    schedule: "0 * * * *",
    message: "",
    oneShot: false,
    dependsOn: "",
    maxRetries: "",
    retryDelay: "",
  };
}

function validateForm(form: CronFormState, valid: boolean): string | null {
  if (!form.agentId) return "Select an agent";
  if (!form.name.trim()) return "Name is required";
  if (!form.schedule.trim() || !valid) return "Valid cron schedule required";
  if (!form.message.trim()) return "Message is required";
  return null;
}

function buildPayload(form: CronFormState) {
  const retries = form.maxRetries ? parseInt(form.maxRetries, 10) : null;
  const delay = form.retryDelay ? parseInt(form.retryDelay, 10) : null;
  return {
    schedule: form.schedule.trim(),
    message: form.message.trim(),
    ...(form.oneShot && { one_shot: true as const }),
    ...(form.dependsOn && { depends_on: form.dependsOn }),
    ...(retries !== null && Number.isFinite(retries) && { max_retries: retries }),
    ...(delay !== null && Number.isFinite(delay) && { retry_delay_secs: delay }),
  };
}

// ── Status pill (for run history) ────────────────────

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

// ── Run history for existing jobs ────────────────────

function RunHistory(props: { jobId: string }) {
  const runsQ = createQuery({
    key: qk.cronJobRuns(props.jobId),
    fn: () => fetchCronJobRuns(props.jobId),
  });

  const runs = createMemo<readonly CronRun[]>(() => runsQ.data?.runs ?? []);

  return (
    <div class="card" style={{ padding: "var(--space-4)" }}>
      <div class="card-header">
        <span class="card-title">Run History</span>
      </div>

      <Show when={runsQ.isLoading}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-1)" }}>
          <div class="skeleton" style={{ height: "36px" }} />
          <div class="skeleton" style={{ height: "36px" }} />
        </div>
      </Show>

      <Show when={!runsQ.isLoading && runs().length === 0}>
        <p style={{ "font-size": "var(--text-xs)", color: "var(--muted-foreground)", opacity: 0.6 }}>
          No runs recorded yet.
        </p>
      </Show>

      <Show when={!runsQ.isLoading && runs().length > 0}>
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

// ── Main Component ───────────────────────────────────

export default function CronEdit() {
  const navigate = useNavigate();
  const params = useParams<{ jobId?: string }>();

  const editJobId = () => {
    const raw = params.jobId;
    return raw && raw !== "new" ? decodeURIComponent(raw) : "";
  };

  // Data queries
  const agentsQ = createQuery({ key: qk.agents, fn: fetchAgents });
  const cronQ = createQuery({ key: qk.cronJobs, fn: fetchCronJobs });

  const agents = createMemo(() => agentsQ.data?.agents ?? []);
  const allJobs = createMemo<readonly CronJob[]>(() => cronQ.data?.jobs ?? []);
  const editJob = createMemo(() =>
    editJobId() ? allJobs().find((j) => j.id === editJobId()) ?? null : null,
  );
  const isEdit = createMemo(() => editJob() !== null);

  // Form state
  const [form, setForm] = createSignal<CronFormState>(emptyForm());
  const set = <K extends keyof CronFormState>(k: K, v: CronFormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // Sync form when edit job data arrives
  createEffect(() => {
    const job = editJob();
    if (job) {
      setForm({
        agentId: job.agent_id,
        name: job.name,
        schedule: job.schedule,
        message: job.message ?? "",
        oneShot: false,
        dependsOn: job.depends_on ?? "",
        maxRetries: job.max_retries != null ? String(job.max_retries) : "",
        retryDelay: job.retry_delay_secs != null ? String(job.retry_delay_secs) : "",
      });
    }
  });

  // Set default agent when agents load and none selected
  createEffect(() => {
    const agentList = agents();
    if (form().agentId === "" && agentList.length > 0 && agentList[0]) {
      set("agentId", agentList[0].id);
    }
  });

  // Derived
  const valid = createMemo(() => CRON_RE.test(form().schedule.trim()));
  const nextFires = createMemo(() =>
    valid() ? computeNextFires(form().schedule.trim(), 5) : [],
  );

  // Mutations
  const createMut = createMutation({
    fn: (payload: CreateCronJobPayload) => createCronJob(payload),
    onSuccess: () => {
      invalidateQueries(qk.cronJobs);
      toast.success("Job created");
      navigate("/cron");
    },
    onError: (msg) => toast.error(msg),
  });

  const updateMut = createMutation({
    fn: (payload: UpdateCronJobPayload) => updateCronJob(editJobId(), payload),
    onSuccess: () => {
      invalidateQueries(qk.cronJobs);
      toast.success("Job updated");
      navigate("/cron");
    },
    onError: (msg) => toast.error(msg),
  });

  const isPending = () => createMut.isLoading || updateMut.isLoading;
  const [formError, setFormError] = createSignal<string | null>(null);

  function handleSubmit() {
    const f = form();
    const error = validateForm(f, valid());
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    const shared = buildPayload(f);
    if (isEdit()) {
      updateMut.mutate(shared satisfies UpdateCronJobPayload);
    } else {
      createMut.mutate({
        agent_id: f.agentId,
        name: f.name.trim(),
        ...shared,
      } satisfies CreateCronJobPayload);
    }
  }

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <>
          <button class="btn btn-ghost btn-sm" onClick={() => navigate("/cron")}>
            <ArrowLeft size={14} /> Back
          </button>
          <div class="separator-vertical" style={{ height: "20px" }} />
          <span style={{ "font-size": "var(--text-sm)", "font-weight": 600, color: "var(--foreground)" }}>
            {isEdit() ? "Edit Cron Job" : "New Cron Job"}
          </span>
        </>
      }
    >
      <div class="route-enter cron-edit-stack">
        {/* Error banner */}
        <Show when={formError()}>
          <p class="form-error" style={{ "font-size": "var(--text-sm)" }}>{formError()}</p>
        </Show>

        {/* Card: Details */}
        <div class="card" style={{ padding: "var(--space-4)" }}>
          <div class="card-header">
            <span class="card-title">Details</span>
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
            <FormField label="Agent">
              <select
                class="select"
                value={form().agentId}
                onChange={(e) => set("agentId", e.currentTarget.value)}
                disabled={isEdit()}
              >
                <option value="" disabled>Select agent</option>
                <For each={agents()}>
                  {(a) => <option value={a.id}>{a.id}</option>}
                </For>
              </select>
            </FormField>
            <FormField label="Name">
              <input
                class="input"
                value={form().name}
                onInput={(e) => set("name", e.currentTarget.value)}
                placeholder="daily-report"
                disabled={isEdit()}
              />
            </FormField>
          </div>
        </div>

        {/* Card: Schedule */}
        <div class="card" style={{ padding: "var(--space-4)" }}>
          <div class="card-header">
            <span class="card-title" style={{ display: "flex", "align-items": "center", gap: "6px" }}>
              <Clock size={14} style={{ opacity: 0.6 }} /> Schedule
            </span>
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
            <input
              class={`input cron-schedule-input ${form().schedule.trim() && !valid() ? "cron-schedule-invalid" : ""}`}
              value={form().schedule}
              onInput={(e) => set("schedule", e.currentTarget.value)}
              placeholder="0 9 * * *"
            />
            <Show when={form().schedule.trim() && !valid()}>
              <p class="form-error">Invalid cron expression</p>
            </Show>
            <Show when={nextFires().length > 0}>
              <div class="cron-next-fires">
                <p class="cron-next-fires-label">Next fires</p>
                <ul class="cron-next-fires-list">
                  <For each={nextFires()}>
                    {(d) => <li>{formatInTz(d)}</li>}
                  </For>
                </ul>
              </div>
            </Show>
          </div>
        </div>

        {/* Card: Message */}
        <div class="card" style={{ padding: "var(--space-4)" }}>
          <div class="card-header">
            <span class="card-title">Message</span>
          </div>
          <textarea
            class="textarea"
            style={{ "min-height": "100px" }}
            value={form().message}
            onInput={(e) => set("message", e.currentTarget.value)}
            placeholder="Describe what this cron job should do..."
          />
        </div>

        {/* Card: Options */}
        <div class="card" style={{ padding: "var(--space-4)" }}>
          <div class="card-header">
            <span class="card-title">Options</span>
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
            <div class="cron-checkbox-row">
              <input
                type="checkbox"
                id="one-shot"
                checked={form().oneShot}
                onChange={(e) => set("oneShot", e.currentTarget.checked)}
              />
              <label for="one-shot">One-shot (delete after first run)</label>
            </div>

            <FormField label="Depends on (optional)">
              <select
                class="select"
                value={form().dependsOn}
                onChange={(e) => set("dependsOn", e.currentTarget.value)}
              >
                <option value="">None</option>
                <For each={allJobs().filter((j) => j.id !== editJobId())}>
                  {(j) => <option value={j.id}>{j.name}</option>}
                </For>
              </select>
            </FormField>

            <div class="cron-options-grid">
              <FormField label="Max retries">
                <input
                  type="number"
                  class="input"
                  min="0"
                  value={form().maxRetries}
                  onInput={(e) => set("maxRetries", e.currentTarget.value)}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Retry delay (secs)">
                <input
                  type="number"
                  class="input"
                  min="0"
                  value={form().retryDelay}
                  onInput={(e) => set("retryDelay", e.currentTarget.value)}
                  placeholder="60"
                />
              </FormField>
            </div>
          </div>
        </div>

        {/* Run history (edit mode only) */}
        <Show when={editJobId()}>
          <RunHistory jobId={editJobId()} />
        </Show>

        {/* Footer */}
        <div class="cron-edit-footer">
          <button class="btn btn-ghost btn-sm" onClick={() => navigate("/cron")}>
            Cancel
          </button>
          <button
            class="btn btn-primary btn-sm"
            disabled={isPending()}
            onClick={handleSubmit}
          >
            <Save size={14} />
            {isPending() ? "Saving..." : isEdit() ? "Update Job" : "Create Job"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
