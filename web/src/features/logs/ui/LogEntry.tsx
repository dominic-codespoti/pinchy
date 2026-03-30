interface LogEntryProps {
  ts?: string;
  level?: string;
  target?: string;
  message?: string;
}

const LEVEL_COLORS: Record<string, string> = {
  TRACE: "text-slate-500",
  DEBUG: "text-blue-400",
  INFO: "text-emerald-400",
  WARN: "text-amber-400",
  ERROR: "text-rose-400",
};

export function LogEntry({ ts, level, target, message }: LogEntryProps) {
  const levelClass = LEVEL_COLORS[level?.toUpperCase() ?? "INFO"] ?? LEVEL_COLORS.INFO;
  
  return (
    <li className="font-mono text-xs leading-relaxed py-0.5 px-2 hover:bg-white/[0.02]">
      <span className="text-slate-600">{ts}</span>{" "}
      <span className={levelClass}>{level?.toUpperCase().padEnd(5)}</span>{" "}
      <span className="text-slate-500">{target}</span>{" "}
      <span className="text-slate-300">{message}</span>
    </li>
  );
}
