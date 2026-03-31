import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Agent } from "../types";

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  agents,
  onConfirm,
  isDeleting = false,
}: BulkDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Multiple Agents</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {agents.length} agent{agents.length !== 1 ? "s" : ""}? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[200px] rounded-md border p-4">
          <ul className="space-y-2">
            {agents.map((agent) => (
              <li key={agent.id} className="text-sm">
                <span className="font-medium">{agent.name}</span>
                {agent.description && (
                  <span className="text-muted-foreground ml-2">
                    — {agent.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : `Delete ${agents.length} Agent${agents.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
