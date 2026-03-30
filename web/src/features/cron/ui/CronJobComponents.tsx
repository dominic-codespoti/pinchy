import { useRef, useState, useEffect } from "react";
import { Play, Pencil, History, Trash2, Clock, CalendarClock, MoreVertical } from "lucide-react";
import { StatusPill } from "@/shared/ui/components/ui";
import { formatInTz, computeNextFires } from "@/shared/lib/utils";
import { useViewport } from "@/shared/lib/useViewport";
import { useSwipe } from "@/shared/lib/useTouch";
import { cn } from "@/shared/lib/utils";

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
  onShowActions?: () => void;
  running: boolean;
  className?: string;
}

export function CronCard({
  job,
  agentTz,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  onShowActions,
  running,
  className,
}: CronCardProps) {
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

      {/* Touch-friendly action buttons - 44px min targets */}
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
interface SwipeableCronCardProps extends CronCardProps {}

export function SwipeableCronCard({
  job,
  agentTz,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  onShowActions,
  running,
}: SwipeableCronCardProps) {
  const { isMobile } = useViewport();
  const cardRef = useRef<HTMLElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

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
  onShowActions?: (job: CronJobView) => void;
  runningJobId: string | null;
  swipeable?: boolean;
}

export function CronJobCards({
  jobs,
  agentTzMap,
  onDelete,
  onEdit,
  onShowRuns,
  onRunNow,
  onShowActions,
  runningJobId,
  swipeable = true,
}: CronJobCardsProps) {
  const { isMobile } = useViewport();

  return (
    <div className="space-y-3 md:hidden">
      {jobs.map((job) => (
        swipeable && isMobile ? (
          <SwipeableCronCard
            key={job.id}
            job={job}
            agentTz={agentTzMap[job.agent_id] ?? null}
            onDelete={onDelete}
            onEdit={onEdit}
            onShowRuns={onShowRuns}
            onRunNow={onRunNow}
            onShowActions={() => onShowActions?.(job)}
            running={runningJobId === job.id}
          />
        ) : (
          <CronCard
            key={job.id}
            job={job}
            agentTz={agentTzMap[job.agent_id] ?? null}
            onDelete={onDelete}
            onEdit={onEdit}
            onShowRuns={onShowRuns}
            onRunNow={onRunNow}
            onShowActions={() => onShowActions?.(job)}
            running={runningJobId === job.id}
          />
        )
      ))}
    </div>
  );
}
