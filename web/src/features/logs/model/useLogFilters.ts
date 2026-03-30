import { useMemo, useState } from "react";
import type { LogEntry } from "./useLogStream";

export const LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"] as const;
const LEVEL_ORDER: Record<string, number> = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

export function useLogFilters(entries: LogEntry[]) {
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("INFO");
  const [textFilter, setTextFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");

  const filtered = useMemo(() => {
    const minLevel = LEVEL_ORDER[level] ?? 2;
    const text = textFilter.toLowerCase();
    const target = targetFilter.toLowerCase();

    return entries.filter((entry) => {
      const entryLevel = (entry.level ?? "INFO").toUpperCase();
      if ((LEVEL_ORDER[entryLevel] ?? 2) < minLevel) return false;

      const messageText = `${entry.message ?? ""} ${entry.target ?? ""}`.toLowerCase();
      if (text && !messageText.includes(text)) return false;
      if (target && !(entry.target ?? "").toLowerCase().includes(target)) return false;

      return true;
    });
  }, [entries, level, textFilter, targetFilter]);

  const levelCounts = useMemo(() => {
    const counts: Record<(typeof LEVELS)[number], number> = {
      TRACE: 0,
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };

    for (const entry of filtered) {
      const key = (entry.level ?? "INFO").toUpperCase() as (typeof LEVELS)[number];
      if (counts[key] !== undefined) counts[key] += 1;
    }

    return counts;
  }, [filtered]);

  return {
    level,
    setLevel,
    textFilter,
    setTextFilter,
    targetFilter,
    setTargetFilter,
    filtered,
    levelCounts,
  };
}