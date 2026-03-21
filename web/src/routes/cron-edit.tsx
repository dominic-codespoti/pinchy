import { useState, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Clock, Save } from "lucide-react";
import {
  useAgentsQuery, useCreateCronJobMutation,
  useUpdateCronJobMutation, useCronJobsQuery,
} from "@/api/queries";
import type { CreateCronJobPayload, UpdateCronJobPayload } from "@/api/schemas";
import {
  Card, CardHeader, CardTitle, CardContent,
  Button, Input, TextArea, Select, SelectItem, Checkbox,
} from "@/components/ui";
import { PageShell } from "@/components/layout";
import { FormField } from "@/components/layout";
import { cn, CRON_RE, computeNextFires, formatInTz, mutationOpts } from "@/lib/utils";

function getJobIdParam(params: Record<string, string>): string {
  const raw = params["jobId"];
  if (typeof raw === "string" && raw !== "new") return decodeURIComponent(raw);
  return "";
}

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

/** Validate cron form — returns error message or null */
function validateCronForm(form: CronFormState, valid: boolean): string | null {
  if (!form.agentId) return "Select an agent";
  if (!form.name.trim()) return "Name is required";
  if (!form.schedule.trim() || !valid) return "Valid cron schedule required";
  if (!form.message.trim()) return "Message is required";
  return null;
}

/** Build the shared payload fields from form state */
function buildCronPayload(form: CronFormState) {
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

export function CronEditRoute() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const editJobId = getJobIdParam(params);
  const agentsQ = useAgentsQuery();
  const cronQ = useCronJobsQuery();
  const createMut = useCreateCronJobMutation();
  const updateMut = useUpdateCronJobMutation(editJobId);
  const agents = agentsQ.data?.agents ?? [];
  const allJobs = cronQ.data?.jobs ?? [];
  const editJob = editJobId ? allJobs.find((j) => j.id === editJobId) ?? null : null;
  const isEdit = editJob !== null;

  const [form, setForm] = useState<CronFormState>(() => ({
    agentId: editJob?.agent_id ?? agents[0]?.id ?? "",
    name: editJob?.name ?? "",
    schedule: editJob?.schedule ?? "0 * * * *",
    message: editJob?.message ?? "",
    oneShot: false,
    dependsOn: "",
    maxRetries: "",
    retryDelay: "",
  }));
  const set = <K extends keyof CronFormState>(k: K, v: CronFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Sync form state when the cron job data loads (direct navigation)
  useEffect(() => {
    if (editJob === null) return;
    setForm({
      agentId: editJob.agent_id,
      name: editJob.name,
      schedule: editJob.schedule,
      message: editJob.message ?? "",
      oneShot: false,
      dependsOn: editJob.depends_on ?? "",
      maxRetries: editJob.max_retries != null ? String(editJob.max_retries) : "",
      retryDelay: editJob.retry_delay_secs != null ? String(editJob.retry_delay_secs) : "",
    });
  }, [editJob]);

  // Sync agent when agents list loads and no agent is selected yet
  useEffect(() => {
    if (form.agentId === "" && agents.length > 0 && agents[0] !== undefined) {
      set("agentId", agents[0].id);
    }
  }, [form.agentId, agents]);

  const valid = CRON_RE.test(form.schedule.trim());
  const nextFires = valid ? computeNextFires(form.schedule.trim(), 3) : [];
  const isPending = createMut.isPending || updateMut.isPending;
  const goBack = useCallback(() => navigate({ to: "/cron" }), [navigate]);

  const handleSubmit = useCallback(() => {
    const error = validateCronForm(form, valid);
    if (error) { toast.error(error); return; }
    const shared = buildCronPayload(form);
    const opts = mutationOpts(isEdit ? "Job updated" : "Job created", goBack);
    if (isEdit) {
      updateMut.mutate(shared satisfies UpdateCronJobPayload, opts);
    } else {
      createMut.mutate(
        { agent_id: form.agentId, name: form.name.trim(), ...shared } satisfies CreateCronJobPayload,
        opts,
      );
    }
  }, [form, valid, isEdit, createMut, updateMut, goBack]);

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <>
          <Button variant="ghost" size="xs" className="gap-1" onClick={goBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <span className="text-sm font-semibold text-text-1">
            {isEdit ? "Edit Cron Job" : "New Cron Job"}
          </span>
        </>
      }
    >
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <FormField label="Agent">
            <Select value={form.agentId} onValueChange={(v) => set("agentId", v)} disabled={isEdit} placeholder="Select agent">
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>)}
            </Select>
          </FormField>
          <FormField label="Name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="daily-report" disabled={isEdit} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-accent opacity-60" /> Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={form.schedule} onChange={(e) => set("schedule", e.target.value)} placeholder="0 9 * * *"
            className={cn("font-mono", form.schedule.trim() && !valid && "!border-danger/40")} />
          {form.schedule.trim() && !valid && <p className="text-xs text-danger">Invalid cron expression</p>}
          {nextFires.length > 0 && (
            <div className="rounded-lg border border-border bg-[var(--color-elevated)] p-2.5">
              <p className="text-[10px] uppercase tracking-widest text-text-3 mb-1">Next fires</p>
              <ul className="space-y-0.5 text-xs text-text-2">
                {nextFires.map((d, i) => <li key={i}>{formatInTz(d)}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Message</CardTitle></CardHeader>
        <CardContent>
          <TextArea className="min-h-[100px]" value={form.message}
            onChange={(e) => set("message", e.target.value)} placeholder="Describe what this cron job should do..." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Options</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <FormField label="One-shot (delete after first run)" inline>
            <Checkbox checked={form.oneShot} onCheckedChange={(v) => set("oneShot", Boolean(v))} />
          </FormField>
          <FormField label="Depends on (optional)">
            <Select value={form.dependsOn} onValueChange={(v) => set("dependsOn", v)} placeholder="None">
              <SelectItem value="">None</SelectItem>
              {allJobs.filter((j) => j.id !== editJobId).map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Max retries">
              <Input type="number" min="0" value={form.maxRetries}
                onChange={(e) => set("maxRetries", e.target.value)} placeholder="0" />
            </FormField>
            <FormField label="Retry delay (secs)">
              <Input type="number" min="0" value={form.retryDelay}
                onChange={(e) => set("retryDelay", e.target.value)} placeholder="60" />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-4">
        <Button variant="ghost" size="sm" onClick={goBack}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={isPending} onClick={handleSubmit}>
          <Save className="h-3.5 w-3.5 mr-1" />
          {isPending ? "Saving..." : isEdit ? "Update Job" : "Create Job"}
        </Button>
      </div>
    </PageShell>
  );
}
