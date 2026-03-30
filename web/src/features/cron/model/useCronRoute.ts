import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CRON_RE, computeNextFires } from "@/shared/lib/utils";
import { listAgents, listCronJobs, queryKeys, createCronJob, deleteCronJob, triggerCronJob, getCronJobRuns } from "@/shared/api/client";

export function useCronRoute() {
  const queryClient = useQueryClient();

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });
  const cronQuery = useQuery({ queryKey: queryKeys.cronJobs, queryFn: listCronJobs });

  const [agentId, setAgentId] = useState("default");
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 * * * *");
  const [message, setMessage] = useState("");
  const [oneShot, setOneShot] = useState(false);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const agentIds = useMemo(
    () => (agentsQuery.data?.agents ?? []).map((agent) => agent.id),
    [agentsQuery.data],
  );

  const agentTzMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const agent of agentsQuery.data?.agents ?? []) {
      map[agent.id] = agent.timezone ?? null;
    }
    return map;
  }, [agentsQuery.data]);

  const agentTz = useMemo(() => {
    const agent = (agentsQuery.data?.agents ?? []).find((a) => a.id === agentId);
    return agent?.timezone ?? null;
  }, [agentsQuery.data, agentId]);

  const runsQuery = useQuery({
    queryKey: ["cron-runs", selectedJobId],
    queryFn: () => getCronJobRuns(selectedJobId ?? ""),
    enabled: Boolean(selectedJobId),
  });

  const createMutation = useMutation({
    mutationFn: createCronJob,
    onSuccess: () => {
      toast.success("Cron job created");
      setName("");
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
    },
    onError: (error) => {
      toast.error(`Create failed: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCronJob,
    onSuccess: () => {
      toast.success("Cron job deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
      setSelectedJobId(null);
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  const onCreate = () => {
    if (!agentId) { toast.error("Agent is required"); return; }
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!schedule.trim()) { toast.error("Schedule is required"); return; }
    if (!CRON_RE.test(schedule.trim())) { toast.error("Cron schedule looks invalid"); return; }
    if (!message.trim()) { toast.error("Message is required"); return; }

    createMutation.mutate({
      agent_id: agentId,
      name: name.trim(),
      schedule: schedule.trim(),
      message: message.trim(),
      one_shot: oneShot,
    });
  };

  const jobs = cronQuery.data?.jobs ?? [];

  const runNow = (job: { id: string; name: string }) => {
    setRunningJobId(job.id);
    triggerCronJob(job.id)
      .then(() => {
        toast.success(`Triggered ${job.name}`);
        void queryClient.invalidateQueries({ queryKey: ["cron-runs", job.id] });
      })
      .catch(() => toast.error("Failed to trigger cron run"))
      .finally(() => setRunningJobId(null));
  };

  const schedulePreview = computeNextFires(schedule, 5, agentTz);

  return {
    form: { agentId, setAgentId, name, setName, schedule, setSchedule, message, setMessage, oneShot, setOneShot },
    ui: { selectedJobId, setSelectedJobId, runningJobId, confirmDelete, setConfirmDelete },
    computed: { agentIds, agentTz, agentTzMap, jobs, schedulePreview },
    mutations: { onCreate, runNow, deleteJob: () => { if (confirmDelete) deleteMutation.mutate(confirmDelete.id); } },
    queries: { agentsQuery, cronQuery, runsQuery },
    mutationsState: { createMutation, deleteMutation }
  };
}