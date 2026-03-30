import { Plus } from "lucide-react";
import { Input, Checkbox } from "@/shared/ui/components/ui";

interface CreateAgentFormProps {
  newAgentId: string;
  setNewAgentId: (value: string) => void;
  newAgentModel: string;
  setNewAgentModel: (value: string) => void;
  newAgentHeartbeat: number | null;
  setNewAgentHeartbeat: (value: number | null) => void;
  onCreate: () => void;
  isPending: boolean;
}

export function CreateAgentForm({
  newAgentId,
  setNewAgentId,
  newAgentModel,
  setNewAgentModel,
  newAgentHeartbeat,
  setNewAgentHeartbeat,
  onCreate,
  isPending,
}: CreateAgentFormProps) {
  return (
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
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={newAgentHeartbeat !== null}
              onCheckedChange={(next) => {
                if (next) {
                  setNewAgentHeartbeat(300);
                } else {
                  setNewAgentHeartbeat(null);
                }
              }}
            />
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Heartbeat</label>
          </div>
          {newAgentHeartbeat !== null && (
            <Input
              type="number"
              placeholder="heartbeat"
              value={newAgentHeartbeat}
              onChange={(event) => setNewAgentHeartbeat(parseInt(event.target.value, 10) || 0)}
            />
          )}
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={isPending}
          className="flex items-center justify-center gap-1.5 h-[42px] rounded-xl bg-emerald-400 text-slate-950 text-sm font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
        >
          <Plus className="h-3.5 w-3.5" />
          {isPending ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}
