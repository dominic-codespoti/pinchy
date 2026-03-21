import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Bot, Clock, Heart, Coins, Server, RefreshCw } from "lucide-react";
import {
  useHealthQuery, useAgentsQuery, useCronJobsQuery, useHeartbeatQuery, useUsageQuery,
} from "@/api/queries";
import type { AgentListItem, HeartbeatAgent, CronJob } from "@/api/schemas";
import {
  Card, CardHeader, CardTitle, CardContent, Badge, StatusPill, Skeleton, Separator,
} from "@/components/ui";
import { PageShell, PageTitle } from "@/components/layout";
import { cn, formatTimestamp } from "@/lib/utils";

function formatUptime(secs: number): string {
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

function formatCost(usd: number): string {
  if (usd <= 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

function hbStyle(h: string): { variant: "success" | "danger" | "warning" | "neutral"; dot: string } {
  const u = h.toUpperCase();
  if (u.startsWith("OK")) return { variant: "success", dot: "bg-success animate-status-pulse" };
  if (u.startsWith("ERROR")) return { variant: "danger", dot: "bg-danger" };
  if (u === "MISSED" || u === "STALE") return { variant: "warning", dot: "bg-warning" };
  return { variant: "neutral", dot: "bg-warning" };
}

function StatBlock({ label, value, accent }: {
  readonly label: string; readonly value: string; readonly accent?: string | undefined;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-3">{label}</p>
      <p className={cn("text-xl font-semibold mt-0.5", accent ?? "text-text-1")}>{value}</p>
    </div>
  );
}

// ── Health ────────────────────────────────────────────

function HealthSection() {
  const { data, isLoading, isFetching } = useHealthQuery();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-4 w-4 text-accent opacity-60" /> System Health
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <RefreshCw className={cn("h-3 w-3 text-text-3 opacity-60", isFetching && "animate-spin text-accent")} />
          <span className="text-[10px] text-text-3 opacity-60">auto</span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-14 w-full" /> : !data ? (
          <p className="text-xs text-text-3 opacity-60">Health endpoint unavailable</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full", data.status === "ok" ? "bg-success animate-status-pulse" : "bg-danger")} />
              <span className={cn("text-lg font-semibold", data.status === "ok" ? "text-success" : "text-danger")}>{data.status.toUpperCase()}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              {([["Version", data.version], ["Uptime", formatUptime(data.uptime_secs)], ["Agents", String(data.agents)]] as const).map(([l, v]) => (
                <div key={l}>
                  <p className="text-[10px] uppercase tracking-widest text-text-3">{l}</p>
                  <p className="text-sm font-medium text-text-1 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Agents ────────────────────────────────────────────

function AgentCard({ agent, cronCount, heartbeat }: {
  readonly agent: AgentListItem; readonly cronCount: number; readonly heartbeat: HeartbeatAgent | undefined;
}) {
  const health = (heartbeat?.health ?? "unknown").toUpperCase();
  const hb = hbStyle(health);
  return (
    <Link to="/agents/$agentId" params={{ agentId: agent.id }}
      className="group rounded-xl border border-border bg-[var(--color-elevated)] p-3 space-y-2 transition-all duration-200 hover:border-accent/20 hover:bg-[var(--glass-bg)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text-1 truncate">{agent.id}</p>
        <Badge variant={hb.variant} className="shrink-0">{health}</Badge>
      </div>
      <div className="space-y-0.5 text-xs text-text-3">
        <p className="truncate">Model: {agent.model ?? "default"}</p>
        <p>Cron jobs: {cronCount}</p>
        {heartbeat?.last_tick && <p>Last tick: {formatTimestamp(heartbeat.last_tick)}</p>}
      </div>
    </Link>
  );
}

function AgentOverviewSection() {
  const { data, isLoading } = useAgentsQuery();
  const cron = useCronJobsQuery();
  const heartbeat = useHeartbeatQuery();
  const hbMap = useMemo(() => {
    const m = new Map<string, HeartbeatAgent>();
    for (const a of heartbeat.data?.agents ?? []) m.set(a.agent_id, a);
    return m;
  }, [heartbeat.data]);
  const jobs = cron.data?.jobs ?? [];
  const list = data?.agents ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent opacity-60" /> Agents
        </CardTitle>
        <Badge variant="neutral">{list.length}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24" /><Skeleton className="h-24" />
          </div>
        ) : list.length === 0 ? (
          <p className="text-xs text-text-3 opacity-60 py-4 text-center">No agents configured</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => (
              <AgentCard key={a.id} agent={a} cronCount={jobs.filter((j: CronJob) => j.agent_id === a.id).length} heartbeat={hbMap.get(a.id)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Cron Summary ──────────────────────────────────────

function CronSummarySection() {
  const { data, isLoading } = useCronJobsQuery();
  const jobs = data?.jobs ?? [];
  const running = jobs.filter((j) => j.last_status?.toUpperCase() === "RUNNING").length;
  const failed = jobs.filter((j) => j.last_status?.toUpperCase().startsWith("FAILED")).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent opacity-60" /> Cron Jobs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-10 w-full" /> : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <StatBlock label="Total" value={String(jobs.length)} />
              <StatBlock label="Running" value={String(running)} accent={running > 0 ? "text-info" : undefined} />
              <StatBlock label="Failed" value={String(failed)} accent={failed > 0 ? "text-danger" : undefined} />
            </div>
            {jobs.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1.5 max-h-32 overflow-auto">
                  {jobs.map((j) => (
                    <div key={j.id} className="flex items-center justify-between text-xs">
                      <span className="text-text-2 truncate max-w-[140px]">{j.name}</span>
                      <StatusPill status={j.last_status ?? "idle"} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Usage ─────────────────────────────────────────────

function UsageSummarySection() {
  const { data, isLoading } = useUsageQuery();
  const totalTokens = (data?.usage ?? []).reduce((s, b) => s + b.total_tokens, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-accent opacity-60" /> Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-10 w-full" /> : (
          <div className="grid grid-cols-2 gap-4">
            <StatBlock label="Total Tokens" value={totalTokens.toLocaleString()} />
            <StatBlock label="Est. Cost" value={formatCost(data?.total_cost_usd ?? 0)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Heartbeat Health ──────────────────────────────────

function HeartbeatSection() {
  const { data, isLoading } = useHeartbeatQuery();
  const agents = data?.agents ?? [];
  const okCount = agents.filter((a) => (a.health ?? "").toUpperCase().startsWith("OK")).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-accent opacity-60" /> Heartbeat Health
        </CardTitle>
        {!isLoading && <Badge variant={okCount === agents.length && agents.length > 0 ? "success" : "warning"}>{okCount}/{agents.length} OK</Badge>}
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-16 w-full" /> : agents.length === 0 ? (
          <p className="text-xs text-text-3 opacity-60 py-2 text-center">No heartbeat agents</p>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => {
              const h = (a.health ?? "UNKNOWN").toUpperCase();
              const hb = hbStyle(h);
              return (
                <div key={a.agent_id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-[var(--color-elevated)] px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", hb.dot)} />
                    <span className="text-sm text-text-1 truncate">{a.agent_id}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {a.last_tick && <span className="text-[10px] text-text-3">{formatTimestamp(a.last_tick)}</span>}
                    <Badge variant={hb.variant}>{h}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Route Component ───────────────────────────────────

export function DashboardRoute() {
  return (
    <PageShell
      maxWidth="5xl"
      header={
        <PageTitle icon={<Activity className="h-3.5 w-3.5" />} title="Overview">
          <span className="text-xs text-text-3">Agent operations dashboard</span>
        </PageTitle>
      }
    >
      <HealthSection />
      <AgentOverviewSection />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CronSummarySection />
        <UsageSummarySection />
      </div>
      <HeartbeatSection />
    </PageShell>
  );
}
