import { X, History } from "lucide-react";
import { StatusPill } from "@/shared/ui/components/ui";
import type { CronRun } from "@/shared/api/client";

interface RunHistoryProps {
  jobId: string;
  runs: CronRun[];
  isLoading: boolean;
  onClose: () => void;
}

export function RunHistory({ jobId, runs, isLoading, onClose }: RunHistoryProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-emerald-400/60" />
          <span className="text-xs font-medium text-slate-300">Run History · {jobId}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-600 hover:text-slate-300 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
          <span className="text-sm text-slate-500">Loading runs…</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {runs.slice(0, 20).map((run) => (
            <article key={`${run.id}`} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-2.5 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <StatusPill status={run.status} />
                <span className="text-[10px] tabular-nums text-slate-600">
                  {run.executed_at ? new Date(run.executed_at * 1000).toLocaleString() : "-"}
                </span>
              </div>
              <p className="text-slate-500">Duration: {run.duration_ms ?? "-"} ms</p>
              <p className="mt-1 truncate text-slate-300">{run.output_preview ?? run.error ?? "-"}</p>
            </article>
          ))}
          {!runs.length && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <History className="h-5 w-5 text-slate-700 mb-2" />
              <p className="text-xs text-slate-600">No run history yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
