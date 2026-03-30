import { useState } from "react";
import { Play, Pencil, History, Trash2, Clock, CalendarClock } from "lucide-react";
import { StatusPill } from "@/shared/ui/components/ui";
import { formatInTz, computeNextFires } from "@/shared/lib/utils";

interface CronJobView {
  id: string;
  agent_id: string;
  name: string;
  schedule: string;
  message?: string | null;
  kind?: string;
  last_status?: string | null;
}

interface CronRowProps {
  job: CronJobView;
  agentTz: string | null;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  running: boolean;
}

export function CronRow({
  job,
  agentTz,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  running,
}: CronRowProps) {
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

interface CronCardProps {
  job: CronJobView;
  agentTz: string | null;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  running: boolean;
}

export function CronCard({
  job,
  agentTz,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  running,
}: CronCardProps) {
  const [expanded, setExpanded] = useState(false);
  const nextFires = computeNextFires(job.schedule, 5, agentTz);
  const nextFire = nextFires[0] ?? null;

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
      {nextFire && (
        <div
          className="mt-1.5"
          onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
        >
          <p className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
            <Clock className="h-3 w-3 text-emerald-400/40" />
            Next: {formatInTz(nextFire, agentTz)}
          </p>
          {expanded && nextFires.length > 1 && (
            <ul className="mt-1 ml-4 space-y-0.5 border-l border-white/[0.06] pl-2">
              {nextFires.slice(1).map((d, i) => (
                <li key={i} className="text-[10px] text-slate-600">{formatInTz(d, agentTz)}</li>
              ))}
              {agentTz && <li className="text-[10px] text-slate-700 mt-1">{agentTz}</li>}
            </ul>
          )}
        </div>
      )}

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

interface CronJobTableProps {
  jobs: CronJobView[];
  agentTzMap: Record<string, string | null>;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  runningJobId: string | null;
}

export function CronJobTable({
  jobs,
  agentTzMap,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  runningJobId,
}: CronJobTableProps) {
  if (jobs.length === 0) return null;

  return (
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
              onDelete={onDelete}
              onEdit={onEdit}
              onShowRuns={onShowRuns}
              onRunNow={onRunNow}
              running={runningJobId === job.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CronJobCardsProps {
  jobs: CronJobView[];
  agentTzMap: Record<string, string | null>;
  onDelete: (jobId: string, jobName: string) => void;
  onEdit: (jobId: string) => void;
  onShowRuns: (jobId: string) => void;
  onRunNow: (job: CronJobView) => void;
  runningJobId: string | null;
}

export function CronJobCards({
  jobs,
  agentTzMap,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  runningJobId,
}: CronJobCardsProps) {
  return (
    <div className="space-y-2 md:hidden">
      {jobs.map((job) => (
        <CronCard
          key={job.id}
          job={job}
          agentTz={agentTzMap[job.agent_id] ?? null}
          onDelete={onDelete}
          onEdit={onEdit}
          onShowRuns={onShowRuns}
          onRunNow={onRunNow}
          running={runningJobId === job.id}
        />
      ))}
    </div>
  );
}
