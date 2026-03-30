interface LogEntryProps {
  ts?: string;
  level?: string;
  target?: string;
  message?: string;
  isMobile?: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  TRACE: "text-slate-500",
  DEBUG: "text-blue-400",
  INFO: "text-emerald-400",
  WARN: "text-amber-400",
  ERROR: "text-rose-400",
};

const LEVEL_BG: Record<string, string> = {
  TRACE: "bg-slate-500/10",
  DEBUG: "bg-blue-500/10",
  INFO: "bg-emerald-500/10",
  WARN: "bg-amber-500/10",
  ERROR: "bg-rose-500/10",
};

export function LogEntry({ ts, level, target, message, isMobile = false }: LogEntryProps) {
  const levelClass = LEVEL_COLORS[level?.toUpperCase() ?? "INFO"] ?? LEVEL_COLORS.INFO;
  const levelBg = LEVEL_BG[level?.toUpperCase() ?? "INFO"] ?? LEVEL_BG.INFO;
  const shortLevel = (level?.toUpperCase() ?? "INFO").slice(0, 4);

  if (isMobile) {
    // Compact mobile view
    return (
      <li className="flex items-start gap-2 py-1.5 px-2 hover:bg-white/[0.02] border-b border-white/[0.04] last:border-0">
        <span className={`shrink-0 inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-semibold ${levelBg} ${levelClass}`}>
          {shortLevel}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-0.5">
            <span className="tabular-nums shrink-0">{(ts ?? "").slice(11, 19)}</span>
            {target && <span className="truncate">{target}</span>}
          </div>
          <p className="text-xs text-slate-300 leading-snug break-words">{message}</p>
        </div>
      </li>
    );
  }

  // Desktop view
  return (
    <li className="font-mono text-xs leading-relaxed py-0.5 px-2 hover:bg-white/[0.02]">
      <span className="text-slate-600">{ts}</span>{" "}
      <span className={levelClass}>{level?.toUpperCase().padEnd(5)}</span>{" "}
      <span className="text-slate-500">{target}</span>{" "}
      <span className="text-slate-300">{message}</span>
    </li>
  );
}
