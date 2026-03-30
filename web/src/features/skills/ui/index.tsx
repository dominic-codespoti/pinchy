import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Puzzle } from "lucide-react";

import { getSkills, deleteSkill, queryKeys } from "@/shared/api/client";
import { SkillsHeader, SkillCardSkeleton } from "./SkillsHeader";
import { SkillCard } from "./SkillCard";

export function SkillsRoute() {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({ queryKey: queryKeys.skills, queryFn: getSkills });
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteSkill(name),
    onSuccess: () => {
      setConfirmDelete(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.skills });
    },
  });

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      <SkillsHeader
        skillCount={skillsQuery.data?.skills.length ?? 0}
        isFetching={skillsQuery.isFetching}
        onRefresh={() => void skillsQuery.refetch()}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-5">
          {skillsQuery.isLoading && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <SkillCardSkeleton key={i} />)}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {(skillsQuery.data?.skills ?? []).map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isExpanded={expandedSkill === skill.id}
                isConfirmingDelete={confirmDelete === skill.id}
                onToggle={() => setExpandedSkill(expandedSkill === skill.id ? null : skill.id)}
                onDelete={() => deleteMutation.mutate(skill.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>

          {skillsQuery.error && (
            <p className="text-sm text-rose-300 mt-4">Failed to load skills.</p>
          )}
          {!skillsQuery.data?.skills.length && !skillsQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Puzzle className="h-8 w-8 text-slate-700 mb-3" />
              <p className="text-sm text-slate-400">No skills found</p>
              <p className="text-xs text-slate-600 mt-1">Install or author skills to extend agent capabilities.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
