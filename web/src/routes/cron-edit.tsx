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
import { cn, CRON_RE, computeNextFires, formatInTz } from "@/lib/utils";

function getJobIdParam(params: Record<string, string>): string {
  const raw = params["jobId"];
  if (typeof raw === "string" && raw !== "new") return decodeURIComponent(raw);
  return "";
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

  const [agentId, setAgentId] = useState(() => editJob?.agent_id ?? agents[0]?.id ?? "");
  const [name, setName] = useState(() => editJob?.name ?? "");
  const [schedule, setSchedule] = useState(() => editJob?.schedule ?? "0 * * * *");
  const [message, setMessage] = useState(() => editJob?.message ?? "");
  const [oneShot, setOneShot] = useState(false);
  const [dependsOn, setDependsOn] = useState("");
  const [maxRetries, setMaxRetries] = useState("");
  const [retryDelay, setRetryDelay] = useState("");

  // Sync form state when the cron job data loads (direct navigation)
  useEffect(() => {
    if (editJob === null) return;
    setAgentId(editJob.agent_id);
    setName(editJob.name);
    setSchedule(editJob.schedule);
    setMessage(editJob.message ?? "");
    setOneShot(false);
    setDependsOn(editJob.depends_on ?? "");
    setMaxRetries(editJob.max_retries != null ? String(editJob.max_retries) : "");
    setRetryDelay(editJob.retry_delay_secs != null ? String(editJob.retry_delay_secs) : "");
  }, [editJob]);

  // Sync agent when agents list loads and no agent is selected yet
  useEffect(() => {
    if (agentId === "" && agents.length > 0 && agents[0] !== undefined) {
      setAgentId(agents[0].id);
    }
  }, [agentId, agents]);

  const valid = CRON_RE.test(schedule.trim());
  const nextFires = valid ? computeNextFires(schedule.trim(), 3) : [];
  const isPending = createMut.isPending || updateMut.isPending;
  const goBack = useCallback(() => navigate({ to: "/cron" }), [navigate]);

  const handleSubmit = useCallback(() => {
    if (!agentId) { toast.error("Select an agent"); return; }
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!schedule.trim() || !valid) { toast.error("Valid cron schedule required"); return; }
    if (!message.trim()) { toast.error("Message is required"); return; }
    const retries = maxRetries ? parseInt(maxRetries, 10) : undefined;
    const delay = retryDelay ? parseInt(retryDelay, 10) : undefined;
    const opts = {
      onSuccess: () => { toast.success(isEdit ? "Job updated" : "Job created"); goBack(); },
      onError: (err: Error) => toast.error(err.message),
    };
    if (isEdit) {
      const p: UpdateCronJobPayload = {
        schedule: schedule.trim(), message: message.trim(),
        one_shot: oneShot || undefined, depends_on: dependsOn || undefined,
        max_retries: Number.isFinite(retries) ? retries : undefined,
        retry_delay_secs: Number.isFinite(delay) ? delay : undefined,
      };
      updateMut.mutate(p, opts);
    } else {
      const p: CreateCronJobPayload = {
        agent_id: agentId, name: name.trim(),
        schedule: schedule.trim(), message: message.trim(),
        one_shot: oneShot || undefined, depends_on: dependsOn || undefined,
        max_retries: Number.isFinite(retries) ? retries : undefined,
        retry_delay_secs: Number.isFinite(delay) ? delay : undefined,
      };
      createMut.mutate(p, opts);
    }
  }, [agentId, name, schedule, valid, message, oneShot, dependsOn,
    maxRetries, retryDelay, isEdit, createMut, updateMut, goBack]);

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
            <Select value={agentId} onValueChange={setAgentId} disabled={isEdit} placeholder="Select agent">
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>)}
            </Select>
          </FormField>
          <FormField label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="daily-report" disabled={isEdit} />
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
          <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 9 * * *"
            className={cn("font-mono", schedule.trim() && !valid && "!border-danger/40")} />
          {schedule.trim() && !valid && <p className="text-xs text-danger">Invalid cron expression</p>}
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
          <TextArea className="min-h-[100px]" value={message}
            onChange={(e) => setMessage(e.target.value)} placeholder="Describe what this cron job should do..." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Options</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <FormField label="One-shot (delete after first run)" inline>
            <Checkbox checked={oneShot} onCheckedChange={(v) => setOneShot(Boolean(v))} />
          </FormField>
          <FormField label="Depends on (optional)">
            <Select value={dependsOn} onValueChange={setDependsOn} placeholder="None">
              <SelectItem value="">None</SelectItem>
              {allJobs.filter((j) => j.id !== editJobId).map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Max retries">
              <Input type="number" min="0" value={maxRetries}
                onChange={(e) => setMaxRetries(e.target.value)} placeholder="0" />
            </FormField>
            <FormField label="Retry delay (secs)">
              <Input type="number" min="0" value={retryDelay}
                onChange={(e) => setRetryDelay(e.target.value)} placeholder="60" />
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
