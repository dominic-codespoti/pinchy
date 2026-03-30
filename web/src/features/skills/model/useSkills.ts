import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSkills, deleteSkill, queryKeys } from "@/shared/api/client";

export function useSkills() {
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

  return {
    skillsQuery,
    deleteMutation,
    expandedSkill,
    setExpandedSkill,
    confirmDelete,
    setConfirmDelete,
  };
}