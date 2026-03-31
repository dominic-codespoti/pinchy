"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/shared/lib/utils";
import {
  Trash2,
  Power,
  PowerOff,
  X,
  FolderInput,
  Check,
} from "lucide-react";

interface BulkActionsToolbarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onAssignToGroup?: () => void;
  isProcessing?: boolean;
}

BulkActionsToolbar.displayName = "BulkActionsToolbar";

export function BulkActionsToolbar({
  selectedCount,
  onClear,
  onDelete,
  onEnable,
  onDisable,
  onAssignToGroup,
  isProcessing = false,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 sm:bottom-6"
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background p-2 shadow-lg",
          "flex-wrap justify-center sm:flex-nowrap sm:gap-3",
          "max-w-[95vw]"
        )}
      >
        {/* Selection count badge */}
        <div className="flex items-center gap-2 px-2">
          <div className="flex size-6 items-center justify-center rounded-full bg-primary">
            <Check data-icon className="text-primary-foreground" />
          </div>
          <Badge variant="secondary" className="font-medium">
            {selectedCount} selected
          </Badge>
        </div>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        {/* Action buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          {onAssignToGroup && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAssignToGroup}
              disabled={isProcessing}
            >
              <FolderInput data-icon />
              <span className="hidden sm:inline">Group</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onEnable}
            disabled={isProcessing}
          >
            <Power data-icon />
            <span className="hidden sm:inline">Enable</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onDisable}
            disabled={isProcessing}
          >
            <PowerOff data-icon />
            <span className="hidden sm:inline">Disable</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isProcessing}
          >
            <Trash2 data-icon />
            <span className="hidden sm:inline">Delete</span>
          </Button>

          <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            disabled={isProcessing}
            aria-label="Clear selection"
            className="shrink-0"
          >
            <X data-icon />
          </Button>
        </div>
      </div>
    </div>
  );
}
