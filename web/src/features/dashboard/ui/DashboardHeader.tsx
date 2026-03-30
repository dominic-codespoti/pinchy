import { LayoutDashboard, Activity } from "lucide-react";
import { Badge, Separator } from "@/shared/ui/components/ui";

interface DashboardHeaderProps {
  agentCount: number;
  cronCount: number;
  healthyCount: number;
  eventCount: number;
}

export function DashboardHeader({
  agentCount,
  cronCount,
  healthyCount,
  eventCount,
}: DashboardHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <LayoutDashboard className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Dashboard</span>
      </div>
      <Separator className="!h-5 !w-px !bg-white/[0.08]" />
      <span className="text-xs text-slate-500">System overview</span>
      <div className="ml-auto flex items-center gap-3">
        <Badge variant="neutral" className="gap-1 !text-[10px]">
          <Activity className="h-3 w-3" />
          {agentCount} agents
        </Badge>
        <Badge variant="neutral" className="gap-1 !text-[10px]">
          <Activity className="h-3 w-3" />
          {cronCount} cron
        </Badge>
        <Badge variant="success" className="gap-1 !text-[10px]">
          <Activity className="h-3 w-3" />
          {healthyCount} healthy
        </Badge>
        <span className="text-[10px] tabular-nums text-slate-500">{eventCount} events</span>
      </div>
    </div>
  );
}
