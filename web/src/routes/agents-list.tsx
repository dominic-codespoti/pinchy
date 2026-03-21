import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, Plus, Trash2, Heart, Cpu, Clock, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  useAgentsQuery, useCreateAgentMutation,
  useDeleteAgentMutation, useCloneAgentMutation,
} from "@/api/queries";
import type { AgentListItem } from "@/api/schemas";
import {
  Card, CardContent, Button, Input,
  Dialog, DialogContent, DialogTitle, DialogClose, Skeleton,
} from "@/components/ui";
import { PageShell, PageTitle } from "@/components/layout";
import { mutationOpts } from "@/lib/utils";

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
    createMut.mutate({ id }, mutationOpts(`Created ${id}`, () => setNewId("")));
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
                <p className="flex items-center gap-1.5"><Clock className="h-3 w-3" />{a.cron_job_count} cron</p>
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
              onClick={() => deleteId && deleteMut.mutate(deleteId,
                mutationOpts("Deleted", () => setDeleteId(null)),
              )}>{deleteMut.isPending ? "..." : "Delete"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={cloneSrc !== null} onOpenChange={(o) => { if (!o) setCloneSrc(null); }}>
        <DialogContent><DialogTitle>Clone {cloneSrc}</DialogTitle>
          <div className="p-4"><Input value={cloneNewId} onChange={(e) => setCloneNewId(e.target.value)} placeholder="new-agent-id" /></div>
          <div className="flex justify-end gap-2 p-4 pt-0">
            <DialogClose asChild><Button variant="secondary" size="sm">Cancel</Button></DialogClose>
            <Button variant="primary" size="sm" disabled={cloneMut.isPending}
              onClick={() => cloneSrc && cloneMut.mutate({ id: cloneSrc, newId: cloneNewId.trim() },
                mutationOpts("Cloned", () => setCloneSrc(null)),
              )}>{cloneMut.isPending ? "..." : "Clone"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
