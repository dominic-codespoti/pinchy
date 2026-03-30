import { Layers, Trash2, Clock } from "lucide-react";
import { Button, Separator, Select, SelectItem } from "@/shared/ui/components/ui";
import { humanBytes, estimateMessages, formatRelativeTime } from "@/shared/lib/utils";
import type { SessionSummary } from "@/shared/api/client";

interface SessionsHeaderProps {
  selectedAgent: string;
  setSelectedAgent: (value: string) => void;
  agentIds: string[];
  sessionCount: number;
  hasCronSessions: boolean;
  onDeleteCron: () => void;
  onDeleteAll: () => void;
  isDeleting: boolean;
}

export function SessionsHeader({
  selectedAgent,
  setSelectedAgent,
  agentIds,
  sessionCount,
  hasCronSessions,
  onDeleteCron,
  onDeleteAll,
  isDeleting,
}: SessionsHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <Layers className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Sessions</span>
      </div>
      <Separator className="!h-5 !w-px !bg-white/[0.08]" />
      <Select value={selectedAgent} onValueChange={setSelectedAgent}>
        {(agentIds.length ? agentIds : ["default"]).map((id) => (
          <SelectItem key={id} value={id}>{id}</SelectItem>
        ))}
      </Select>
      <div className="ml-auto flex items-center gap-2">
        {hasCronSessions && (
          <Button
            variant="ghost"
            size="sm"
            className="!h-7 gap-1 text-[10px] text-slate-400 hover:text-rose-300"
            disabled={isDeleting}
            onClick={onDeleteCron}
          >
            <Clock className="h-3 w-3" />
            <Trash2 className="h-3 w-3" />
            Cron
          </Button>
        )}
        {sessionCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="!h-7 gap-1 text-[10px] text-slate-400 hover:text-rose-300"
            disabled={isDeleting}
            onClick={onDeleteAll}
          >
            <Trash2 className="h-3 w-3" />
            All
          </Button>
        )}
        <span className="text-[10px] tabular-nums text-slate-500">{sessionCount} sessions</span>
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: SessionSummary;
  onClick: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, onClick, onDelete }: SessionCardProps) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-all duration-200 hover:border-emerald-400/20 hover:bg-white/[0.04]"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-200 truncate">{session.title ?? session.session_id}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-rose-400/50 hover:text-rose-300 p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{humanBytes(session.size ?? 0)}</span>
        <span>{estimateMessages(session.size ?? 0)} msgs</span>
        <span>{formatRelativeTime(session.modified ?? 0)}</span>
      </div>
    </button>
  );
}
