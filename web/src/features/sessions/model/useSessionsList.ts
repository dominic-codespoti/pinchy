import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSessions, queryKeys, type SessionSummary } from "@/shared/api/client";

export function useSessionsList(selectedAgent: string) {
  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions(selectedAgent),
    queryFn: () => listSessions(selectedAgent),
    enabled: Boolean(selectedAgent),
  });

  const sessions = useMemo(
    () =>
      (sessionsQuery.data?.sessions ?? [])
        .filter((s: SessionSummary) => !s.file.endsWith(".receipts.jsonl"))
        .sort((a: SessionSummary, b: SessionSummary) => (b.modified ?? 0) - (a.modified ?? 0)),
    [sessionsQuery.data],
  );

  return { sessions, sessionsQuery } as const;
}
