import { lazy, Suspense } from "react";
import {
  createRouter,
  createRoute,
  createRootRoute,
  createHashHistory,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Clock,
  Puzzle,
  Settings,
  ScrollText,
  BarChart3,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useGateway, useGatewayStatus } from "@/hooks/use-gateway";
import { useWsSync } from "@/hooks/use-ws-sync";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeSwitcher } from "@/components/theme-switcher";

// ── Lazy-loaded route components ────────────────────

const LazyDashboard = lazy(() => import("@/routes/dashboard").then((m) => ({ default: m.DashboardRoute })));
const LazyChat = lazy(() => import("@/routes/chat").then((m) => ({ default: m.ChatRoute })));
const LazyAgentsList = lazy(() => import("@/routes/agents-list").then((m) => ({ default: m.AgentsListRoute })));
const LazyAgentDetail = lazy(() => import("@/routes/agent-detail").then((m) => ({ default: m.AgentDetailRoute })));
const LazySessions = lazy(() => import("@/routes/sessions").then((m) => ({ default: m.SessionsRoute })));
const LazyCron = lazy(() => import("@/routes/cron").then((m) => ({ default: m.CronRoute })));
const LazyCronEdit = lazy(() => import("@/routes/cron-edit").then((m) => ({ default: m.CronEditRoute })));
const LazySkills = lazy(() => import("@/routes/skills").then((m) => ({ default: m.SkillsRoute })));
const LazyConfig = lazy(() => import("@/routes/config").then((m) => ({ default: m.ConfigRoute })));
const LazyLogs = lazy(() => import("@/routes/logs").then((m) => ({ default: m.LogsRoute })));

function RouteFallback() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function withSuspense(Component: React.ComponentType) {
  return function SuspenseWrapper() {
    return (
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

// ── Query Client ─────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ── Nav Items ────────────────────────────────────────

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chat/$agentId", label: "Chat", icon: MessageSquare, params: { agentId: "default" } },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/sessions", label: "Sessions", icon: BarChart3 },
  { to: "/cron", label: "Cron", icon: Clock },
  { to: "/skills", label: "Skills", icon: Puzzle },
  { to: "/config", label: "Config", icon: Settings },
  { to: "/logs", label: "Logs", icon: ScrollText },
] as const;

// ── Root Layout ──────────────────────────────────────

function RootLayout() {
  useGateway(); // maintain singleton WS connection
  useWsSync(); // global query invalidation from WS events
  const wsStatus = useGatewayStatus();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar nav */}
      <nav className="flex w-14 flex-col items-center border-r border-border bg-surface-1 py-3 gap-1">
        {/* Logo / brand */}
        <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent">
          <Bot className="h-4 w-4" />
        </div>

        {NAV_ITEMS.map((item) => (
          <NavButton key={item.label} item={item} />
        ))}

        {/* Theme + connection status at bottom */}
        <div className="mt-auto flex flex-col items-center gap-2">
          <ThemeSwitcher />
          {wsStatus === "connected" ? (
            <Wifi className="h-3.5 w-3.5 text-accent opacity-60" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-danger opacity-60" />
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <div className="route-stage h-full">
          <Outlet />
        </div>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--color-surface-2)",
            border: "1px solid var(--glass-border)",
            color: "var(--color-text-1)",
          },
        }}
      />
    </div>
  );
}

function NavButton({
  item,
}: {
  readonly item: (typeof NAV_ITEMS)[number];
}) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Determine if this nav item is active
  const isActive =
    item.to === "/"
      ? currentPath === "/" || currentPath === ""
      : currentPath.startsWith(item.to.split("/$")[0] ?? item.to);

  const Icon = item.icon;

  const className = cn(
    "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
    isActive
      ? "bg-accent-muted text-accent shadow-glow"
      : "text-text-3 hover:bg-[var(--color-elevated)] hover:text-text-2",
  );

  // Parameterised routes need explicit `params`, but TanStack Router's
  // `Link` overloads make it hard to unify in a single spread.  Use a
  // simple anchor-tag with hash-router href instead.
  const hash =
    "params" in item
      ? item.to.replace(/\$(\w+)/g, (_, key: string) => {
          const params: Record<string, string> = item.params;
          return params[key] ?? "";
        })
      : item.to;

  return (
    <a href={`#${hash}`} className={className} title={item.label}>
      <Icon className="h-4 w-4" />
    </a>
  );
}

// ── Route Tree ───────────────────────────────────────

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: withSuspense(LazyDashboard),
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$agentId",
  component: withSuspense(LazyChat),
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: withSuspense(LazyAgentsList),
});

const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
  component: withSuspense(LazyAgentDetail),
});

const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions",
  component: withSuspense(LazySessions),
});

const cronRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cron",
  component: withSuspense(LazyCron),
});

const cronEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cron/$jobId",
  component: withSuspense(LazyCronEdit),
});

const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/skills",
  component: withSuspense(LazySkills),
});

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/config",
  component: withSuspense(LazyConfig),
});

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/logs",
  component: withSuspense(LazyLogs),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  chatRoute,
  agentsRoute,
  agentDetailRoute,
  sessionsRoute,
  cronRoute,
  cronEditRoute,
  skillsRoute,
  configRoute,
  logsRoute,
]);

// ── Router Instance ──────────────────────────────────

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
});

// ── Provider Wrapper ─────────────────────────────────

export function AppProviders({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Type registration for TanStack Router
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
