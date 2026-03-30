import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, Button } from "@/shared/ui/components/ui";

interface DeleteAgentDialogProps {
  agentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteAgentDialog({
  agentId,
  isOpen,
  onClose,
  onConfirm,
  isPending,
}: DeleteAgentDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10">
              <Trash2 className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Delete agent?</p>
              <p className="text-xs text-slate-500">
                This will remove <code className="text-rose-300">{agentId}</code> and all its sessions.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
