import { Plus } from "lucide-react";
import { Skeleton } from "@/shared/ui/components/ui";
import type { AgentListItem } from "@/shared/api/client";

interface AgentSelectProps {
  agents: AgentListItem[];
  selectedAgent: string;
  onSelect: (agentId: string) => void;
  isLoading: boolean;
}

export function AgentSelect({ agents, selectedAgent, onSelect, isLoading }: AgentSelectProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 mb-3">
        <Plus className="h-3.5 w-3.5 text-emerald-400/60" />
        <span className="text-xs font-medium text-slate-300">Select Agent</span>
      </div>
      <div className="space-y-1">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelect(agent.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
              selectedAgent === agent.id
                ? "bg-emerald-400/10 border border-emerald-400/30 text-emerald-300"
                : "hover:bg-white/[0.04] text-slate-400"
            }`}
          >
            {agent.id}
          </button>
        ))}
        {agents.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No agents available</p>
        )}
      </div>
    </div>
  );
}
