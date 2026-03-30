import { Radio, Filter, Search } from "lucide-react";
import { Badge, Input, Select, SelectItem, Separator, Button } from "@/shared/ui/components/ui";
import { useViewport } from "@/shared/lib/useViewport";

const LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"] as const;

interface LogsHeaderProps {
  level: (typeof LEVELS)[number];
  setLevel: (value: (typeof LEVELS)[number]) => void;
  textFilter: string;
  setTextFilter: (value: string) => void;
  targetFilter: string;
  setTargetFilter: (value: string) => void;
  paused: boolean;
  entryCount: number;
  filteredCount: number;
  levelCounts: Record<(typeof LEVELS)[number], number>;
  inputRef: React.RefObject<HTMLInputElement>;
  onOpenFilters?: () => void;
}

export function LogsHeader({
  level,
  setLevel,
  textFilter,
  setTextFilter,
  targetFilter,
  setTargetFilter,
  paused,
  entryCount,
  filteredCount,
  levelCounts,
  inputRef,
  onOpenFilters,
}: LogsHeaderProps) {
  const { isMobile } = useViewport();
  const hasActiveFilters = textFilter || targetFilter;

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-400/10">
            <Radio className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Logs</span>
          <div className="ml-auto flex items-center gap-2">
            {paused && (
              <Badge variant="warning" className="!text-[9px] !px-1.5">
                Paused
              </Badge>
            )}
            <span className="text-[10px] tabular-nums text-slate-500">
              {filteredCount}
            </span>
          </div>
        </div>

        {/* Mobile search bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <Input
              ref={inputRef}
              placeholder="Search logs..."
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              className="!h-9 !pl-9 !text-xs"
            />
            {textFilter && (
              <button
                onClick={() => setTextFilter("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter button for mobile bottom sheet */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenFilters}
            className="shrink-0 h-9 px-3"
          >
            <Filter className="h-3.5 w-3.5" />
            {hasActiveFilters && (
              <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            )}
          </Button>

          {/* Level quick selector */}
          <Select
            value={level}
            onValueChange={(v) => setLevel(v as (typeof LEVELS)[number])}
            className="!h-9 w-[80px] !text-xs shrink-0"
          >
            {LEVELS.map((l) => (
              <SelectItem key={l} value={l} className="text-xs">
                {l}
              </SelectItem>
            ))}
          </Select>
        </div>

        {/* Level pills on mobile */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
          {LEVELS.map((l) => {
            const isActive = l === level;
            return (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? level === "ERROR"
                      ? "bg-rose-400/20 text-rose-200"
                      : level === "WARN"
                        ? "bg-amber-400/20 text-amber-200"
                        : level === "INFO"
                          ? "bg-emerald-400/20 text-emerald-200"
                          : level === "DEBUG"
                            ? "bg-blue-400/20 text-blue-200"
                            : "bg-slate-400/20 text-slate-200"
                    : "bg-white/[0.04] text-slate-500 hover:bg-white/[0.08]"
                }`}
              >
                {l} {levelCounts[l] > 0 && `(${levelCounts[l]})`}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop/tablet view
  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Logs</span>
        <Separator className="!h-5 !w-px !bg-white/[0.08]" />
        <span className="text-xs text-slate-500">Streaming runtime</span>
        <div className="ml-auto flex items-center gap-2">
          {paused && (
            <Badge variant="warning" className="!text-[10px]">
              Paused
            </Badge>
          )}
          <span className="text-[10px] tabular-nums text-slate-500">
            {filteredCount}/{entryCount}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={level} onValueChange={(v) => setLevel(v as (typeof LEVELS)[number])}>
          {LEVELS.map((l) => (
            <SelectItem key={l} value={l}>
              {l} ({levelCounts[l]})
            </SelectItem>
          ))}
        </Select>
        <Input
          ref={inputRef}
          placeholder="Filter messages (/)"
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          className="w-48"
        />
        <Input
          placeholder="Target filter"
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="w-32"
        />
      </div>
    </div>
  );
}

export { LEVELS };
