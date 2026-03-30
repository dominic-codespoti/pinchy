import { Copy } from "lucide-react";
import { Dialog, DialogContent, Button, Input } from "@/shared/ui/components/ui";

interface CloneAgentDialogProps {
  agentId: string | null;
  newId: string;
  setNewId: (value: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function CloneAgentDialog({
  agentId,
  newId,
  setNewId,
  isOpen,
  onClose,
  onConfirm,
  isPending,
}: CloneAgentDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10">
              <Copy className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Clone agent</p>
              <p className="text-xs text-slate-500">
                Create a copy of <code className="text-emerald-300">{agentId}</code>
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-slate-500">New Agent ID</label>
            <Input
              placeholder="new-agent-id"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onConfirm}
              disabled={isPending || !newId.trim()}
            >
              {isPending ? "Cloning..." : "Clone"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
