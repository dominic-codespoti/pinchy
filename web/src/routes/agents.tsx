import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bot, Plus, Trash2, Save, Heart, Cpu, Clock, Copy, Brain, Search, X, Settings } from "lucide-react";
import {
  useAgentsQuery, useAgentQuery, useCreateAgentMutation, useUpdateAgentMutation,
  useDeleteAgentMutation, useCloneAgentMutation, useAgentFileQuery,
  useSaveAgentFileMutation, useMemoryQuery, useDeleteMemoryMutation,
} from "@/api/queries";
import type { AgentListItem, MemoryEntry } from "@/api/schemas";
import {
  Card, CardContent, Button, Input, Badge, TextArea,
  Dialog, DialogContent, DialogTitle, DialogClose, Skeleton,
} from "@/components/ui";
import { PageShell, PageTitle, FormField } from "@/components/layout";
import { cn } from "@/lib/utils";

// ── Agent list ────────────────────────────────────────────────────────

export function AgentsListRoute() {
  const { data, isLoading } = useAgentsQuery();
  const createMut = useCreateAgentMutation();
  const deleteMut = useDeleteAgentMutation();
  const cloneMut = useCloneAgentMutation();
  const [newId, setNewId] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cloneSrc, setCloneSrc] = useState<string | null>(null);
  const [cloneNewId, setCloneNewId] = useState("");
  const agents: readonly AgentListItem[] = data?.agents ?? [];

  const onCreate = () => {
    const id = newId.trim();
    if (!id) return void toast.error("Agent ID required");
    createMut.mutate({ id }, {
      onSuccess: () => { toast.success(`Created ${id}`); setNewId(""); },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <PageShell
      maxWidth="5xl"
      header={
        <PageTitle icon={<Bot className="h-3.5 w-3.5" />} title="Agents">
          <span className="text-xs text-text-3">{agents.length} agents</span>
        </PageTitle>
      }
    >
      <div className="flex gap-2">
        <Input placeholder="new-agent-id" value={newId} onChange={(e) => setNewId(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onCreate(); }} />
        <Button variant="primary" size="sm" onClick={onCreate} disabled={createMut.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" />{createMut.isPending ? "..." : "Create"}
        </Button>
      </div>
      {isLoading && <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {agents.map((a) => (
          <Card key={a.id} className="group"><CardContent className="space-y-2">
            <Link to="/agents/$agentId" params={{ agentId: a.id }} className="block">
              <p className="text-sm font-semibold text-text-1">{a.id}</p>
              <div className="mt-1 space-y-0.5 text-xs text-text-3">
                <p className="flex items-center gap-1.5"><Cpu className="h-3 w-3" />{a.model ?? "default"}</p>
                <p className="flex items-center gap-1.5"><Heart className="h-3 w-3" />{a.heartbeat_secs ? `${a.heartbeat_secs}s` : "off"}</p>
                <p className="flex items-center gap-1.5"><Clock className="h-3 w-3" />{a.cron_jobs_count ?? a.cron_job_count ?? 0} cron</p>
              </div>
            </Link>
            <div className="flex justify-between pt-1 border-t border-border">
              <button type="button" className="text-[10px] text-accent/60 hover:text-accent flex items-center gap-1"
                onClick={() => { setCloneSrc(a.id); setCloneNewId(`${a.id}-copy`); }}>
                <Copy className="h-2.5 w-2.5" />Clone</button>
              <button type="button" className="text-[10px] text-danger/60 hover:text-danger flex items-center gap-1"
                onClick={() => setDeleteId(a.id)}><Trash2 className="h-2.5 w-2.5" />Delete</button>
            </div>
          </CardContent></Card>
        ))}
      </div>
      <Dialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent><DialogTitle>Delete {deleteId}?</DialogTitle>
          <p className="text-sm text-text-3 px-4">This cannot be undone.</p>
          <div className="flex justify-end gap-2 p-4">
            <DialogClose asChild><Button variant="secondary" size="sm">Cancel</Button></DialogClose>
            <Button variant="danger" size="sm" disabled={deleteMut.isPending}
              onClick={() => deleteId && deleteMut.mutate(deleteId, {
                onSuccess: () => { toast.success("Deleted"); setDeleteId(null); },
                onError: (e) => toast.error(e.message),
              })}>{deleteMut.isPending ? "..." : "Delete"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={cloneSrc !== null} onOpenChange={(o) => { if (!o) setCloneSrc(null); }}>
        <DialogContent><DialogTitle>Clone {cloneSrc}</DialogTitle>
          <div className="p-4"><Input value={cloneNewId} onChange={(e) => setCloneNewId(e.target.value)} placeholder="new-agent-id" /></div>
          <div className="flex justify-end gap-2 p-4 pt-0">
            <DialogClose asChild><Button variant="secondary" size="sm">Cancel</Button></DialogClose>
            <Button variant="primary" size="sm" disabled={cloneMut.isPending}
              onClick={() => cloneSrc && cloneMut.mutate({ id: cloneSrc, newId: cloneNewId.trim() }, {
                onSuccess: () => { toast.success("Cloned"); setCloneSrc(null); },
                onError: (e) => toast.error(e.message),
              })}>{cloneMut.isPending ? "..." : "Clone"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── Agent detail ──────────────────────────────────────────────────────

type DetailTab = "overview" | "files" | "memory" | "settings";
const TABS: readonly DetailTab[] = ["overview", "files", "memory", "settings"];

export function AgentDetailRoute() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const { data, isLoading } = useAgentQuery(agentId);
  const [tab, setTab] = useState<DetailTab>("overview");

  if (isLoading) return <div className="p-8 flex justify-center"><Skeleton className="h-40 w-full max-w-xl" /></div>;
  if (!data) return <p className="p-8 text-danger">Agent not found.</p>;

  return (
    <PageShell
      maxWidth="3xl"
      header={
        <>
          <Link to="/agents" className="text-text-3 hover:text-text-2 text-xs mr-1">&larr;</Link>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-subtle text-accent">
            <Bot className="h-3 w-3" />
          </div>
          <span className="text-sm font-semibold text-text-1">{agentId}</span>
          <div className="h-5 w-px bg-border mx-1" />
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn("text-[11px] px-2 py-1 rounded-md capitalize",
                tab === t ? "bg-accent-subtle text-accent" : "text-text-3 hover:text-text-2")}>
              {t}
            </button>
          ))}
        </>
      }
    >
      {tab === "overview" && <OverviewTab model={data.model ?? "default"}
        heartbeat={data.heartbeat_secs ?? null} cronCount={data.cron_jobs_count ?? data.cron_job_count ?? 0}
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
          <div className="flex items-center gap-2 text-xs text-text-3 mb-1"><it.Icon className="h-3 w-3" />{it.label}</div>
          <p className="text-sm font-medium text-text-1">{it.value}</p>
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
              active === f ? "bg-accent-subtle text-accent" : "text-text-3 hover:text-text-2")}>{f}</button>
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
      <TextArea className="min-h-[320px] font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="flex justify-end">
        <Button variant="primary" size="sm" disabled={saveMut.isPending}
          onClick={() => saveMut.mutate({ filename, content }, {
            onSuccess: () => toast.success(`Saved ${filename}`),
            onError: (e) => toast.error(e.message),
          })}><Save className="h-3 w-3 mr-1" />{saveMut.isPending ? "..." : "Save"}</Button>
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-3" />
        <Input className="pl-9 pr-8" placeholder="Search memories..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && <button type="button" onClick={() => setSearch("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"><X className="h-3.5 w-3.5" /></button>}
      </div>
      <p className="text-[10px] text-text-3 opacity-60">{entries.length} entries</p>
      {isLoading && <Skeleton className="h-20" />}
      {entries.map((entry) => (
        <Card key={entry.key} className="group"><CardContent className="space-y-1">
          <div className="flex justify-between items-start gap-2">
            <p className="text-xs font-mono font-semibold text-text-1 truncate">{entry.key}</p>
            <button type="button" onClick={() => deleteMut.mutate(entry.key, {
              onSuccess: () => toast.success("Deleted"), onError: (e) => toast.error(e.message),
            })} className="shrink-0 text-danger/60 hover:text-danger opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3 w-3" /></button>
          </div>
          <p className="text-xs text-text-3 line-clamp-3 whitespace-pre-wrap">{entry.value}</p>
          <div className="flex gap-1.5 flex-wrap">
            {entry.tags.map((t) => <Badge key={t} variant="success" className="!text-[9px]">{t}</Badge>)}
            <span className="text-[10px] text-text-3 opacity-60 ml-auto">{new Date(entry.timestamp).toLocaleString()}</span>
          </div>
        </CardContent></Card>
      ))}
      {!isLoading && entries.length === 0 && (
        <div className="text-center py-8">
          <Brain className="h-5 w-5 text-text-3 opacity-40 mx-auto mb-2" />
          <p className="text-xs text-text-3 opacity-60">{q ? "No matches" : "No memories yet"}</p>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ agentId, model, heartbeatSecs, maxToolIter, maxTurns, histMsgs, effort }: {
  readonly agentId: string;
  readonly model: string | null | undefined;
  readonly heartbeatSecs: number | null | undefined;
  readonly maxToolIter: number | null | undefined;
  readonly maxTurns: number | null | undefined;
  readonly histMsgs: number | null | undefined;
  readonly effort: string | null | undefined;
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
    }, { onSuccess: () => toast.success("Saved"), onError: (e) => toast.error(e.message) });
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
    <Button variant="primary" size="sm" disabled={updateMut.isPending} onClick={onSave}>
      <Save className="h-3 w-3 mr-1" />{updateMut.isPending ? "Saving..." : "Save Settings"}</Button>
  </div>);
}
