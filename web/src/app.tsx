import { HashRouter, Route } from "@solidjs/router";
import { lazy, Suspense, onCleanup, type ParentProps } from "solid-js";
import { AppShell } from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/toast";
import { mountGateway } from "@/api/gateway";
import { mountWsSync } from "@/api/ws-sync";

// Lazy-loaded routes
const Dashboard = lazy(() => import("./routes/dashboard"));
const Chat = lazy(() => import("./routes/chat"));
const AgentsList = lazy(() => import("./routes/agents-list"));
const AgentDetail = lazy(() => import("./routes/agent-detail"));
const Sessions = lazy(() => import("./routes/sessions"));
const Cron = lazy(() => import("./routes/cron"));
const CronEdit = lazy(() => import("./routes/cron-edit"));
const Skills = lazy(() => import("./routes/skills"));
const Config = lazy(() => import("./routes/config"));
const Logs = lazy(() => import("./routes/logs"));

function Loading() {
  return (
    <div class="empty-state">
      <div class="spinner" />
    </div>
  );
}

/** Root layout: mounts gateway WS + ws-sync, wraps in AppShell */
function RootLayout(props: ParentProps) {
  const cleanupGateway = mountGateway();
  const cleanupWsSync = mountWsSync();

  onCleanup(() => {
    cleanupWsSync();
    cleanupGateway();
  });

  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          {props.children}
        </Suspense>
      </ErrorBoundary>
      <Toaster />
    </AppShell>
  );
}

export function App() {
  return (
    <HashRouter root={RootLayout}>
      <Route path="/" component={Dashboard} />
      <Route path="/chat/:agentId?" component={Chat} />
      <Route path="/agents" component={AgentsList} />
      <Route path="/agents/:agentId" component={AgentDetail} />
      <Route path="/sessions" component={Sessions} />
      <Route path="/cron" component={Cron} />
      <Route path="/cron/edit/:jobId?" component={CronEdit} />
      <Route path="/skills" component={Skills} />
      <Route path="/config" component={Config} />
      <Route path="/logs" component={Logs} />
    </HashRouter>
  );
}
