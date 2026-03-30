import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { CRON_RE, computeNextFires } from "@/shared/lib/utils";
import {
  listAgents,
  listCronJobs,
  queryKeys,
  updateCronJob,
  deleteCronJob,
  triggerCronJob,
  getCronJobRuns,
  enhancePrompt
} from "@/shared/api/client";

export function useCronEditRoute() {
  const { jobId } = useParams({ strict: false }) as { jobId: string };
  const decodedJobId = decodeURIComponent(jobId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });
  const cronQuery = useQuery({ queryKey: queryKeys.cronJobs, queryFn: listCronJobs });

  const job = useMemo(
    () => cronQuery.data?.jobs.find((j) => j.id === decodedJobId) ?? null,
    [cronQuery.data, decodedJobId],
  );

  const [schedule, setSchedule] = useState("");
  const [message, setMessage] = useState("");
  const [oneShot, setOneShot] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!job) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSchedule(job.schedule);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(job.message ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOneShot((job.kind ?? "").toLowerCase() === "oneshot");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirty(false);
  }, [job]);

  const updateField = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [enhancedText, setEnhancedText] = useState("");
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [showRuns, setShowRuns] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const runsQuery = useQuery({
    queryKey: ["cron-runs", decodedJobId],
    queryFn: () => getCronJobRuns(decodedJobId),
    enabled: showRuns,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateCronJob(decodedJobId, {
        schedule: schedule.trim(),
        message: message.trim(),
        one_shot: oneShot,
      }),
    onSuccess: () => {
      toast.success("Cron job updated");
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
    },
    onError: (error) => toast.error(`Update failed: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCronJob(decodedJobId),
    onSuccess: () => {
      toast.success("Cron job deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
      navigate({ to: "/cron" });
    },
    onError: (error) => toast.error(`Delete failed: ${error.message}`),
  });

  const enhanceMutation = useMutation({
    mutationFn: () => enhancePrompt(message),
    onSuccess: (data) => {
      setEnhancedText(data.enhanced);
      setEnhanceOpen(true);
    },
    onError: (error) => toast.error(`AI enhance failed: ${error.message}`),
  });

  const onSave = () => {
    if (!schedule.trim()) { toast.error("Schedule is required"); return; }
    if (!CRON_RE.test(schedule.trim())) { toast.error("Invalid cron expression"); return; }
    if (!message.trim()) { toast.error("Message is required"); return; }
    updateMutation.mutate();
  };

  const runNow = () => {
    if (!job) return;
    setRunningJobId(job.id);
    triggerCronJob(job.id)
      .then(() => {
        toast.success(`Triggered ${job.name}`);
        void queryClient.invalidateQueries({ queryKey: ["cron-runs", decodedJobId] });
      })
      .catch(() => toast.error("Failed to trigger cron run"))
      .finally(() => setRunningJobId(null));
  };

  const agentTz = useMemo(() => {
    if (!job) return null;
    const agent = (agentsQuery.data?.agents ?? []).find((a) => a.id === job.agent_id);
    return agent?.timezone ?? null;
  }, [job, agentsQuery.data]);

  const schedulePreview = computeNextFires(schedule, 5, agentTz);

  return {
    job,
    form: {
      schedule, setSchedule,
      message, setMessage,
      oneShot, setOneShot,
      updateField,
      dirty
    },
    ui: {
      enhanceOpen, setEnhanceOpen,
      enhancedText, setEnhancedText,
      runningJobId, setRunningJobId,
      showRuns, setShowRuns,
      confirmDelete, setConfirmDelete
    },
    computed: {
      agentTz, schedulePreview
    },
    mutations: {
      updateMutation,
      deleteMutation,
      enhanceMutation,
      onSave, runNow
    },
    queries: {
      agentsQuery, cronQuery, runsQuery
    }
  };
}
