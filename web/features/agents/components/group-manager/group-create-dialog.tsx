'use client';

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/shared/lib/utils";
import { AgentGroup } from "../../types";

interface GroupCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (group: Omit<AgentGroup, "id" | "order" | "agentIds">) => void;
  groupColors: { value: string; label: string }[];
}

export function GroupCreateDialog({
  open,
  onOpenChange,
  onCreate,
  groupColors,
}: GroupCreateDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "bg-blue-500",
    icon: "folder",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      color: "bg-blue-500",
      icon: "folder",
    });
  };

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    onCreate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      color: formData.color,
      icon: formData.icon,
    });
    resetForm();
    onOpenChange(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] max-w-[95vw] w-full">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>
            Create a new group to organize your agents.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Production Agents"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What this group is for..."
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label>Color</Label>
            <ToggleGroup
              type="single"
              value={formData.color}
              onValueChange={(value) => value && setFormData({ ...formData, color: value })}
              className="flex flex-wrap gap-2"
            >
              {groupColors.map((color) => (
                <ToggleGroupItem
                  key={color.value}
                  value={color.value}
                  className={cn(
                    "h-8 w-8 rounded-full p-0 border-0",
                    color.value,
                    formData.color === color.value && "ring-2 ring-offset-2 ring-primary scale-110"
                  )}
                  title={color.label}
                  aria-label={color.label}
                />
              ))}
            </ToggleGroup>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!formData.name.trim()} className="w-full sm:w-auto">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
