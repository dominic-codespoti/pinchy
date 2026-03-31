"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Pencil, Trash2, Copy } from "lucide-react";

interface AgentRowActionsProps {
  agentId: string;
  agentName: string;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onClone: (id: string, name: string) => void;
}

AgentRowActions.displayName = "AgentRowActions";

export function AgentRowActions({
  agentId,
  agentName,
  onView,
  onEdit,
  onDelete,
  onClone,
}: AgentRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal data-icon />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onView(agentId)}>
          <Eye data-icon />
          View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(agentId)}>
          <Pencil data-icon />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onClone(agentId, agentName)}>
          <Copy data-icon />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(agentId, agentName)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 data-icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
