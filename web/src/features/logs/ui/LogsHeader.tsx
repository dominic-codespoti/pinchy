import { Radio } from "lucide-react";
import { Badge, Input, Select, SelectItem, Separator } from "@/shared/ui/components/ui";

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
}: LogsHeaderProps) {
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
