import { Puzzle, RefreshCw } from "lucide-react";
import { Button, Separator, Skeleton } from "@/shared/ui/components/ui";

interface SkillsHeaderProps {
  skillCount: number;
  isFetching: boolean;
  onRefresh: () => void;
}

export function SkillsHeader({ skillCount, isFetching, onRefresh }: SkillsHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <Puzzle className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Skills</span>
      </div>
      <Separator className="!h-5 !w-px !bg-white/[0.08]" />
      <span className="text-xs text-slate-500">Agent capabilities</span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !w-7 !p-0"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Refresh skills"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-[10px] tabular-nums text-slate-500">{skillCount} installed</span>
      </div>
    </div>
  );
}

export function SkillCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
