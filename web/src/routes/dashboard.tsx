import { Show, For, createMemo } from "solid-js";
import { A } from "@solidjs/router";
import { createQuery } from "@/api/use-api";
import {
  fetchHealth,
  fetchAgents,
  fetchCronJobs,
  fetchHeartbeat,
  fetchUsage,
  qk,
} from "@/api/queries";
import type { AgentListItem, CronJob, HeartbeatAgent } from "@/api/schemas";
import { PageShell, PageTitle } from "@/components/layout";
import { LayoutDashboard, MessageSquare, ScrollText } from "@/components/icons";
import { formatRelativeTime } from "@/lib/utils";

// ── Types ────────────────────────────────────────────

type SignalState = "healthy" | "warning" | "error" | "idle";

interface AgentSnapshot {
  readonly id: string;
  readonly model: string;
  readonly cronCount: number;
  readonly skillCount: number;
  readonly heartbeatInterval: string;
  readonly freshness: string;
  readonly state: SignalState;
}

// ── Helpers ──────────────────────────────────────────

function formatUptime(secs: number): string {
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400)
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

function formatCost(usd: number): string {
  if (usd <= 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function getSignalState(
  agent: AgentListItem,
  heartbeat: HeartbeatAgent | undefined,
): SignalState {
  const health = (heartbeat?.health ?? "").toUpperCase();
  if (health.startsWith("OK")) return "healthy";
  if (health.includes("ERROR") || health.includes("FAIL")) return "error";
  if (agent.heartbeat_secs != null || health.length > 0) return "warning";
  return "idle";
}

function getJobSignal(status: string | null | undefined): SignalState {
  const v = (status ?? "").toUpperCase();
  if (v.includes("FAIL") || v.includes("ERROR")) return "error";
  if (v === "RUNNING") return "warning";
  if (v.includes("SUCCESS") || v === "OK") return "healthy";
  return "idle";
}

function dotClass(state: SignalState): string {
  switch (state) {
    case "healthy":
      return "status-dot status-dot-success";
    case "warning":
      return "status-dot status-dot-warning";
    case "error":
      return "status-dot status-dot-error";
    default:
      return "status-dot status-dot-idle";
  }
}

function bannerModifier(state: SignalState): string {
  switch (state) {
    case "healthy":
      return "status-banner-healthy";
    case "warning":
      return "status-banner-warning";
    case "error":
      return "status-banner-error";
    default:
      return "status-banner-idle";
  }
}

function aggregateUsage(
  buckets: ReadonlyArray<{ readonly day: string; readonly total_tokens: number }>,
) {
  const map = new Map<string, number>();
  for (const b of buckets) map.set(b.day, (map.get(b.day) ?? 0) + b.total_tokens);
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([day, total]) => ({ day, total }));
}

function jobRank(status: string | null | undefined): number {
  const s = getJobSignal(status);
  if (s === "error") return 0;
  if (s === "warning") return 1;
  if (s === "healthy") return 2;
  return 3;
}

// ── StatusBanner ─────────────────────────────────────

function StatusBanner(props: {
  state: SignalState;
  headline: string;
  uptime: string | null;
  isLoading: boolean;
}) {
  return (
    <Show
      when={!props.isLoading}
      fallback={<div class="skeleton" style={{ height: "48px", "border-radius": "var(--radius-lg)" }} />}
    >
      <div class={`status-banner ${bannerModifier(props.state)}`}>
        <span class={dotClass(props.state)} />
        <span class="status-banner-text">{props.headline}</span>
        <Show when={props.uptime}>
          <span class="status-banner-uptime">Up {props.uptime}</span>
        </Show>
      </div>
    </Show>
  );
}

// ── MetricStrip ──────────────────────────────────────

function MetricStrip(props: {
  agents: number;
  healthy: number;
  uptime: string | null;
  cost7d: string;
  isLoading: boolean;
}) {
  return (
    <Show
      when={!props.isLoading}
      fallback={
        <div class="metric-strip">
          <For each={[1, 2, 3, 4]}>
            {() => <div class="skeleton" style={{ height: "64px", "border-radius": "var(--radius-lg)" }} />}
          </For>
        </div>
      }
    >
      <div class="metric-strip">
        <MetricCell label="Agents" value={String(props.agents)} />
        <MetricCell label="Healthy" value={String(props.healthy)} />
        <MetricCell label="Uptime" value={props.uptime ?? "-"} />
        <MetricCell label="Cost 7d" value={props.cost7d} />
      </div>
    </Show>
  );
}

function MetricCell(props: { label: string; value: string }) {
  return (
    <div class="metric-cell">
      <span class="metric-label">{props.label}</span>
      <span class="metric-value">{props.value}</span>
    </div>
  );
}

// ── AgentTable ───────────────────────────────────────

function AgentTable(props: {
  agents: ReadonlyArray<AgentSnapshot>;
  isLoading: boolean;
}) {
  const sorted = createMemo(() =>
    [...props.agents].sort((a, b) => {
      const rank = (s: SignalState) =>
        s === "error" ? 0 : s === "warning" ? 1 : s === "healthy" ? 2 : 3;
      return rank(a.state) - rank(b.state) || a.id.localeCompare(b.id);
    }),
  );

  const grouped = createMemo(() => {
    const attention = sorted().filter((agent) => agent.state === "warning" || agent.state === "error");
    const healthy = sorted().filter((agent) => agent.state === "healthy");
    const idle = sorted().filter((agent) => agent.state === "idle");
    return [
      { label: "Attention", items: attention },
      { label: "Healthy", items: healthy },
      { label: "Idle", items: idle },
    ].filter((group) => group.items.length > 0);
  });

  return (
    <div class="card">
      <div class="card-header">
        <span class="card-title">Agents</span>
      </div>
      <Show
        when={!props.isLoading}
        fallback={
          <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-2)" }}>
            <For each={[1, 2, 3]}>
              {() => <div class="skeleton" style={{ height: "40px", "border-radius": "var(--radius-sm)" }} />}
            </For>
          </div>
        }
      >
        <Show
          when={sorted().length > 0}
          fallback={
            <div class="empty-state">
              <p>No agents configured</p>
              <A href="/agents" class="btn btn-sm btn-primary" style={{ "margin-top": "var(--space-2)" }}>
                Create Agent
              </A>
            </div>
          }
        >
          <div style={{ "overflow-x": "auto" }}>
            <table class="agent-table">
              <thead>
                <tr>
                  <th style={{ width: "28px" }} />
                  <th>Agent</th>
                  <th class="col-model">Model</th>
                  <th class="col-heartbeat">Heartbeat</th>
                  <th class="col-cron">Cron</th>
                  <th class="col-skills">Skills</th>
                  <th style={{ "text-align": "right" }}>Freshness</th>
                </tr>
              </thead>
              <tbody>
                <For each={grouped()}>
                  {(group) => (
                    <>
                      <tr class="agent-table-section">
                        <td colspan="7">{group.label} · {group.items.length}</td>
                      </tr>
                      <For each={group.items}>
                        {(agent) => (
                          <tr onClick={() => window.location.hash = `#/agents/${agent.id}`}>
                            <td><span class={dotClass(agent.state)} /></td>
                            <td>
                              <A href={`/agents/${agent.id}`} class="agent-table-link">{agent.id}</A>
                            </td>
                            <td class="col-model">
                              <span class="agent-table-model">{agent.model}</span>
                            </td>
                            <td class="col-heartbeat">
                              <span class="agent-table-muted">{agent.heartbeatInterval}</span>
                            </td>
                            <td class="col-cron">
                              <span class="agent-table-muted">{agent.cronCount}</span>
                            </td>
                            <td class="col-skills">
                              <span class="agent-table-muted">{agent.skillCount}</span>
                            </td>
                            <td style={{ "text-align": "right" }}>
                              <span class="agent-table-muted">{agent.freshness}</span>
                            </td>
                          </tr>
                        )}
                      </For>
                    </>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}

// ── AutomationCard ───────────────────────────────────

function AutomationCard(props: {
  jobs: ReadonlyArray<CronJob>;
  isLoading: boolean;
}) {
  const runningCount = createMemo(() =>
    props.jobs.filter((job) => (job.last_status ?? "").toUpperCase() === "RUNNING").length,
  );

  const failedCount = createMemo(() =>
    props.jobs.filter((job) => getJobSignal(job.last_status) === "error").length,
  );

  const sorted = createMemo(() =>
    [...props.jobs]
      .sort((a, b) => jobRank(a.last_status) - jobRank(b.last_status) || a.name.localeCompare(b.name))
      .slice(0, 5),
  );

  return (
    <div class="card">
      <div class="card-header">
        <span class="card-title">Automation</span>
        <span class="agent-table-muted">
          {props.jobs.length} jobs · {runningCount()} running · {failedCount()} failed
        </span>
      </div>
      <Show
        when={!props.isLoading}
        fallback={
          <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-2)" }}>
            <For each={[1, 2, 3]}>
              {() => <div class="skeleton" style={{ height: "32px", "border-radius": "var(--radius-sm)" }} />}
            </For>
          </div>
        }
      >
        <Show
          when={props.jobs.length > 0}
          fallback={
            <div class="empty-state" style={{ padding: "var(--space-6) var(--space-4)" }}>
              <p>No cron jobs</p>
            </div>
          }
        >
          <div>
            <For each={sorted()}>
              {(job) => {
                const state = getJobSignal(job.last_status);
                return (
                  <div class="job-row">
                    <span class={dotClass(state)} />
                    <span class="job-name">{job.name}</span>
                    <span class="job-agent">{job.agent_id}</span>
                    <span class="job-schedule">{job.schedule}</span>
                    <span class="job-meta">{(job.last_status ?? "pending").toLowerCase()}</span>
                  </div>
                );
              }}
            </For>
          </div>
          <A href="/cron" class="card-footer-link">View all &rarr;</A>
        </Show>
      </Show>
    </div>
  );
}

// ── UsageCard ────────────────────────────────────────

function UsageCard(props: {
  totalTokens: number;
  totalCost: number;
  totalTurns: number;
  points: ReadonlyArray<{ readonly day: string; readonly total: number }>;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div class="card">
      <div class="card-header">
        <span class="card-title">Usage (7d)</span>
      </div>
      <Show
        when={!props.isLoading}
        fallback={<div class="skeleton" style={{ height: "96px", "border-radius": "var(--radius-lg)" }} />}
      >
        <Show
          when={!props.isError}
          fallback={
            <div class="empty-state" style={{ padding: "var(--space-6) var(--space-4)" }}>
              <p>Unavailable</p>
            </div>
          }
        >
          <div class="usage-stats">
            <div>
              <div class="usage-stat-primary">{compactNumber(props.totalTokens)}</div>
              <div class="usage-stat-label">tokens</div>
            </div>
            <div>
              <div class="usage-stat-secondary">{formatCost(props.totalCost)}</div>
              <div class="usage-stat-label" style={{ "text-align": "right" }}>
                {compactNumber(props.totalTurns)} turns
              </div>
            </div>
          </div>
          <div style={{ "margin-top": "var(--space-3)" }}>
            <MiniBars points={props.points} />
          </div>
        </Show>
      </Show>
    </div>
  );
}

function MiniBars(props: {
  points: ReadonlyArray<{ readonly day: string; readonly total: number }>;
}) {
  const max = () => Math.max(...props.points.map((p) => p.total), 1);

  return (
    <Show
      when={props.points.length > 0}
      fallback={<div class="mini-bars-empty" />}
    >
      <div class="mini-bars">
        <For each={props.points}>
          {(point) => (
            <div
              class="mini-bar"
              style={{
                height: `${Math.max(12, Math.round((point.total / max()) * 100))}%`,
              }}
              title={`${point.day}: ${point.total.toLocaleString()} tokens`}
            />
          )}
        </For>
      </div>
    </Show>
  );
}

// ── Dashboard (default export) ───────────────────────

export default function Dashboard() {
  const health = createQuery({ key: qk.health, fn: fetchHealth, refetchInterval: 30_000 });
  const agents = createQuery({ key: qk.agents, fn: fetchAgents, refetchInterval: 15_000 });
  const cron = createQuery({ key: qk.cronJobs, fn: fetchCronJobs, refetchInterval: 30_000 });
  const heartbeat = createQuery({ key: qk.heartbeat, fn: fetchHeartbeat, refetchInterval: 15_000 });
  const usage = createQuery({ key: qk.usage(), fn: () => fetchUsage(), refetchInterval: 60_000 });

  // Build maps
  const heartbeatMap = createMemo(() => {
    const m = new Map<string, HeartbeatAgent>();
    for (const h of heartbeat.data?.agents ?? []) m.set(h.agent_id, h);
    return m;
  });

  const cronCountMap = createMemo(() => {
    const m = new Map<string, number>();
    for (const j of cron.data?.jobs ?? [])
      m.set(j.agent_id, (m.get(j.agent_id) ?? 0) + 1);
    return m;
  });

  // Agent snapshots
  const snapshots = createMemo<ReadonlyArray<AgentSnapshot>>(() =>
    (agents.data?.agents ?? []).map((agent) => {
      const hb = heartbeatMap().get(agent.id);
      const interval = hb?.interval_secs ?? agent.heartbeat_secs ?? null;
      return {
        id: agent.id,
        model: agent.model ?? "default",
        cronCount: cronCountMap().get(agent.id) ?? 0,
        skillCount: agent.enabled_skills?.length ?? 0,
        heartbeatInterval: interval != null ? `${interval}s` : "off",
        freshness:
          hb?.last_tick != null
            ? formatRelativeTime(hb.last_tick)
            : agent.heartbeat_secs != null
              ? "No tick"
              : "-",
        state: getSignalState(agent, hb),
      };
    }),
  );

  // Derived counts
  const healthyCount = createMemo(() => snapshots().filter((a) => a.state === "healthy").length);
  const totalAgents = createMemo(() => snapshots().length);

  // Usage aggregation
  const usagePoints = createMemo(() => aggregateUsage(usage.data?.usage ?? []));
  const totalTokens = createMemo(() =>
    (usage.data?.usage ?? []).reduce((s, b) => s + b.total_tokens, 0),
  );

  // Overall state
  const overallState = createMemo<SignalState>(() => {
    if (totalAgents() === 0) return "idle";
    const h = (health.data?.status ?? "").toUpperCase();
    if (h.startsWith("ERROR")) return "error";
    const failedJobs = (cron.data?.jobs ?? []).filter((j) =>
      (j.last_status ?? "").toUpperCase().includes("FAIL"),
    ).length;
    if (failedJobs > 0) return "error";
    const attn = snapshots().filter((a) => a.state === "warning" || a.state === "error").length;
    if (attn > 0) return "warning";
    return "healthy";
  });

  const headline = createMemo(() => {
    if (totalAgents() === 0) return "No agents configured";
    if (overallState() === "healthy") return "All systems healthy";
    const failedJobs = (cron.data?.jobs ?? []).filter((j) =>
      (j.last_status ?? "").toUpperCase().includes("FAIL"),
    ).length;
    if (failedJobs > 0) return failedJobs === 1 ? "1 job failed" : `${failedJobs} jobs failed`;
    const attn = snapshots().filter((a) => a.state === "warning" || a.state === "error").length;
    if (attn > 0) return attn === 1 ? "1 agent needs attention" : `${attn} agents need attention`;
    return "Operational";
  });

  const uptimeStr = createMemo(() =>
    health.data ? formatUptime(health.data.uptime_secs) : null,
  );

  const costStr = createMemo(() =>
    usage.isError ? "-" : formatCost(usage.data?.total_cost_usd ?? 0),
  );

  const isInitialLoad = () => health.isLoading && agents.isLoading;

  return (
    <PageShell
      maxWidth="5xl"
      header={<PageTitle icon={<LayoutDashboard size={16} />} title="Overview" />}
    >
      <div class="dashboard-stack route-enter">
        <StatusBanner
          state={overallState()}
          headline={headline()}
          uptime={uptimeStr()}
          isLoading={isInitialLoad()}
        />

        <MetricStrip
          agents={totalAgents()}
          healthy={healthyCount()}
          uptime={uptimeStr()}
          cost7d={costStr()}
          isLoading={isInitialLoad()}
        />

        <div class="dashboard-quick-actions">
          <A href="/chat" class="btn btn-secondary btn-sm" style={{ "text-decoration": "none" }}>
            <MessageSquare size={14} />
            Open chat
          </A>
          <A href="/logs" class="btn btn-secondary btn-sm" style={{ "text-decoration": "none" }}>
            <ScrollText size={14} />
            View logs
          </A>
        </div>

        <AgentTable agents={snapshots()} isLoading={agents.isLoading} />

        <div class="dashboard-bottom-grid">
          <AutomationCard jobs={cron.data?.jobs ?? []} isLoading={cron.isLoading} />
          <UsageCard
            totalTokens={totalTokens()}
            totalCost={usage.data?.total_cost_usd ?? 0}
            totalTurns={usage.data?.total_turns ?? 0}
            points={usagePoints()}
            isLoading={usage.isLoading}
            isError={usage.isError}
          />
        </div>
      </div>
    </PageShell>
  );
}
