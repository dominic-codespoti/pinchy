import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bot,
  Plus,
  ChevronLeft,
  Trash2,
  Save,
  Heart,
  Cpu,
  Sparkles,
  Clock,
  Settings,
  FileText,
  Layers,
  Activity,
  Brain,
  Search,
  X,
  Eye,
  Copy,
} from "lucide-react";

import {
  cloneAgent,
  createAgent,
  deleteAgent,
  deleteMemory,
  getConfig,
  getAgent,
  getAgentFile,
  getHeartbeatStatusOne,
  getSkills,
  listAgents,
  listCronJobsByAgent,
  listMemory,
  listSessions,
  queryKeys,
  saveAgentFile,
  updateAgent,
} from "@/api/client";
import { Button, Checkbox, Dialog, DialogContent, Input, Separator, Skeleton, TextArea } from "@/components/ui";
import { humanBytes } from "@/lib/utils";

const fileTabs = ["SOUL.md", "TOOLS.md", "HEARTBEAT.md"] as const;

type AgentTab = "settings" | "skills" | (typeof fileTabs)[number];
type AgentDetailTab = AgentTab | "sessions" | "memory";

export function AgentsListRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentModel, setNewAgentModel] = useState("copilot-default");
  const [newAgentHeartbeat, setNewAgentHeartbeat] = useState(300);
  const [fallbackAgents, setFallbackAgents] = useState<
    Array<{ id: string; model?: string; heartbeat_secs?: number; enabled_skills?: string[]; cron_jobs_count?: number; cron_job_count?: number }>
  >([]);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [cloneAgentId, setCloneAgentId] = useState<string | null>(null);
  const [cloneNewId, setCloneNewId] = useState("");

  const agentsQuery = useQuery({ queryKey: queryKeys.agents, queryFn: listAgents });

  useEffect(() => {
    if (!agentsQuery.error) return;
    let mounted = true;
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
    onError: (error: any) => {
      toast.error(`Clone failed: ${error.message}`);
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
      heartbeat_secs: Number.isFinite(newAgentHeartbeat) ? newAgentHeartbeat : undefined,
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

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Bot className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Agents</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <span className="text-xs text-slate-500">Manage AI agents</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-500">
            {visibleAgents.length} agents
          </span>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

          {/* ── Create agent ────────────────────────── */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-3.5 w-3.5 text-emerald-400/60" />
              <span className="text-xs font-medium text-slate-300">Create Agent</span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <Input
                placeholder="agent-id"
                value={newAgentId}
                onChange={(event) => setNewAgentId(event.target.value)}
              />
              <Input
                placeholder="model"
                value={newAgentModel}
                onChange={(event) => setNewAgentModel(event.target.value)}
              />
              <Input
                type="number"
                placeholder="heartbeat"
                value={newAgentHeartbeat}
                onChange={(event) => setNewAgentHeartbeat(parseInt(event.target.value, 10) || 0)}
              />
              <button
                type="button"
                onClick={onCreate}
                disabled={createMutation.isPending}
                className="flex items-center justify-center gap-1.5 h-[42px] rounded-xl bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
              >
                <Plus className="h-3.5 w-3.5" />
                {createMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>

          {/* ── Agent cards ─────────────────────────── */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {visibleAgents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-emerald-400/20 hover:bg-white/[0.04]"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    navigate({
                      to: "/agents/$agentId",
                      params: { agentId: agent.id },
                    })
                  }
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10">
                      <Bot className="h-4 w-4 text-emerald-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-100">{agent.id}</p>
                  </div>
                  <div className="space-y-1 text-xs text-slate-500">
                    <p className="flex items-center gap-1.5"><Cpu className="h-3 w-3" /> {agent.model ?? "default"}</p>
                    <p className="flex items-center gap-1.5"><Heart className="h-3 w-3" /> {agent.heartbeat_secs ? `${agent.heartbeat_secs}s` : "disabled"}</p>
                    <p className="flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> {(agent.enabled_skills ?? []).length || "none"} skills</p>
                    <p className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {agent.cron_jobs_count ?? agent.cron_job_count ?? "-"} cron jobs</p>
                  </div>
                </button>
                <div className="mt-3 pt-2 border-t border-white/[0.06] flex justify-between items-center">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCloneAgentId(agent.id); setCloneNewId(`${agent.id}-clone`); }}
                    className="text-[10px] text-emerald-400/50 hover:text-emerald-300 transition-colors flex items-center gap-1"
                  >
                    <Copy className="h-2.5 w-2.5" /> Clone
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(agent.id); }}
                    className="text-[10px] text-rose-400/50 hover:text-rose-300 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="h-2.5 w-2.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {agentsQuery.isLoading || loadingFallback ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-40" /></div>)}
            </div>
          ) : null}
          {agentsQuery.error && !fallbackAgents.length ? (
            <p className="text-sm text-rose-300">Failed to load agents.</p>
          ) : null}
          {agentsQuery.error && fallbackAgents.length ? (
            <p className="text-xs text-slate-500">Using agents from config fallback.</p>
          ) : null}
          {!visibleAgents.length && !agentsQuery.isLoading && !loadingFallback ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bot className="h-8 w-8 text-slate-700 mb-3" />
              <p className="text-sm text-slate-400">No agents configured</p>
              <p className="text-xs text-slate-600 mt-1">Create an agent to start chatting and scheduling tasks.</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Delete Confirmation Dialog ──────────── */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
                <Trash2 className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Delete Agent</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Are you sure you want to delete <span className="font-mono text-rose-300">{confirmDeleteId}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="!bg-rose-500 hover:!bg-rose-400"
                disabled={listDeleteMutation.isPending}
                onClick={() => { if (confirmDeleteId) listDeleteMutation.mutate(confirmDeleteId); }}
              >
                {listDeleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Clone Agent Dialog ──────────────────── */}
      <Dialog open={!!cloneAgentId} onOpenChange={(open) => { if (!open) setCloneAgentId(null); }}>
        <DialogContent>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10">
                <Copy className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Clone Agent</p>
                <p className="text-xs text-slate-500">Creates a copy of the agent definition and config.</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">New Agent ID</label>
              <Input
                placeholder="new-agent-id"
                value={cloneNewId}
                onChange={(e) => setCloneNewId(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCloneAgentId(null)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="!bg-emerald-500 hover:!bg-emerald-400"
                disabled={cloneMutation.isPending}
                onClick={onClone}
              >
                {cloneMutation.isPending ? "Cloning..." : "Clone Agent"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AgentDetailRoute() {
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
  const [heartbeatSecs, setHeartbeatSecs] = useState(300);
  const [maxToolIterations, setMaxToolIterations] = useState(15);
  const [maxTurns, setMaxTurns] = useState(20);
  const [compactKeepRecentTurns, setCompactKeepRecentTurns] = useState(8);
  const [historyMessages, setHistoryMessages] = useState(40);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [allSkillsMode, setAllSkillsMode] = useState(true);
  const [formInitialized, setFormInitialized] = useState(false);

  useEffect(() => {
    setFormInitialized(false);
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
      heartbeat_secs?: number;
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
    setModel(data.model ?? "");
    setHeartbeatSecs(data.heartbeat_secs ?? 300);
    setMaxToolIterations(data.max_tool_iterations ?? 15);
    setMaxTurns(data.max_turns ?? 20);
    setCompactKeepRecentTurns(data.compact_keep_recent_turns ?? 8);
    setHistoryMessages(data.history_messages ?? 40);
    setReasoningEffort(data.reasoning_effort ?? "");
    const isAllSkills = data.enabled_skills == null || data.enabled_skills === undefined;
    setAllSkillsMode(isAllSkills);
    setEnabledSkills(isAllSkills ? [] : data.enabled_skills!);
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

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Bot className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">{agentId}</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        {/* ── Tab buttons ──────────────────────────── */}
        <div className="flex items-center gap-0.5">
          {([
            ["settings", "Settings", Settings],
            ["skills", "Skills", Sparkles],
            ["sessions", "Sessions", Layers],
            ["memory", "Memory", Brain],
            ...fileTabs.map((f) => [f, f, FileText] as const),
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value as AgentDetailTab)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                tab === value
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {hb && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className={`inline-block h-2 w-2 rounded-full ${
                hb.health === "ok" ? "bg-emerald-400 animate-status-pulse" :
                hb.health === "stale" ? "bg-amber-400" : "bg-slate-600"
              }`} />
              <span className={
                hb.health === "ok" ? "text-emerald-300" :
                hb.health === "stale" ? "text-amber-300" : "text-slate-500"
              }>
                {hb.health ?? "unknown"}
              </span>
              {hb.last_tick && (
                <span className="text-slate-600">
                  · {Math.round((Date.now() / 1000 - hb.last_tick) / 60)}m ago
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-1 text-[10px] text-rose-400/60 hover:text-rose-300 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-5">

          {/* ── Heartbeat + Cron summary card ────── */}
          {initialized && tab === "settings" && (
            <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {hb && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-3.5 w-3.5 text-emerald-400/60" />
                    <span className="text-xs font-medium text-slate-300">Heartbeat</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                    <span className="text-slate-600">Status</span>
                    <span className={
                      hb.health === "ok" ? "text-emerald-300" :
                      hb.health === "stale" ? "text-amber-300" : "text-slate-400"
                    }>{hb.health ?? "—"}</span>
                    <span className="text-slate-600">Interval</span>
                    <span className="text-slate-300">{hb.interval_secs ? `${hb.interval_secs}s` : "—"}</span>
                    <span className="text-slate-600">Last tick</span>
                    <span className="text-slate-300">{hb.last_tick ? new Date(hb.last_tick * 1000).toLocaleTimeString() : "—"}</span>
                    <span className="text-slate-600">Next tick</span>
                    <span className="text-slate-300">{hb.next_tick ? new Date(hb.next_tick * 1000).toLocaleTimeString() : "—"}</span>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-3.5 w-3.5 text-emerald-400/60" />
                  <span className="text-xs font-medium text-slate-300">Cron Jobs</span>
                </div>
                {cronJobsQuery.isLoading && <Skeleton className="h-4 w-20" />}
                {cronJobsQuery.data && (
                  <div className="space-y-1">
                    {cronJobsQuery.data.jobs.length === 0 && (
                      <p className="text-[11px] text-slate-600">No cron jobs configured</p>
                    )}
                    {cronJobsQuery.data.jobs.map((job) => (
                      <div key={job.id} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 truncate max-w-[120px]">{job.name}</span>
                        <span className="text-slate-600 font-mono">{job.schedule}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Watch Paths (File Watcher) ──────── */}
            {(() => {
              const wp = (data as Record<string, unknown> | undefined)?.watch_paths;
              const watchPaths = Array.isArray(wp) ? wp.filter((p): p is string => typeof p === "string") : [];
              if (!watchPaths.length) return null;
              return (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-3.5 w-3.5 text-emerald-400/60" />
                    <span className="text-xs font-medium text-slate-300">File Watcher</span>
                    <span className="text-[10px] text-slate-600 ml-auto">{watchPaths.length} path{watchPaths.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-1">
                    {watchPaths.map((p) => (
                      <div key={p} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-emerald-300/70">{p}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">Changes auto-ingested to memory with tag <span className="font-mono text-slate-500">file-watch</span>.</p>
                </div>
              );
            })()}


            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Model</label>
                  <Input value={model} onChange={(event) => setModel(event.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Heartbeat (seconds)</label>
                  <Input type="number" value={heartbeatSecs} onChange={(event) => setHeartbeatSecs(parseInt(event.target.value, 10) || 0)} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Max Tool Iterations</label>
                  <Input type="number" value={maxToolIterations} onChange={(event) => setMaxToolIterations(parseInt(event.target.value, 10) || 0)} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Max Turns Before Compaction</label>
                  <Input type="number" value={maxTurns} onChange={(event) => setMaxTurns(parseInt(event.target.value, 10) || 0)} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Recent Turns to Keep After Compaction</label>
                  <Input type="number" value={compactKeepRecentTurns} onChange={(event) => setCompactKeepRecentTurns(parseInt(event.target.value, 10) || 0)} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">History Messages</label>
                  <Input type="number" value={historyMessages} onChange={(event) => setHistoryMessages(parseInt(event.target.value, 10) || 0)} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Reasoning Effort</label>
                  <select
                    value={reasoningEffort}
                    onChange={(e) => setReasoningEffort(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-sm text-slate-200 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/50"
                  >
                    <option value="">Default (none)</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={onSaveSettings}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
                >
                  <Save className="h-3 w-3" />
                  {updateMutation.isPending ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          )}

          {initialized && tab === "skills" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400/60" />
                    <span className="text-xs font-medium text-slate-300">Enabled Skills</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={allSkillsMode}
                      onCheckedChange={(next) => {
                        setAllSkillsMode(Boolean(next));
                        if (Boolean(next)) setEnabledSkills([]);
                      }}
                    />
                    <span className="text-xs text-slate-400">All skills enabled</span>
                  </label>
                </div>
                {allSkillsMode ? (
                  <p className="text-xs text-slate-500">All available skills are enabled for this agent. Uncheck "All skills enabled" to select specific skills.</p>
                ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {(skillsQuery.data?.skills ?? []).map((skill) => {
                    const checked = enabledSkills.includes(skill.id);
                    return (
                      <label
                        key={skill.id}
                        className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 cursor-pointer hover:border-white/[0.12] transition-all duration-200"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            const checkedNext = Boolean(next);
                            setEnabledSkills((prev) => {
                              if (checkedNext) {
                                return prev.includes(skill.id) ? prev : [...prev, skill.id];
                              }
                              return prev.filter((id) => id !== skill.id);
                            });
                          }}
                        />
                        <span>
                          <span className="block text-sm font-medium text-slate-200">{skill.id}</span>
                          <span className="text-xs text-slate-500">{skill.description ?? "No description"}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                )}
                <button
                  type="button"
                  onClick={onSaveSkills}
                  disabled={updateMutation.isPending}
                  className="mt-4 flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
                >
                  <Save className="h-3 w-3" />
                  {updateMutation.isPending ? "Saving..." : "Save Skills"}
                </button>
              </div>
            </div>
          )}

          {initialized && tab === "sessions" && (
            <div className="space-y-2">
              {agentSessions.map((session) => (
                <article
                  key={session.file}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:border-white/[0.12] transition-all duration-200"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{session.session_id}</p>
                    <p className="text-xs text-slate-500">
                      {session.modified
                        ? new Date(session.modified * 1000).toLocaleString()
                        : "Unknown time"}{" "}
                      · {humanBytes(session.size ?? 0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/sessions/$agentId/$sessionFile",
                        params: { agentId, sessionFile: session.file },
                      })
                    }
                    className="shrink-0 text-[10px] text-emerald-400/60 hover:text-emerald-300 transition-colors"
                  >
                    Open →
                  </button>
                </article>
              ))}
              {sessionsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
                  <span className="text-sm text-slate-500">Loading sessions…</span>
                </div>
              ) : null}
              {sessionsQuery.error ? <p className="text-sm text-rose-300">Failed to load sessions.</p> : null}
              {!agentSessions.length && !sessionsQuery.isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Layers className="h-5 w-5 text-slate-700 mb-2" />
                  <p className="text-xs text-slate-600">No sessions for this agent</p>
                  <p className="text-[10px] text-slate-700 mt-0.5">Send a chat message or run cron to create one.</p>
                </div>
              )}
            </div>
          )}

          {initialized && tab === "memory" && (
            <AgentMemoryPanel agentId={agentId} />
          )}

          {agentQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
              <span className="text-sm text-slate-500">Loading agent…</span>
            </div>
          ) : null}
          {agentQuery.error ? <p className="text-sm text-rose-300">Failed to load agent.</p> : null}

          {initialized && fileTabs.includes(tab as (typeof fileTabs)[number]) && (
            <AgentFileEditor agentId={agentId} filename={tab as (typeof fileTabs)[number]} />
          )}
        </div>
      </div>

      {/* ── Delete Confirmation Dialog ──────────── */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
                <Trash2 className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Delete Agent</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Are you sure you want to delete <span className="font-mono text-rose-300">{agentId}</span>?
              All agent files, sessions, and configuration will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="!bg-rose-500 hover:!bg-rose-400"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Agent"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentFileEditor({
  agentId,
  filename,
}: {
  agentId: string;
  filename: (typeof fileTabs)[number];
}) {
  const queryClient = useQueryClient();

  const fileQuery = useQuery({
    queryKey: queryKeys.agentFile(agentId, filename),
    queryFn: () => getAgentFile(agentId, filename),
  });

  const [content, setContent] = useState("");

  useEffect(() => {
    setContent(fileQuery.data?.content ?? "");
  }, [fileQuery.data?.content, agentId, filename]);

  const saveMutation = useMutation({
    mutationFn: (nextContent: string) => saveAgentFile(agentId, filename, nextContent),
    onSuccess: () => {
      toast.success(`Saved ${filename}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentFile(agentId, filename) });
    },
    onError: (error) => {
      toast.error(`Save failed: ${error.message}`);
    },
  });

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-emerald-400/60" />
        <span className="text-xs font-medium text-slate-300">{filename}</span>
      </div>
      <TextArea
        className="min-h-[360px] font-mono text-xs"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => saveMutation.mutate(content)}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
        >
          <Save className="h-3 w-3" />
          {saveMutation.isPending ? "Saving..." : `Save ${filename}`}
        </button>
      </div>
      {fileQuery.isLoading ? <p className="text-sm text-slate-500">Loading file...</p> : null}
      {fileQuery.error ? <p className="text-sm text-rose-300">Unable to load file.</p> : null}
    </div>
  );
}

function AgentMemoryPanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic" | "hybrid">("keyword");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const memoryQuery = useQuery({
    queryKey: [...queryKeys.memory(agentId), debouncedSearch, searchMode],
    queryFn: () => listMemory(agentId, { q: debouncedSearch || undefined, limit: 200, mode: searchMode !== "keyword" ? searchMode : undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteMemory(agentId, key),
    onSuccess: () => {
      toast.success("Memory entry deleted");
      setDeleteKey(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.memory(agentId) });
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const entries = memoryQuery.data?.entries ?? [];

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search memories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-white/[0.06] bg-white/[0.02] pl-9 pr-8 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-400/30 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          {(["keyword", "semantic", "hybrid"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSearchMode(mode)}
              className={`px-2.5 py-2 text-[10px] font-medium capitalize transition-colors ${
                searchMode === mode
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      {!memoryQuery.isLoading && (
        <p className="text-[10px] text-slate-600">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
          {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
        </p>
      )}

      {/* Loading */}
      {memoryQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
          <span className="text-sm text-slate-500">Loading memories…</span>
        </div>
      )}

      {/* Error */}
      {memoryQuery.error && (
        <p className="text-sm text-rose-300">Failed to load memories.</p>
      )}

      {/* Entries */}
      {entries.map((entry) => (
        <div
          key={entry.key}
          className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:border-white/[0.12] transition-colors duration-200"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate font-mono">{entry.key}</p>
              <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap break-words line-clamp-4">{entry.value}</p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteKey(entry.key)}
              className="shrink-0 rounded-md p-1 opacity-0 group-hover:opacity-100 text-rose-400/60 hover:text-rose-300 hover:bg-rose-400/10 transition-opacity"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300/80"
              >
                {tag}
              </span>
            ))}
            <span className="text-[10px] text-slate-600 ml-auto">
              {new Date(entry.timestamp).toLocaleString()}
            </span>
            {entry.score != null && (
              <span className="text-[10px] text-slate-600" title="Relevance score">
                score {entry.score.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      ))}

      {/* Empty */}
      {!memoryQuery.isLoading && !memoryQuery.error && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Brain className="h-5 w-5 text-slate-700 mb-2" />
          <p className="text-xs text-slate-600">
            {debouncedSearch ? "No memories match your search" : "No memories stored yet"}
          </p>
          <p className="text-[10px] text-slate-700 mt-0.5">
            Memories are created automatically when the agent uses the remember tool.
          </p>
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteKey !== null} onOpenChange={(open) => { if (!open) setDeleteKey(null); }}>
        <DialogContent>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
                <Trash2 className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Delete Memory</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Delete memory <span className="font-mono text-rose-300">{deleteKey}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleteKey(null)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                className="!bg-rose-500 hover:!bg-rose-400"
                disabled={deleteMutation.isPending}
                onClick={() => deleteKey && deleteMutation.mutate(deleteKey)}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
