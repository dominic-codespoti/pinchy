"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Skill } from "../types";
import { SkillDetailDialog } from "./skill-detail-dialog";
import { EditSkillDialog } from "./edit-skill-dialog";
import { useDeleteSkill } from "../hooks";
import { Lightbulb, Eye, Shield, Wrench, Trash2, Pencil } from "lucide-react";

function formatSkillName(id: string): string {
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SkillsListProps {
  skills?: Skill[];
  loading: boolean;
  onRefetch?: () => void;
}

export function SkillsList({ skills, loading, onRefetch }: SkillsListProps) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const deleteSkill = useDeleteSkill();

  const handleDelete = async (skillId: string) => {
    await deleteSkill.mutateAsync(skillId);
    onRefetch?.();
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full mt-2" />
            </CardHeader>
            <CardFooter>
              <Skeleton className="h-8 w-24" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (!skills || skills.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Lightbulb className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium mb-1">
            No skills registered
          </p>
          <p className="text-sm text-muted-foreground/70 max-w-xs">
            Skills will appear here once they are registered with the system.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill) => (
          <Card key={skill.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">
                  {formatSkillName(skill.id)}
                </CardTitle>
                {skill.operatorManaged ? (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Built-in
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    <Wrench className="h-3 w-3 mr-1" />
                    Custom
                  </Badge>
                )}
              </div>
              <CardDescription className="line-clamp-2 mt-1">
                {skill.description || "No description available."}
              </CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto pt-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSkill(skill.id)}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                View Details
              </Button>
              {!skill.operatorManaged && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSkillId(skill.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(skill.id)}
                    disabled={deleteSkill.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {selectedSkill && (
        <SkillDetailDialog
          skillId={selectedSkill}
          open={!!selectedSkill}
          onOpenChange={(open) => {
            if (!open) setSelectedSkill(null);
          }}
        />
      )}

      {editingSkillId && (
        <EditSkillDialog
          skillId={editingSkillId}
          open={!!editingSkillId}
          onOpenChange={(open) => {
            if (!open) setEditingSkillId(null);
          }}
        />
      )}
    </>
  );
}

SkillsList.displayName = "SkillsList";
