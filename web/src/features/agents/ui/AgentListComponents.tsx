import { Bot } from "lucide-react";
import { Separator, Skeleton } from "@/shared/ui/components/ui";

interface AgentListHeaderProps {
  agentCount: number;
}

export function AgentListHeader({ agentCount }: AgentListHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <Bot className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Agents</span>
      </div>
      <Separator className="!h-5 !w-px !bg-white/[0.08]" />
      <span className="text-xs text-slate-500">Manage AI agents</span>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] tabular-nums text-slate-500">{agentCount} agents</span>
      </div>
    </div>
  );
}

export function AgentCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

export function EmptyAgentState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Bot className="h-8 w-8 text-slate-700 mb-3" />
      <p className="text-sm text-slate-400">No agents configured</p>
      <p className="text-xs text-slate-600 mt-1">Create an agent to start chatting and scheduling tasks.</p>
    </div>
  );
}
