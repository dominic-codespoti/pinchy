import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listAgents,
  createAgent,
  deleteAgent,
  cloneAgent,
  getConfig,
  queryKeys,
} from "@/shared/api/client";

export function useAgentsListRoute() {
  const queryClient = useQueryClient();

  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentModel, setNewAgentModel] = useState("copilot-default");
  const [newAgentHeartbeat, setNewAgentHeartbeat] = useState<number | null>(300);
  const [fallbackAgents, setFallbackAgents] = useState<
    Array<{
      id: string;
      model?: string;
      heartbeat_secs?: number;
      enabled_skills?: string[];
      cron_jobs_count?: number;
      cron_job_count?: number;
    }>
  >([]);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [cloneAgentId, setCloneAgentId] = useState<string | null>(null);
  const [cloneNewId, setCloneNewId] = useState("");

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents,
    queryFn: listAgents,
  });

  useEffect(() => {
    if (!agentsQuery.error) return;
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingFallback(true);
    getConfig()
      .then((cfg) => {
        if (!mounted) return;
        const raw = (cfg as { agents?: unknown[] }).agents ?? [];
        const parsed = Array.isArray(raw)
          ? raw
              .map((value) => {
                if (!value || typeof value !== "object" || Array.isArray(value)) return null;
                const agent = value as Record<string, unknown>;
                const id = typeof agent.id === "string" ? agent.id : "";
                if (!id) return null;
                return {
                  id,
                  model: typeof agent.model === "string" ? agent.model : undefined,
                  heartbeat_secs: typeof agent.heartbeat_secs === "number" ? agent.heartbeat_secs : undefined,
                  enabled_skills: Array.isArray(agent.enabled_skills)
                    ? agent.enabled_skills.filter((s): s is string => typeof s === "string")
                    : undefined,
                };
              })
              .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
          : [];
        setFallbackAgents(parsed);
      })
      .finally(() => {
        if (mounted) setLoadingFallback(false);
      });

    return () => {
      mounted = false;
    };
  }, [agentsQuery.error]);

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: (data) => {
      toast.success(`Agent created: ${data.id}`);
      setNewAgentId("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    },
    onError: (error) => {
      toast.error(`Create failed: ${error.message}`);
    },
  });

  const listDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteAgent(id),
    onSuccess: (_, id) => {
      toast.success(`Agent deleted: ${id}`);
      setConfirmDeleteId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  const cloneMutation = useMutation({
    mutationFn: ({ id, newId }: { id: string; newId: string }) => cloneAgent(id, newId),
    onSuccess: (data) => {
      toast.success(`Agent cloned: ${data.id}`);
      setCloneAgentId(null);
      setCloneNewId("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Clone failed: ${msg}`);
    },
  });

  const onCreate = () => {
    const id = newAgentId.trim();
    if (!id) {
      toast.error("Agent ID is required");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      toast.error("Agent ID must be alphanumeric, dash, or underscore");
      return;
    }

    createMutation.mutate({
      id,
      model: newAgentModel.trim() || undefined,
      heartbeat_secs: newAgentHeartbeat !== null && Number.isFinite(newAgentHeartbeat) ? newAgentHeartbeat : undefined,
    });
  };

  const onClone = () => {
    const id = cloneNewId.trim();
    if (!id || !cloneAgentId) {
      toast.error("New Agent ID is required");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      toast.error("Agent ID must be alphanumeric, dash, or underscore");
      return;
    }

    cloneMutation.mutate({ id: cloneAgentId, newId: id });
  };

  const visibleAgents = agentsQuery.data?.agents ?? fallbackAgents;

  return {
    ui: {
      confirmDeleteId,
      setConfirmDeleteId,
      cloneAgentId,
      setCloneAgentId,
      loadingFallback,
    },
    form: {
      newAgentId,
      setNewAgentId,
      newAgentModel,
      setNewAgentModel,
      newAgentHeartbeat,
      setNewAgentHeartbeat,
      cloneNewId,
      setCloneNewId,
      onCreate,
      onClone,
    },
    queries: {
      agentsQuery,
      visibleAgents,
      fallbackAgents,
    },
    mutations: {
      createMutation,
      listDeleteMutation,
      cloneMutation,
    }
  };
}
