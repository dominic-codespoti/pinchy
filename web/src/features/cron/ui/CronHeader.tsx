import { CalendarClock } from "lucide-react";
import { Separator } from "@/shared/ui/components/ui";

interface CronHeaderProps {
  jobCount: number;
}

export function CronHeader({ jobCount }: CronHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <CalendarClock className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Cron Jobs</span>
      </div>
      <Separator className="!h-5 !w-px !bg-white/[0.08]" />
      <span className="text-xs text-slate-500">Scheduled automation</span>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] tabular-nums text-slate-500">{jobCount} jobs</span>
      </div>
    </div>
  );
}
