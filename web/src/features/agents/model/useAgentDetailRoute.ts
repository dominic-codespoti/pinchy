import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  getAgent,
  updateAgent,
  deleteAgent,
  getHeartbeatStatusOne,
  listCronJobsByAgent,
  listSessions,
  getSkills,
  queryKeys,
} from "@/shared/api/client";

export type AgentDetailTab = "settings" | "skills" | "sessions" | "memory" | "SOUL.md" | "TOOLS.md" | "HEARTBEAT.md";

export function useAgentDetailRoute() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<AgentDetailTab>("settings");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const agentQuery = useQuery({
    queryKey: queryKeys.agent(agentId),
    queryFn: () => getAgent(agentId),
  });

  const heartbeatQuery = useQuery({
    queryKey: queryKeys.heartbeatAgent(agentId),
    queryFn: () => getHeartbeatStatusOne(agentId),
    refetchInterval: 30_000,
  });

  const cronJobsQuery = useQuery({
    queryKey: queryKeys.cronJobsByAgent(agentId),
    queryFn: () => listCronJobsByAgent(agentId),
  });

  const skillsQuery = useQuery({
    queryKey: queryKeys.skills,
    queryFn: getSkills,
  });

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions(agentId),
    queryFn: () => listSessions(agentId),
    enabled: tab === "sessions",
  });

  const [model, setModel] = useState("");
  const [heartbeatSecs, setHeartbeatSecs] = useState<number | null>(300);
  const [maxToolIterations, setMaxToolIterations] = useState(15);
  const [maxTurns, setMaxTurns] = useState(20);
  const [compactKeepRecentTurns, setCompactKeepRecentTurns] = useState(8);
  const [historyMessages, setHistoryMessages] = useState(40);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [allSkillsMode, setAllSkillsMode] = useState(true);
  const [formInitialized, setFormInitialized] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormInitialized(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab("settings");
  }, [agentId]);

  const agentSessions = useMemo(
    () =>
      (sessionsQuery.data?.sessions ?? [])
        .filter((session) => !session.file.endsWith(".receipts.jsonl"))
        .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0)),
    [sessionsQuery.data],
  );

  const updateMutation = useMutation({
    mutationFn: (payload: {
      model?: string;
      heartbeat_secs?: number | null;
      max_tool_iterations?: number;
      max_turns?: number;
      compact_keep_recent_turns?: number;
      history_messages?: number;
      reasoning_effort?: string;
      enabled_skills?: string[] | null;
    }) => updateAgent(agentId, payload),
    onSuccess: () => {
      toast.success("Agent updated");
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(agentId),
    onSuccess: () => {
      toast.success(`Agent deleted: ${agentId}`);
      setConfirmDelete(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      navigate({ to: "/agents" });
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  const data = agentQuery.data;
  const initialized = data !== undefined;

  useEffect(() => {
    if (!data || formInitialized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModel(data?.model ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeartbeatSecs(data?.heartbeat_secs ?? null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaxToolIterations(data?.max_tool_iterations ?? 15);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaxTurns(data?.max_turns ?? 20);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompactKeepRecentTurns(data?.compact_keep_recent_turns ?? 8);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryMessages(data?.history_messages ?? 40);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReasoningEffort(data?.reasoning_effort ?? "");
    const isAllSkills = data?.enabled_skills == null || data?.enabled_skills === undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllSkillsMode(isAllSkills);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledSkills(isAllSkills ? [] : data.enabled_skills!);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormInitialized(true);
  }, [data, formInitialized]);

  const onSaveSettings = () => {
    updateMutation.mutate({
      model: model.trim() || undefined,
      heartbeat_secs: heartbeatSecs,
      max_tool_iterations: maxToolIterations,
      max_turns: maxTurns,
      compact_keep_recent_turns: compactKeepRecentTurns,
      history_messages: historyMessages,
      reasoning_effort: reasoningEffort || undefined,
    });
  };

  const onSaveSkills = () => {
    updateMutation.mutate({
      enabled_skills: allSkillsMode ? null : (enabledSkills.length ? enabledSkills : null),
    });
  };

  const onDelete = () => {
    setConfirmDelete(true);
  };

  const hb = heartbeatQuery.data;

  return {
    agentId,
    ui: {
      tab,
      setTab,
      confirmDelete,
      setConfirmDelete,
    },
    form: {
      model,
      setModel,
      heartbeatSecs,
      setHeartbeatSecs,
      maxToolIterations,
      setMaxToolIterations,
      maxTurns,
      setMaxTurns,
      compactKeepRecentTurns,
      setCompactKeepRecentTurns,
      historyMessages,
      setHistoryMessages,
      reasoningEffort,
      setReasoningEffort,
      enabledSkills,
      setEnabledSkills,
      allSkillsMode,
      setAllSkillsMode,
      onSaveSettings,
      onSaveSkills,
      onDelete,
    },
    queries: {
      agentQuery,
      heartbeatQuery,
      cronJobsQuery,
      skillsQuery,
      sessionsQuery,
    },
    mutations: {
      updateMutation,
      deleteMutation,
    },
    computed: {
      agentSessions,
      data,
      initialized,
      hb,
    }
  };
}
