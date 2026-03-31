import { Agent, AgentGroup } from "../types";

export function filterAgentsByGroup(
  agents: Agent[],
  groups: AgentGroup[],
  selectedGroupId: string | null
): Agent[] {
  if (!selectedGroupId || selectedGroupId === "all") return agents;

  if (selectedGroupId === "ungrouped") {
    const groupedIds = new Set(groups.flatMap((g) => g.agentIds));
    return agents.filter((a) => !groupedIds.has(a.id));
  }

  const group = groups.find((g) => g.id === selectedGroupId);
  return group ? agents.filter((a) => group.agentIds.includes(a.id)) : agents;
}
