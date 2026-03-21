import { useCallback } from "react";
import { Puzzle, Trash2, Shield } from "lucide-react";
import { useSkillsQuery, useDeleteSkillMutation } from "@/api/queries";
import type { Skill } from "@/api/schemas";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Skeleton, EmptyState } from "@/components/ui";
import { PageShell, PageTitle } from "@/components/layout";
import { cn, mutationOpts } from "@/lib/utils";

function SkillCard({ skill, onDelete, isDeleting }: {
  readonly skill: Skill;
  readonly onDelete: (id: string) => void;
  readonly isDeleting: boolean;
}) {
  const isOperator = skill.operator_managed === true;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-accent" />
          <CardTitle>{skill.id}</CardTitle>
        </div>
        {isOperator && (
          <Badge variant="success" className="gap-1 !text-[9px]">
            <Shield className="h-2.5 w-2.5" /> operator
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-text-2">{skill.description ?? "No description"}</p>
        {!isOperator && (
          <Button variant="ghost" size="xs"
            className="gap-1 text-text-3 hover:text-danger hover:bg-danger-subtle"
            onClick={() => onDelete(skill.id)} disabled={isDeleting}>
            <Trash2 className="h-3 w-3" />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function SkillsRoute() {
  const skillsQuery = useSkillsQuery();
  const deleteMutation = useDeleteSkillMutation();
  const skills = skillsQuery.data?.skills ?? [];

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id, mutationOpts(`Skill "${id}" deleted`));
  }, [deleteMutation]);

  return (
    <PageShell
      header={
        <PageTitle icon={<Puzzle className="h-3.5 w-3.5" />} title="Skills">
          <span className="text-xs text-text-3">{skills.length} installed</span>
        </PageTitle>
      }
    >
      {skillsQuery.isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 space-y-2">
              <Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" />
            </Card>
          ))}
        </div>
      )}
      {skillsQuery.error && <p className="text-sm text-danger">Failed to load skills.</p>}
      {!skillsQuery.isLoading && skills.length === 0 && (
        <EmptyState icon={<Puzzle />} title="No skills found" />
      )}
      <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3")}>
        {skills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} onDelete={handleDelete}
            isDeleting={deleteMutation.isPending && deleteMutation.variables === skill.id} />
        ))}
      </div>
    </PageShell>
  );
}
