import { Puzzle, RefreshCw } from "lucide-react";
import { Button, Separator, Skeleton } from "@/shared/ui/components/ui";
import { useViewport } from "@/shared/lib/useViewport";

interface SkillsHeaderProps {
  skillCount: number;
  isFetching: boolean;
  isRefreshing?: boolean;
  onRefresh: () => void;
}

export function SkillsHeader({ skillCount, isFetching, isRefreshing, onRefresh }: SkillsHeaderProps) {
  const { isMobile } = useViewport();
  
  return (
    <div className="flex items-center gap-2 px-4 h-14 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10">
          <Puzzle className="h-4 w-4 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Skills</span>
      </div>
      {!isMobile && (
        <>
          <Separator className="!h-5 !w-px !bg-white/[0.08]" />
          <span className="text-xs text-slate-500">Agent capabilities</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className={`${isMobile ? '!h-10 !w-10' : '!h-8 !w-8'} !p-0 touch-manipulation`}
          onClick={onRefresh}
          disabled={isFetching || isRefreshing}
          aria-label="Refresh skills"
        >
          <RefreshCw className={`h-4 w-4 ${(isFetching || isRefreshing) ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-xs tabular-nums text-slate-500 hidden sm:inline">{skillCount} installed</span>
      </div>
    </div>
  );
}

export function SkillCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    </div>
  );
}

interface PullToRefreshIndicatorProps {
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

export function PullToRefreshIndicator({ isPulling, pullDistance, isRefreshing }: PullToRefreshIndicatorProps) {
  if (!isPulling && !isRefreshing) return null;
  
  const threshold = 80;
  const progress = Math.min(pullDistance / threshold, 1);
  const canRelease = pullDistance >= threshold;
  
  return (
    <div 
      className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center transition-all duration-200"
      style={{ 
        height: `${pullDistance}px`,
        opacity: isPulling ? 1 : 0,
      }}
    >
      <div className="flex flex-col items-center gap-1">
        <RefreshCw 
          className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${
            isRefreshing ? "animate-spin" : canRelease ? "rotate-180" : ""
          }`}
          style={{ 
            transform: isPulling && !isRefreshing ? `rotate(${progress * 360}deg)` : undefined 
          }}
        />
        <span className="text-[10px] text-slate-500">
          {isRefreshing ? "Refreshing..." : canRelease ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>
    </div>
  );
}
