import { X, History, Check, Loader2 } from "lucide-react";
import { Badge, Separator } from "@/shared/ui/components/ui";
import { formatInTz } from "@/shared/lib/utils";
import type { CronRun } from "@/shared/api/client";

interface JobRunHistoryProps {
  runs: CronRun[];
  onClose: () => void;
}

export function JobRunHistory({ runs, onClose }: JobRunHistoryProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-emerald-400/60" />
          <span className="text-xs font-medium text-slate-300">Run History</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Separator className="!bg-white/[0.06]" />
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {runs.length === 0 ? (
          <p className="text-xs text-slate-500">No runs yet</p>
        ) : (
          runs.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between p-2 rounded-lg border border-white/[0.04] bg-white/[0.01]"
            >
              <div className="flex items-center gap-2">
                {run.status === "completed" ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : run.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                ) : (
                  <X className="h-3 w-3 text-rose-400" />
                )}
                <span className="text-xs text-slate-300">
                  {formatInTz(new Date((run.executed_at ?? Date.now()) * 1000), "MMM d, HH:mm")}
                </span>
              </div>
              <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "danger" : "neutral"}>
                {run.status}
              </Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
