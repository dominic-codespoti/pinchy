import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bot,
  Plus,
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
  ChevronLeft,
  Menu,
} from "lucide-react";

import {
  deleteMemory,
  getAgentFile,
  listMemory,
  queryKeys,
  saveAgentFile,
} from "@/shared/api/client";
import { useAgentsListRoute, useAgentDetailRoute } from "../model";
import { Button, Checkbox, Dialog, DialogContent, Input, Separator, Skeleton, TextArea } from "@/shared/ui/components/ui";
import { BottomSheet, ActionSheet } from "@/shared/ui/components/BottomSheet";
import { humanBytes, minutesAgo } from "@/shared/lib/utils";
import { useViewport } from "@/shared/lib/useViewport";
import { usePullToRefresh } from "@/shared/lib/useTouch";

const fileTabs = ["SOUL.md", "TOOLS.md", "HEARTBEAT.md"] as const;

type AgentTab = "settings" | "skills" | (typeof fileTabs)[number];
type AgentDetailTab = AgentTab | "sessions" | "memory";

// Haptic feedback helper
function triggerHaptic(type: "light" | "medium" | "heavy" = "light") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30, 50, 30],
    };
    navigator.vibrate(patterns[type]);
  }
}

export function AgentsListRoute() {
  const navigate = useNavigate();
  const { form, ui, queries, mutations } = useAgentsListRoute();
  const { isMobile } = useViewport();
  const contentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Pull-to-refresh for mobile
  const { pullDistance, isRefreshing } = usePullToRefresh(
    contentRef,
    async () => {
      triggerHaptic("light");
      await queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    }
  );

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

        <Separator className="!h-5 !w-px !bg-white/[0.08] hidden sm:block" />

        <span className="text-xs text-slate-500 hidden sm:inline">Manage AI agents</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-500">
            {queries.visibleAgents.length} agents
          </span>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto relative touch-pan-y"
      >
        {/* Pull-to-refresh indicator */}
        {isMobile && (
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-center transition-transform duration-200 pointer-events-none z-10"
            style={{ transform: `translateY(${Math.min(pullDistance - 60, 0)}px)` }}
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 backdrop-blur-sm rounded-full border border-white/[0.06]">
              {isRefreshing ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
              ) : (
                <div
                  className="h-4 w-4 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 transition-transform"
                  style={{ transform: `rotate(${Math.min(pullDistance * 2, 360)}deg)` }}
                />
              )}
              <span className="text-xs text-slate-400">
                {isRefreshing ? "Refreshing..." : pullDistance > 80 ? "Release to refresh" : "Pull to refresh"}
              </span>
            </div>
          </div>
        )}

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
                value={form.newAgentId}
                onChange={(event) => form.setNewAgentId(event.target.value)}
                className="min-h-[44px]"
              />
              <Input
                placeholder="model"
                value={form.newAgentModel}
                onChange={(event) => form.setNewAgentModel(event.target.value)}
                className="min-h-[44px]"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2 min-h-[44px]">
                  <Checkbox
                    checked={form.newAgentHeartbeat !== null}
                    onCheckedChange={(next) => {
                      if (next) {
                        form.setNewAgentHeartbeat(300);
                      } else {
                        form.setNewAgentHeartbeat(null);
                      }
                    }}
                  />
                  <label className="text-[10px] uppercase tracking-widest text-slate-500">Heartbeat</label>
                </div>
                {form.newAgentHeartbeat !== null && (
                  <Input
                    type="number"
                    placeholder="heartbeat"
                    value={form.newAgentHeartbeat}
                    onChange={(event) => form.setNewAgentHeartbeat(parseInt(event.target.value, 10) || 0)}
                    className="min-h-[44px]"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium");
                  form.onCreate();
                }}
                disabled={mutations.createMutation.isPending}
                className="flex items-center justify-center gap-1.5 h-[44px] min-h-[44px] rounded-xl bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 touch-manipulation active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                {mutations.createMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>

          {/* ── Agent cards ─────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {queries.visibleAgents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-emerald-400/20 hover:bg-white/[0.04] touch-manipulation"
              >
                <button
                  type="button"
                  className="w-full text-left min-h-[44px]"
                  onClick={() => {
                    triggerHaptic("light");
                    navigate({
                      to: "/agents/$agentId",
                      params: { agentId: agent.id },
                    });
                  }}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10">
                      <Bot className="h-5 w-5 text-emerald-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-100">{agent.id}</p>
                  </div>
                  <div className="space-y-2 text-xs text-slate-500">
                    <p className="flex items-center gap-1.5 min-h-[20px]"><Cpu className="h-3.5 w-3.5" /> {agent.model ?? "default"}</p>
                    <p className="flex items-center gap-1.5 min-h-[20px]"><Heart className="h-3.5 w-3.5" /> {agent.heartbeat_secs ? `${agent.heartbeat_secs}s` : "disabled"}</p>
                    <p className="flex items-center gap-1.5 min-h-[20px]"><Sparkles className="h-3.5 w-3.5" /> {(agent.enabled_skills ?? []).length || "none"} skills</p>
                    <p className="flex items-center gap-1.5 min-h-[20px]"><Clock className="h-3.5 w-3.5" /> {agent.cron_jobs_count ?? agent.cron_job_count ?? "-"} cron jobs</p>
                  </div>
                </button>
                <div className="mt-3 pt-2 border-t border-white/[0.06] flex justify-between items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic("light");
                      ui.setCloneAgentId(agent.id);
                      form.setCloneNewId(`${agent.id}-clone`);
                    }}
                    className="text-xs text-emerald-400/50 hover:text-emerald-300 transition-colors flex items-center gap-1 min-h-[44px] px-2 py-1.5 rounded-lg hover:bg-white/[0.04] touch-manipulation active:scale-95"
                  >
                    <Copy className="h-3.5 w-3.5" /> Clone
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic("medium");
                      ui.setConfirmDeleteId(agent.id);
                    }}
                    className="text-xs text-rose-400/50 hover:text-rose-300 transition-colors flex items-center gap-1 min-h-[44px] px-2 py-1.5 rounded-lg hover:bg-rose-400/10 touch-manipulation active:scale-95"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {queries.agentsQuery.isLoading || ui.loadingFallback ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-40" /></div>)}
            </div>
          ) : null}
          {queries.agentsQuery.error && !queries.fallbackAgents.length ? (
            <p className="text-sm text-rose-300">Failed to load agents.</p>
          ) : null}
          {queries.agentsQuery.error && queries.fallbackAgents.length ? (
            <p className="text-xs text-slate-500">Using agents from config fallback.</p>
          ) : null}
          {!queries.visibleAgents.length && !queries.agentsQuery.isLoading && !ui.loadingFallback ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bot className="h-8 w-8 text-slate-700 mb-3" />
              <p className="text-sm text-slate-400">No agents configured</p>
              <p className="text-xs text-slate-600 mt-1">Create an agent to start chatting and scheduling tasks.</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Delete Confirmation Dialog ──────────── */}
      {isMobile ? (
        <BottomSheet
          isOpen={!!ui.confirmDeleteId}
          onClose={() => ui.setConfirmDeleteId(null)}
          title="Delete Agent"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-400/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Delete Agent</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Are you sure you want to delete <span className="font-mono text-rose-300">{ui.confirmDeleteId}</span>?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => ui.setConfirmDeleteId(null)}
                className="w-full h-[48px] rounded-xl bg-white/[0.06] text-slate-200 text-sm font-medium hover:bg-white/[0.08] transition-colors touch-manipulation active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mutations.listDeleteMutation.isPending}
                onClick={() => {
                  triggerHaptic("heavy");
                  if (ui.confirmDeleteId) mutations.listDeleteMutation.mutate(ui.confirmDeleteId);
                }}
                className="w-full h-[48px] rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-400 disabled:opacity-40 transition-colors touch-manipulation active:scale-95"
              >
                {mutations.listDeleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </BottomSheet>
      ) : (
        <Dialog open={!!ui.confirmDeleteId} onOpenChange={(open) => { if (!open) ui.setConfirmDeleteId(null); }}>
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
                Are you sure you want to delete <span className="font-mono text-rose-300">{ui.confirmDeleteId}</span>?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => ui.setConfirmDeleteId(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="!bg-rose-500 hover:!bg-rose-400"
                  disabled={mutations.listDeleteMutation.isPending}
                  onClick={() => { if (ui.confirmDeleteId) mutations.listDeleteMutation.mutate(ui.confirmDeleteId); }}
                >
                  {mutations.listDeleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Clone Agent Dialog ──────────────────── */}
      {isMobile ? (
        <BottomSheet
          isOpen={!!ui.cloneAgentId}
          onClose={() => ui.setCloneAgentId(null)}
          title="Clone Agent"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10">
                <Copy className="h-6 w-6 text-emerald-400" />
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
                value={form.cloneNewId}
                onChange={(e) => form.setCloneNewId(e.target.value)}
                autoFocus
                className="min-h-[48px]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => ui.setCloneAgentId(null)}
                className="w-full h-[48px] rounded-xl bg-white/[0.06] text-slate-200 text-sm font-medium hover:bg-white/[0.08] transition-colors touch-manipulation active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mutations.cloneMutation.isPending}
                onClick={() => {
                  triggerHaptic("medium");
                  form.onClone();
                }}
                className="w-full h-[48px] rounded-xl bg-emerald-500 text-slate-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-40 transition-colors touch-manipulation active:scale-95"
              >
                {mutations.cloneMutation.isPending ? "Cloning..." : "Clone Agent"}
              </button>
            </div>
          </div>
        </BottomSheet>
      ) : (
        <Dialog open={!!ui.cloneAgentId} onOpenChange={(open) => { if (!open) ui.setCloneAgentId(null); }}>
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
                  value={form.cloneNewId}
                  onChange={(e) => form.setCloneNewId(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => ui.setCloneAgentId(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="!bg-emerald-500 hover:!bg-emerald-400"
                  disabled={mutations.cloneMutation.isPending}
                  onClick={form.onClone}
                >
                  {mutations.cloneMutation.isPending ? "Cloning..." : "Clone Agent"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function AgentDetailRoute() {
  const navigate = useNavigate();
  const { form, ui, queries, mutations, computed, agentId } = useAgentDetailRoute();
  const { isMobile } = useViewport();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tabs = [
    ["settings", "Settings", Settings],
    ["skills", "Skills", Sparkles],
    ["sessions", "Sessions", Layers],
    ["memory", "Memory", Brain],
    ...fileTabs.map((f) => [f, f, FileText] as const),
  ] as const;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        {/* Mobile back button */}
        {isMobile && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              navigate({ to: "/agents" });
            }}
            className="flex items-center justify-center h-10 w-10 -ml-2 rounded-lg hover:bg-white/[0.04] transition-colors touch-manipulation active:scale-95"
          >
            <ChevronLeft className="h-5 w-5 text-slate-400" />
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10 shrink-0">
            <Bot className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100 truncate">{agentId}</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08] hidden sm:block" />

        {/* ── Tab buttons ──────────────────────────── */}
        {isMobile ? (
          <>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="ml-auto flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.04] text-xs font-medium text-slate-300 hover:bg-white/[0.08] transition-colors touch-manipulation active:scale-95"
            >
              <Menu className="h-4 w-4" />
              <span className="capitalize">{ui.tab}</span>
            </button>

            <ActionSheet
              isOpen={mobileMenuOpen}
              onClose={() => setMobileMenuOpen(false)}
              actions={tabs.map(([value, label, Icon]) => ({
                label,
                icon: Icon,
                onClick: () => {
                  triggerHaptic("light");
                  ui.setTab(value as AgentDetailTab);
                },
              }))}
            />
          </>
        ) : (
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            {tabs.map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => ui.setTab(value as AgentDetailTab)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-medium transition-all duration-200 min-h-[36px] whitespace-nowrap touch-manipulation active:scale-95 ${
                  ui.tab === value
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {computed.hb && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px]">
              <span className={`inline-block h-2 w-2 rounded-full ${
                computed.hb.health === "ok" ? "bg-emerald-400 animate-status-pulse" :
                computed.hb.health === "stale" ? "bg-amber-400" : "bg-slate-600"
              }`} />
              <span className={
                computed.hb.health === "ok" ? "text-emerald-300" :
                computed.hb.health === "stale" ? "text-amber-300" : "text-slate-500"
              }>
                {computed.hb.health ?? "unknown"}
              </span>
              {computed.hb.last_tick && (
                <span className="text-slate-600">
                  · {minutesAgo(computed.hb.last_tick)}
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("medium");
              form.onDelete();
            }}
            disabled={mutations.deleteMutation.isPending}
            className="flex items-center gap-1 text-[10px] text-rose-400/60 hover:text-rose-300 disabled:opacity-40 transition-colors min-h-[44px] px-2 py-1.5 rounded-lg hover:bg-rose-400/10 touch-manipulation active:scale-95"
          >
            <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-5">

          {/* ── Heartbeat + Cron summary card ────── */}
          {computed.initialized && ui.tab === "settings" && (
            <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {computed.hb && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-3.5 w-3.5 text-emerald-400/60" />
                    <span className="text-xs font-medium text-slate-300">Heartbeat</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                    <span className="text-slate-600">Status</span>
                    <span className={
                      computed.hb.health === "ok" ? "text-emerald-300" :
                      computed.hb.health === "stale" ? "text-amber-300" : "text-slate-400"
                    }>{computed.hb.health ?? "—"}</span>
                    <span className="text-slate-600">Interval</span>
                    <span className="text-slate-300">{computed.hb.interval_secs ? `${computed.hb.interval_secs}s` : "—"}</span>
                    <span className="text-slate-600">Last tick</span>
                    <span className="text-slate-300">{computed.hb.last_tick ? new Date(computed.hb.last_tick * 1000).toLocaleTimeString() : "—"}</span>
                    <span className="text-slate-600">Next tick</span>
                    <span className="text-slate-300">{computed.hb.next_tick ? new Date(computed.hb.next_tick * 1000).toLocaleTimeString() : "—"}</span>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-3.5 w-3.5 text-emerald-400/60" />
                  <span className="text-xs font-medium text-slate-300">Cron Jobs</span>
                </div>
                {queries.cronJobsQuery.isLoading && <Skeleton className="h-4 w-20" />}
                {queries.cronJobsQuery.data && (
                  <div className="space-y-1">
                    {queries.cronJobsQuery.data.jobs.length === 0 && (
                      <p className="text-[11px] text-slate-600">No cron jobs configured</p>
                    )}
                    {queries.cronJobsQuery.data.jobs.map((job) => (
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
              const wp = (computed.data as Record<string, unknown> | undefined)?.watch_paths;
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
                  <Input value={form.model} onChange={(event) => form.setModel(event.target.value)} className="min-h-[44px]" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-slate-500">Heartbeat (seconds)</label>
                    <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                      <Checkbox
                        checked={form.heartbeatSecs !== null}
                        onCheckedChange={(next) => {
                          if (next) {
                            form.setHeartbeatSecs(300);
                          } else {
                            form.setHeartbeatSecs(null);
                          }
                        }}
                      />
                      <span className="text-[10px] text-slate-500">Enabled</span>
                    </label>
                  </div>
                  {form.heartbeatSecs !== null ? (
                    <Input type="number" value={form.heartbeatSecs} onChange={(event) => form.setHeartbeatSecs(parseInt(event.target.value, 10) || 0)} className="min-h-[44px]" />
                  ) : (
                    <p className="text-xs text-slate-600 py-1">Heartbeat disabled — agent will only respond when invoked.</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Max Tool Iterations</label>
                  <Input type="number" value={form.maxToolIterations} onChange={(event) => form.setMaxToolIterations(parseInt(event.target.value, 10) || 0)} className="min-h-[44px]" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Max Turns Before Compaction</label>
                  <Input type="number" value={form.maxTurns} onChange={(event) => form.setMaxTurns(parseInt(event.target.value, 10) || 0)} className="min-h-[44px]" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Recent Turns to Keep After Compaction</label>
                  <Input type="number" value={form.compactKeepRecentTurns} onChange={(event) => form.setCompactKeepRecentTurns(parseInt(event.target.value, 10) || 0)} className="min-h-[44px]" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">History Messages</label>
                  <Input type="number" value={form.historyMessages} onChange={(event) => form.setHistoryMessages(parseInt(event.target.value, 10) || 0)} className="min-h-[44px]" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Reasoning Effort</label>
                  <select
                    value={form.reasoningEffort}
                    onChange={(e) => form.setReasoningEffort(e.target.value)}
                    className="flex h-11 min-h-[44px] w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-sm text-slate-200 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/50"
                  >
                    <option value="">Default (none)</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("medium");
                    form.onSaveSettings();
                  }}
                  disabled={mutations.updateMutation.isPending}
                  className="flex items-center justify-center gap-1.5 h-11 min-h-[44px] w-full sm:w-auto px-6 rounded-lg bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 touch-manipulation active:scale-95"
                >
                  <Save className="h-4 w-4" />
                  {mutations.updateMutation.isPending ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          )}

          {computed.initialized && ui.tab === "skills" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400/60" />
                    <span className="text-xs font-medium text-slate-300">Enabled Skills</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                    <Checkbox
                      checked={form.allSkillsMode}
                      onCheckedChange={(next) => {
                        form.setAllSkillsMode(Boolean(next));
                        if (next) form.setEnabledSkills([]);
                      }}
                    />
                    <span className="text-xs text-slate-400">All skills enabled</span>
                  </label>
                </div>
                {form.allSkillsMode ? (
                  <p className="text-xs text-slate-500">All available skills are enabled for this agent. Uncheck &quot;All skills enabled&quot; to select specific skills.</p>
                ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(queries.skillsQuery.data?.skills ?? []).map((skill) => {
                    const checked = form.enabledSkills.includes(skill.id);
                    return (
                      <label
                        key={skill.id}
                        className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 cursor-pointer hover:border-white/[0.12] transition-all duration-200 touch-manipulation active:scale-95 min-h-[44px]"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            const checkedNext = Boolean(next);
                            form.setEnabledSkills((prev) => {
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
                  onClick={() => {
                    triggerHaptic("medium");
                    form.onSaveSkills();
                  }}
                  disabled={mutations.updateMutation.isPending}
                  className="mt-4 flex items-center justify-center gap-1.5 h-11 min-h-[44px] w-full sm:w-auto px-6 rounded-lg bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 touch-manipulation active:scale-95"
                >
                  <Save className="h-4 w-4" />
                  {mutations.updateMutation.isPending ? "Saving..." : "Save Skills"}
                </button>
              </div>
            </div>
          )}

          {computed.initialized && ui.tab === "sessions" && (
            <div className="space-y-2">
              {computed.agentSessions.map((session) => (
                <article
                  key={session.file}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:border-white/[0.12] transition-all duration-200 touch-manipulation active:scale-95 min-h-[44px]"
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
                    onClick={() => {
                      triggerHaptic("light");
                      navigate({
                        to: "/sessions/$agentId/$sessionFile",
                        params: { agentId, sessionFile: session.file },
                      });
                    }}
                    className="shrink-0 text-xs text-emerald-400/60 hover:text-emerald-300 transition-colors min-h-[44px] px-3 py-1.5 rounded-lg hover:bg-emerald-400/10 touch-manipulation active:scale-95"
                  >
                    Open →
                  </button>
                </article>
              ))}
              {queries.sessionsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
                  <span className="text-sm text-slate-500">Loading sessions…</span>
                </div>
              ) : null}
              {queries.sessionsQuery.error ? <p className="text-sm text-rose-300">Failed to load sessions.</p> : null}
              {!computed.agentSessions.length && !queries.sessionsQuery.isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Layers className="h-5 w-5 text-slate-700 mb-2" />
                  <p className="text-xs text-slate-600">No sessions for this agent</p>
                  <p className="text-[10px] text-slate-700 mt-0.5">Send a chat message or run cron to create one.</p>
                </div>
              )}
            </div>
          )}

          {computed.initialized && ui.tab === "memory" && (
            <AgentMemoryPanel agentId={agentId} />
          )}

          {queries.agentQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
              <span className="text-sm text-slate-500">Loading agent…</span>
            </div>
          ) : null}
          {queries.agentQuery.error ? <p className="text-sm text-rose-300">Failed to load agent.</p> : null}

          {computed.initialized && fileTabs.includes(ui.tab as (typeof fileTabs)[number]) && (
            <AgentFileEditor agentId={agentId} filename={ui.tab as (typeof fileTabs)[number]} />
          )}
        </div>
      </div>

      {/* ── Delete Confirmation Dialog ──────────── */}
      {isMobile ? (
        <BottomSheet
          isOpen={ui.confirmDelete}
          onClose={() => ui.setConfirmDelete(false)}
          title="Delete Agent"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-400/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
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
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => ui.setConfirmDelete(false)}
                className="w-full h-[48px] rounded-xl bg-white/[0.06] text-slate-200 text-sm font-medium hover:bg-white/[0.08] transition-colors touch-manipulation active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mutations.deleteMutation.isPending}
                onClick={() => {
                  triggerHaptic("heavy");
                  mutations.deleteMutation.mutate();
                }}
                className="w-full h-[48px] rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-400 disabled:opacity-40 transition-colors touch-manipulation active:scale-95"
              >
                {mutations.deleteMutation.isPending ? "Deleting..." : "Delete Agent"}
              </button>
            </div>
          </div>
        </BottomSheet>
      ) : (
        <Dialog open={ui.confirmDelete} onOpenChange={ui.setConfirmDelete}>
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
                <Button variant="secondary" size="sm" onClick={() => ui.setConfirmDelete(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="!bg-rose-500 hover:!bg-rose-400"
                  disabled={mutations.deleteMutation.isPending}
                  onClick={() => mutations.deleteMutation.mutate()}
                >
                  {mutations.deleteMutation.isPending ? "Deleting..." : "Delete Agent"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        className="min-h-[300px] sm:min-h-[360px] font-mono text-xs"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            triggerHaptic("medium");
            saveMutation.mutate(content);
          }}
          disabled={saveMutation.isPending}
          className="flex items-center justify-center gap-1.5 h-11 min-h-[44px] px-6 rounded-lg bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 touch-manipulation active:scale-95"
        >
          <Save className="h-4 w-4" />
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
  const { isMobile } = useViewport();

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
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search memories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 min-h-[44px] w-full rounded-lg border border-white/[0.06] bg-white/[0.02] pl-9 pr-8 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-400/30 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/[0.04] touch-manipulation active:scale-95"
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
              className={`px-3 py-3 text-[10px] font-medium capitalize transition-colors min-h-[44px] touch-manipulation active:scale-95 ${
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
              onClick={() => {
                triggerHaptic("medium");
                setDeleteKey(entry.key);
              }}
              className="shrink-0 rounded-md p-2 min-h-[44px] min-w-[44px] text-rose-400/60 hover:text-rose-300 hover:bg-rose-400/10 transition-colors touch-manipulation active:scale-95"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
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
      {isMobile ? (
        <BottomSheet
          isOpen={deleteKey !== null}
          onClose={() => setDeleteKey(null)}
          title="Delete Memory"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-400/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Delete Memory</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Delete memory <span className="font-mono text-rose-300">{deleteKey}</span>?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setDeleteKey(null)}
                className="w-full h-[48px] rounded-xl bg-white/[0.06] text-slate-200 text-sm font-medium hover:bg-white/[0.08] transition-colors touch-manipulation active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  triggerHaptic("heavy");
                  deleteKey && deleteMutation.mutate(deleteKey);
                }}
                className="w-full h-[48px] rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-400 disabled:opacity-40 transition-colors touch-manipulation active:scale-95"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </BottomSheet>
      ) : (
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
      )}
    </div>
  );
}
