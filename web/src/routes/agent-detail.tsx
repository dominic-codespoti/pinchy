import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Bot, Save, Heart, Cpu, Clock, Brain, Search, X, Settings } from "lucide-react";
import { Trash2 } from "lucide-react";
import {
  useAgentQuery, useUpdateAgentMutation, useAgentFileQuery,
  useSaveAgentFileMutation, useMemoryQuery, useDeleteMemoryMutation,
} from "@/api/queries";
import type { MemoryEntry } from "@/api/schemas";
import {
  Card, CardContent, Button, Input, Badge, Textarea, Skeleton, EmptyState,
} from "@/components/ui";
import { PageShell, FormField } from "@/components/layout";
import { cn, mutationOpts } from "@/lib/utils";

type DetailTab = "overview" | "files" | "memory" | "settings";
const TABS: readonly DetailTab[] = ["overview", "files", "memory", "settings"];

export function AgentDetailRoute() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const { data, isLoading } = useAgentQuery(agentId);
  const [tab, setTab] = useState<DetailTab>("overview");

  if (isLoading) return <div className="p-8 flex justify-center"><Skeleton className="h-40 w-full max-w-xl" /></div>;
  if (!data) return <p className="p-8 text-destructive">Agent not found.</p>;

  return (
    <PageShell
      maxWidth="3xl"
      header={
        <>
          <Link to="/agents" className="text-muted-foreground hover:text-foreground text-xs mr-1">&larr;</Link>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Bot className="h-3 w-3" />
          </div>
          <span className="text-sm font-semibold text-foreground">{agentId}</span>
          <div className="h-5 w-px bg-border mx-1" />
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("text-[11px] px-2 py-1 rounded-md capitalize",
                tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </>
      }
    >
      {tab === "overview" && <OverviewTab model={data.model ?? "default"}
        heartbeat={data.heartbeat_secs ?? null} cronCount={data.cron_job_count ?? 0}
        sessionCount={data.session_count ?? 0} />}
      {tab === "files" && <FilesTab agentId={agentId} />}
      {tab === "memory" && <MemoryTab agentId={agentId} />}
      {tab === "settings" && <SettingsTab agentId={agentId} model={data.model} heartbeatSecs={data.heartbeat_secs}
        maxToolIter={data.max_tool_iterations} maxTurns={data.max_turns}
        histMsgs={data.history_messages} effort={data.reasoning_effort} />}
    </PageShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function OverviewTab({ model, heartbeat, cronCount, sessionCount }: {
  readonly model: string; readonly heartbeat: number | null;
  readonly cronCount: number; readonly sessionCount: number;
}) {
  const items: readonly { readonly label: string; readonly value: string; readonly Icon: typeof Cpu }[] = [
    { label: "Model", value: model, Icon: Cpu },
    { label: "Heartbeat", value: heartbeat ? `${heartbeat}s` : "disabled", Icon: Heart },
    { label: "Cron Jobs", value: String(cronCount), Icon: Clock },
    { label: "Sessions", value: String(sessionCount), Icon: Settings },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <Card key={it.label}><CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><it.Icon className="h-3 w-3" />{it.label}</div>
          <p className="text-sm font-medium text-foreground">{it.value}</p>
        </CardContent></Card>
      ))}
    </div>
  );
}

const FILE_NAMES = ["SOUL.md", "TOOLS.md", "HEARTBEAT.md"] as const;

function FilesTab({ agentId }: { readonly agentId: string }) {
  const [active, setActive] = useState<string>(FILE_NAMES[0]);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {FILE_NAMES.map((f) => (
          <button key={f} type="button" onClick={() => setActive(f)}
            className={cn("text-xs px-2 py-1 rounded-md",
              active === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>{f}</button>
        ))}
      </div>
      <FileEditor agentId={agentId} filename={active} />
    </div>
  );
}

function FileEditor({ agentId, filename }: { readonly agentId: string; readonly filename: string }) {
  const { data, isLoading } = useAgentFileQuery(agentId, filename);
  const saveMut = useSaveAgentFileMutation(agentId);
  const [content, setContent] = useState("");

  useEffect(() => { setContent(data?.content ?? ""); }, [data?.content, agentId, filename]);

  if (isLoading) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-2">
      <Textarea className="min-h-[320px] font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="flex justify-end">
        <Button size="sm" disabled={saveMut.isPending}
          onClick={() => saveMut.mutate({ filename, content },
            mutationOpts(`Saved ${filename}`),
          )}><Save className="h-3 w-3 mr-1" />{saveMut.isPending ? "..." : "Save"}</Button>
      </div>
    </div>
  );
}

function MemoryTab({ agentId }: { readonly agentId: string }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const memOpts = q ? { q, limit: 100 } : { limit: 100 };
  const { data, isLoading } = useMemoryQuery(agentId, memOpts);
  const deleteMut = useDeleteMemoryMutation(agentId);

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);

  const entries: readonly MemoryEntry[] = data?.entries ?? [];
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input className="pl-9 pr-8" placeholder="Search memories..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && <button type="button" onClick={() => setSearch("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>
      <p className="text-[10px] text-muted-foreground opacity-60">{entries.length} entries</p>
      {isLoading && <Skeleton className="h-20" />}
      {entries.map((entry) => (
        <Card key={entry.key} className="group"><CardContent className="space-y-1">
          <div className="flex justify-between items-start gap-2">
            <p className="text-xs font-mono font-semibold text-foreground truncate">{entry.key}</p>
            <button type="button" onClick={() => deleteMut.mutate(entry.key,
              mutationOpts("Deleted"),
            )} className="shrink-0 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3 w-3" /></button>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{entry.value}</p>
          <div className="flex gap-1.5 flex-wrap">
            {entry.tags.map((t) => <Badge key={t} variant="default" className="!text-[9px]">{t}</Badge>)}
            <span className="text-[10px] text-muted-foreground opacity-60 ml-auto">{new Date(entry.timestamp).toLocaleString()}</span>
          </div>
        </CardContent></Card>
      ))}
      {!isLoading && entries.length === 0 && (
        <EmptyState icon={<Brain />} title={q ? "No matches" : "No memories yet"} />
      )}
    </div>
  );
}

function SettingsTab({ agentId, model, heartbeatSecs, maxToolIter, maxTurns, histMsgs, effort }: {
  readonly agentId: string;
  readonly model: string | undefined;
  readonly heartbeatSecs: number | undefined;
  readonly maxToolIter: number | undefined;
  readonly maxTurns: number | undefined;
  readonly histMsgs: number | undefined;
  readonly effort: string | undefined;
}) {
  const updateMut = useUpdateAgentMutation(agentId);
  const [f, setF] = useState({
    model: model ?? "", hb: String(heartbeatSecs ?? ""), iter: String(maxToolIter ?? 15),
    turns: String(maxTurns ?? 20), hist: String(histMsgs ?? 40), effort: effort ?? "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const onSave = () => {
    updateMut.mutate({
      model: f.model || undefined, heartbeat_secs: f.hb ? Number(f.hb) : null,
      max_tool_iterations: Number(f.iter) || undefined, max_turns: Number(f.turns) || undefined,
      history_messages: Number(f.hist) || undefined, reasoning_effort: f.effort || undefined,
    }, mutationOpts("Saved"));
  };

  const fields: readonly { readonly label: string; readonly key: keyof typeof f; readonly type?: string }[] = [
    { label: "Model", key: "model" }, { label: "Heartbeat (secs)", key: "hb", type: "number" },
    { label: "Max Tool Iterations", key: "iter", type: "number" }, { label: "Max Turns", key: "turns", type: "number" },
    { label: "History Messages", key: "hist", type: "number" }, { label: "Reasoning Effort", key: "effort" },
  ];
  return (<div className="space-y-4">
    {fields.map((fd) => (
      <FormField key={fd.key} label={fd.label}>
        <Input type={fd.type ?? "text"} value={f[fd.key]} onChange={(e) => set(fd.key)(e.target.value)} />
      </FormField>
    ))}
    <Button size="sm" disabled={updateMut.isPending} onClick={onSave}>
      <Save className="h-3 w-3 mr-1" />{updateMut.isPending ? "Saving..." : "Save Settings"}</Button>
  </div>);
}
