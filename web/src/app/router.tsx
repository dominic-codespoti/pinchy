import { type ComponentType, Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  createHashHistory,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  BarChart3,
  Clock,
  Layers,
  Users,
  Sparkles,
  Settings,
  Terminal,
  Search,
} from "lucide-react";

import { Badge, Button, Dialog, DialogContent, Input, Skeleton } from "@/components/ui";
import { useUiStore } from "@/state/ui";
import { useGatewayStatusSocket } from "@/lib/ws";

const navItems = [
  { to: "/chat", label: "Chat", icon: MessageSquare, hint: "Live conversations and tool activity" },
  { to: "/dashboard", label: "Overview", icon: BarChart3, hint: "Heartbeat and event telemetry" },
  { to: "/cron", label: "Cron Jobs", icon: Clock, hint: "Scheduled workflows and runs" },
  { to: "/sessions", label: "Sessions", icon: Layers, hint: "Conversation timeline and edits" },
  { to: "/agents", label: "Agents", icon: Users, hint: "Agent setup, files and skills" },
  { to: "/skills", label: "Skills", icon: Sparkles, hint: "Installed global skills" },
  { to: "/config", label: "Config", icon: Settings, hint: "Provider and gateway config" },
  { to: "/logs", label: "Logs", icon: Terminal, hint: "Streaming runtime logs" },
] as const;

export interface RouterContext {
  queryClient: QueryClient;
}

function lazyNamed<TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule,
) {
  const LazyComp = lazy(() =>
    loader().then((module) => ({
      default: module[exportName] as ComponentType,
    })),
  );

  return function LazyRouteComponent() {
    return (
      <Suspense fallback={<RouteLoading />}>
        <LazyComp />
      </Suspense>
    );
  };
}

function RouteLoading() {
  return (
    <div className="space-y-4 p-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

const ChatRoute = lazyNamed(() => import("@/routes/chat"), "ChatRoute");
const DashboardRoute = lazyNamed(() => import("@/routes/dashboard"), "DashboardRoute");
const CronRoute = lazyNamed(() => import("@/routes/cron"), "CronRoute");
const CronEditRoute = lazyNamed(() => import("@/routes/cron-edit"), "CronEditRoute");
const SessionsListRoute = lazyNamed(() => import("@/routes/sessions"), "SessionsListRoute");
const SessionDetailRoute = lazyNamed(() => import("@/routes/sessions"), "SessionDetailRoute");
const AgentsListRoute = lazyNamed(() => import("@/routes/agents"), "AgentsListRoute");
const AgentDetailRoute = lazyNamed(() => import("@/routes/agents"), "AgentDetailRoute");
const SkillsRoute = lazyNamed(() => import("@/routes/skills"), "SkillsRoute");
const ConfigRoute = lazyNamed(() => import("@/routes/config"), "ConfigRoute");
const LogsRoute = lazyNamed(() => import("@/routes/logs"), "LogsRoute");

const rootRoute = createRootRouteWithContext<RouterContext>()({
  notFoundComponent: NotFoundView,
  errorComponent: RootErrorView,
  component: function RootLayout() {
    const navigate = useNavigate();
    useGatewayStatusSocket();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    const [commandQuery, setCommandQuery] = useState("");
    const wsConnected = useUiStore((s) => s.wsConnected);

    const commandItems = useMemo(
      () =>
        navItems.filter((item) => {
          const q = commandQuery.trim().toLowerCase();
          if (!q) return true;
          return (
            item.label.toLowerCase().includes(q) ||
            item.hint.toLowerCase().includes(q) ||
            item.to.toLowerCase().includes(q)
          );
        }),
      [commandQuery],
    );

    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setCommandOpen((prev) => !prev);
          return;
        }
        if (event.key === "Escape") {
          setCommandOpen(false);
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
      if (!commandOpen) setCommandQuery("");
    }, [commandOpen]);

    return (
      <div className="relative h-screen overflow-hidden bg-[var(--bg)] text-slate-100">
        {/* ── Header ──────────────────────────────── */}
        <header className="sticky top-0 z-30 border-b border-[var(--glass-border)] bg-[var(--surface-1)]/90 backdrop-blur-xl">
          <div className="flex w-full items-center justify-between gap-2 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setSidebarOpen((prev) => !prev)}
              >
                <Terminal className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/15 border border-emerald-400/30">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold tracking-tight text-slate-100">Pinchy</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Operations Console</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCommandOpen(true)}
                className="hidden md:inline-flex"
              >
                <Search className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                Search
                <span className="ml-2 rounded border border-slate-300/20 px-1.5 py-0.5 text-[10px] text-slate-500">⌘K</span>
              </Button>
              <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs backdrop-blur-sm ${
                wsConnected
                  ? "border-emerald-300/30 bg-emerald-300/8"
                  : "border-rose-300/30 bg-rose-300/8"
              }`}>
                <span className={`inline-block h-2 w-2 rounded-full ${
                  wsConnected
                    ? "bg-emerald-400 animate-status-pulse"
                    : "bg-rose-400"
                }`} />
                <span className={wsConnected ? "text-emerald-200" : "text-rose-200"}>
                  {wsConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>
          {/* Glow line */}
          <div className="glow-line h-px" />
        </header>

        <div className="flex w-full h-[calc(100vh-53px)] overflow-hidden">
          {/* ── Sidebar overlay (mobile) ──────────── */}
          <button
            type="button"
            className={`fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden ${sidebarOpen ? "block" : "hidden"}`}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          />

          {/* ── Sidebar ──────────────────────────── */}
          <aside
            className={[
              "fixed left-0 top-[53px] z-30 h-[calc(100vh-53px)] w-56 border-r border-[var(--glass-border)]",
              "bg-[var(--surface-1)]/95 backdrop-blur-xl md:static md:block md:h-[calc(100vh-53px)]",
              sidebarOpen ? "block" : "hidden md:block",
            ].join(" ")}
          >
            <div className="flex h-full flex-col p-3">
              <p className="mb-3 flex items-center gap-2 px-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <span className="inline-block h-1 w-1 rounded-full bg-emerald-400/50" />
                Navigation
              </p>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-slate-100"
                      activeProps={{
                        className:
                          "group flex items-center gap-2.5 rounded-lg border border-emerald-300/25 bg-emerald-300/8 px-2.5 py-2 text-sm font-medium text-emerald-100 shadow-sm",
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0 transition-colors group-hover:text-emerald-300/80" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Sidebar footer */}
              <div className="mt-auto border-t border-[var(--glass-border)] pt-3">
                <p className="px-2 text-[10px] text-slate-600">Pinchy v0.1</p>
              </div>
            </div>
          </aside>

          {/* ── Main content ──────────────────────── */}
          <main className="route-stage flex-1 min-h-0 overflow-y-auto">
            <Outlet />
          </main>
        </div>

        {/* ── Command Palette ─────────────────────── */}
        <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
          <DialogContent>
            <div className="border-b border-[var(--glass-border)] p-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  autoFocus
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    if (!commandItems.length) return;
                    navigate({ to: commandItems[0].to });
                    setCommandOpen(false);
                  }}
                  placeholder="Jump to a page..."
                  className="border-0 bg-transparent focus:ring-0 focus:shadow-none"
                />
              </div>
            </div>
            <div className="max-h-[50vh] overflow-auto p-2">
              {commandItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.to}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      navigate({ to: item.to });
                      setCommandOpen(false);
                    }}
                    className="mb-1 h-auto w-full items-start justify-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left hover:border-[var(--glass-border)] hover:bg-white/[0.04]"
                  >
                    <span className="mt-0.5 text-emerald-300/70"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="block truncate text-xs text-mute">{item.hint}</span>
                    </span>
                  </Button>
                );
              })}
              {!commandItems.length ? (
                <p className="px-3 py-2 text-sm text-mute">No matches for "{commandQuery}".</p>
              ) : null}
            </div>
            <div className="border-t border-[var(--glass-border)] px-3 py-2 text-[11px] text-slate-500">
              Enter to navigate · Esc to close
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
});

function RootErrorView(props: { error: Error }) {
  return (
    <div className="glass-card border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-100">
      <p className="text-base font-semibold">Route crashed</p>
      <p className="mt-1 text-rose-100/90">{props.error.message || "Unexpected route error."}</p>
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="glass-card space-y-2 p-4">
      <p className="text-base font-semibold">Page not found</p>
      <p className="text-sm text-mute">This route does not exist in the dashboard.</p>
      <Button asChild variant="secondary">
        <Link to="/chat">Go to Chat</Link>
      </Button>
    </div>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/chat" });
  },
});

const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: "/chat", component: ChatRoute });
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: DashboardRoute });
const cronRoute = createRoute({ getParentRoute: () => rootRoute, path: "/cron", component: CronRoute });
const cronEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cron/$jobId",
  component: CronEditRoute,
});
const sessionsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sessions", component: SessionsListRoute });
const sessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$agentId/$sessionFile",
  component: SessionDetailRoute,
});
const agentsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/agents", component: AgentsListRoute });
const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
  component: AgentDetailRoute,
});
const skillsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/skills", component: SkillsRoute });
const configRoute = createRoute({ getParentRoute: () => rootRoute, path: "/config", component: ConfigRoute });
const logsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/logs", component: LogsRoute });

const routeTree = rootRoute.addChildren([
  indexRoute,
  chatRoute,
  dashboardRoute,
  cronRoute,
  cronEditRoute,
  sessionsRoute,
  sessionDetailRoute,
  agentsRoute,
  agentDetailRoute,
  skillsRoute,
  configRoute,
  logsRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: {
    queryClient: undefined!,
  },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
