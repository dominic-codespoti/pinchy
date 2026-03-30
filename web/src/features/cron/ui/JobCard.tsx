import { Play, Pencil, Trash2, CalendarClock } from "lucide-react";
import { Badge, Button } from "@/shared/ui/components/ui";
import type { CronJob } from "@/shared/api/client";

interface JobCardProps {
  job: CronJob;
  isSelected: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
}

export function JobCard({
  job,
  isSelected,
  isRunning,
  onSelect,
  onEdit,
  onDelete,
  onRun,
}: JobCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-200 ${
        isSelected
          ? "border-emerald-400/30 bg-emerald-400/5"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
      }`}
    >
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{job.name}</span>
            {job.last_status && (
              <Badge variant={job.last_status === "completed" ? "success" : job.last_status === "failed" ? "danger" : "neutral"}>
                {job.last_status}
              </Badge>
            )}
          </div>
        </div>
        <div className="space-y-1 text-xs text-slate-500">
          <p className="flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3" /> {job.schedule}
          </p>
          <p className="flex items-center gap-1.5">
            Agent: {job.agent_id}
          </p>
        </div>
      </button>
      <div className="mt-3 pt-2 border-t border-white/[0.06] flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 gap-1 text-[10px] text-emerald-400/70 hover:text-emerald-300"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        >
          <Pencil className="h-3 w-3" /> Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 gap-1 text-[10px] text-emerald-400/70 hover:text-emerald-300"
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          disabled={isRunning}
        >
          <Play className={`h-3 w-3 ${isRunning ? "animate-pulse" : ""}`} />
          {isRunning ? "Running..." : "Run now"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 gap-1 text-[10px] text-rose-400/50 hover:text-rose-300 ml-auto"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>
    </div>
  );
}
