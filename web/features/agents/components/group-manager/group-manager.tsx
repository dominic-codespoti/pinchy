"use client";

import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Folder, GripVertical, Pencil, Trash2, Plus, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { AgentGroup } from "../../types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GroupCreateDialog } from "./group-create-dialog";
import { GroupEditDialog } from "./group-edit-dialog";
import { GroupDeleteDialog } from "./group-delete-dialog";

const GROUP_COLORS = [
  { value: "bg-blue-500", label: "Blue" },
  { value: "bg-green-500", label: "Green" },
  { value: "bg-purple-500", label: "Purple" },
  { value: "bg-orange-500", label: "Orange" },
  { value: "bg-pink-500", label: "Pink" },
  { value: "bg-cyan-500", label: "Cyan" },
  { value: "bg-amber-500", label: "Amber" },
  { value: "bg-rose-500", label: "Rose" },
  { value: "bg-slate-500", label: "Gray" },
];

interface SortableGroupItemProps {
  group: AgentGroup;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  agentCount: number;
}

function SortableGroupItem({
  group,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  agentCount,
}: SortableGroupItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 rounded-md group/item transition-colors",
        isSelected && "bg-accent",
        !isSelected && "hover:bg-muted",
        isDragging && "opacity-50"
      )}
    >
      <Button
        {...attributes}
        {...listeners}
        variant="ghost"
        size="icon"
        className="h-8 w-8 p-1 opacity-0 group-hover/item:opacity-100 hover:bg-muted-foreground/10 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </Button>

      <Button
        variant="ghost"
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 text-left min-w-0 justify-start h-8 px-2"
      >
        <div className={cn("h-3 w-3 rounded-full shrink-0", group.color)} />
        <span className="truncate text-sm font-medium">{group.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">({agentCount})</span>
      </Button>

      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface GroupManagerProps {
  groups: AgentGroup[];
  onCreate: (group: Omit<AgentGroup, "id" | "order" | "agentIds">) => void;
  onUpdate: (id: string, updates: Partial<Omit<AgentGroup, "id">>) => void;
  onDelete: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  agentCounts: Record<string, number>;
  ungroupedCount: number;
}

export function GroupManager({
  groups,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  selectedGroupId,
  onSelectGroup,
  agentCounts,
  ungroupedCount,
}: GroupManagerProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [editingGroup, setEditingGroup] = useState<AgentGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<AgentGroup | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  const handleDelete = () => {
    if (deletingGroup) {
      onDelete(deletingGroup.id);
      if (selectedGroupId === deletingGroup.id) {
        onSelectGroup(null);
      }
      setDeletingGroup(null);
    }
  };

  const totalCount = Object.values(agentCounts).reduce((a, b) => a + b, 0) + ungroupedCount;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="flex items-center justify-between w-full p-2 text-sm font-medium hover:bg-muted rounded-md transition-colors h-auto">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            <span>Groups</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pt-1 pb-2 space-y-1">
          <Button
            variant="ghost"
            onClick={() => onSelectGroup(null)}
            className={cn(
              "flex items-center gap-2 p-2 rounded-md w-full text-left text-sm transition-colors justify-start h-8",
              selectedGroupId === null && "bg-accent",
              selectedGroupId !== null && "hover:bg-muted"
            )}
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">All Agents</span>
            <span className="text-xs text-muted-foreground">({totalCount})</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => onSelectGroup("ungrouped")}
            className={cn(
              "flex items-center gap-2 p-2 rounded-md w-full text-left text-sm transition-colors justify-start h-8",
              selectedGroupId === "ungrouped" && "bg-accent",
              selectedGroupId !== "ungrouped" && "hover:bg-muted"
            )}
          >
            <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
            <span className="flex-1">Ungrouped</span>
            <span className="text-xs text-muted-foreground">({ungroupedCount})</span>
          </Button>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {groups.map((group) => (
                  <SortableGroupItem
                    key={group.id}
                    group={group}
                    isSelected={selectedGroupId === group.id}
                    onSelect={() => onSelectGroup(group.id)}
                    onEdit={() => setEditingGroup(group)}
                    onDelete={() => setDeletingGroup(group)}
                    agentCount={agentCounts[group.id] || 0}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New Group
          </Button>
        </div>
      </CollapsibleContent>

      <GroupCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={onCreate}
        groupColors={GROUP_COLORS}
      />

      <GroupEditDialog
        group={editingGroup}
        onOpenChange={() => setEditingGroup(null)}
        onUpdate={onUpdate}
        groupColors={GROUP_COLORS}
      />

      <GroupDeleteDialog
        group={deletingGroup}
        onOpenChange={() => setDeletingGroup(null)}
        onConfirm={handleDelete}
      />
    </Collapsible>
  );
}
