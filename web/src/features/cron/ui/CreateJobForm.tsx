import { Plus } from "lucide-react";
import { Input, Checkbox, Select, SelectItem } from "@/shared/ui/components/ui";
import { CRON_RE, computeNextFires, formatInTz } from "@/shared/lib/utils";

interface CreateJobFormProps {
  agentId: string;
  setAgentId: (value: string) => void;
  agentIds: string[];
  agentTz: string | null;
  name: string;
  setName: (value: string) => void;
  schedule: string;
  setSchedule: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  oneShot: boolean;
  setOneShot: (value: boolean) => void;
  onCreate: () => void;
  isPending: boolean;
}

export function CreateJobForm({
  agentId,
  setAgentId,
  agentIds,
  agentTz,
  name,
  setName,
  schedule,
  setSchedule,
  message,
  setMessage,
  oneShot,
  setOneShot,
  onCreate,
  isPending,
}: CreateJobFormProps) {
  const schedulePreview = computeNextFires(schedule, 5, agentTz);

  return (
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
            {schedulePreview.map((s, i) => (
              <li key={i}>{formatInTz(s, agentTz)}</li>
            ))}
          </ul>
        )}
      </div>
      <Input
        placeholder="Message to send to the agent (supports /slash commands)"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <button
        type="button"
        onClick={onCreate}
        disabled={isPending}
        className="flex items-center justify-center gap-1.5 h-[42px] rounded-xl bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
      >
        <Plus className="h-3.5 w-3.5" />
        {isPending ? "Creating..." : "Create Job"}
      </button>
    </div>
  );
}
