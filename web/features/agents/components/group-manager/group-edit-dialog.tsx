'use client';

import { useState, useEffect } from "react";
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

interface GroupEditDialogProps {
  group: AgentGroup | null;
  onOpenChange: () => void;
  onUpdate: (id: string, updates: Partial<Omit<AgentGroup, "id">>) => void;
  groupColors: { value: string; label: string }[];
}

export function GroupEditDialog({
  group,
  onOpenChange,
  onUpdate,
  groupColors,
}: GroupEditDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "bg-blue-500",
    icon: "folder",
  });

  useEffect(() => {
    if (group) {
      setFormData({
        name: group.name,
        description: group.description || "",
        color: group.color,
        icon: group.icon || "folder",
      });
    }
  }, [group]);

  const handleUpdate = () => {
    if (!group || !formData.name.trim()) return;
    onUpdate(group.id, {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      color: formData.color,
      icon: formData.icon,
    });
    onOpenChange();
  };

  return (
    <Dialog open={!!group} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-w-[95vw] w-full">
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
          <DialogDescription>
            Update group details.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
          <Button variant="outline" onClick={onOpenChange} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={!formData.name.trim()} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
