import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAgents, queryKeys, type AgentListItem } from "@/shared/api/client";

export function useAgentsList(defaultAgent = "default") {
  const [selectedAgent, setSelectedAgent] = useState<string>(defaultAgent);

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });

  const agentIds = useMemo(() => (agentsQuery.data?.agents ?? []).map((a: AgentListItem) => a.id), [agentsQuery.data]);

  useEffect(() => {
    if (!agentIds.length) return;
    if (agentIds.includes(selectedAgent)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAgent(agentIds[0]);
  }, [agentIds, selectedAgent]);

  return { selectedAgent, setSelectedAgent, agentsQuery, agentIds } as const;
}
