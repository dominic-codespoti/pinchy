import { Bot, Cpu, Heart, Sparkles, Clock, Copy, Trash2 } from "lucide-react";
import type { AgentListItem } from "@/shared/api/client";

interface AgentCardProps {
  agent: AgentListItem;
  onClick: () => void;
  onClone: () => void;
  onDelete: () => void;
}

export function AgentCard({ agent, onClick, onClone, onDelete }: AgentCardProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-emerald-400/20 hover:bg-white/[0.04]">
      <button type="button" className="w-full text-left" onClick={onClick}>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10">
            <Bot className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-slate-100">{agent.id}</p>
        </div>
        <div className="space-y-1 text-xs text-slate-500">
          <p className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3" /> {agent.model ?? "default"}
          </p>
          <p className="flex items-center gap-1.5">
            <Heart className="h-3 w-3" /> {agent.heartbeat_secs ? `${agent.heartbeat_secs}s` : "disabled"}
          </p>
          <p className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> {(agent.enabled_skills ?? []).length || "none"} skills
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> {agent.cron_jobs_count ?? agent.cron_job_count ?? "-"} cron jobs
          </p>
        </div>
      </button>
      <div className="mt-3 pt-2 border-t border-white/[0.06] flex justify-between items-center">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClone(); }}
          className="text-[10px] text-emerald-400/50 hover:text-emerald-300 transition-colors flex items-center gap-1"
        >
          <Copy className="h-2.5 w-2.5" /> Clone
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-[10px] text-rose-400/50 hover:text-rose-300 transition-colors flex items-center gap-1"
        >
          <Trash2 className="h-2.5 w-2.5" /> Delete
        </button>
      </div>
    </div>
  );
}
