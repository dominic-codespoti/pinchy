"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown } from "lucide-react";

type SortField = "name" | "provider" | "status";
type SortDirection = "asc" | "desc";

interface AgentsTableHeaderProps {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  onSort: (field: SortField) => void;
}

AgentsTableHeader.displayName = "AgentsTableHeader";

export function AgentsTableHeader({
  allSelected,
  someSelected,
  onToggleAll,
  onSort,
}: AgentsTableHeaderProps) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-12">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={onToggleAll}
            aria-label="Select all agents"
          />
        </TableHead>
        <TableHead>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSort("name")}
            className="h-8 -ml-2 font-medium"
          >
            Name
            <ArrowUpDown data-icon />
          </Button>
        </TableHead>
        <TableHead className="max-w-md">Description</TableHead>
        <TableHead>Groups</TableHead>
        <TableHead>Heartbeat</TableHead>
        <TableHead>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSort("provider")}
            className="h-8 -ml-2 font-medium"
          >
            Provider
            <ArrowUpDown data-icon />
          </Button>
        </TableHead>
        <TableHead className="w-24">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );
}
