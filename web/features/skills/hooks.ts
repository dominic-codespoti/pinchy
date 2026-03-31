/**
 * Skills feature React Query hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSkills,
  getSkillDetail,
  updateSkill,
  createSkill,
  deleteSkill,
} from './api';
import { Skill, SkillDetail, UpdateSkillInput } from './types';

export function useSkills() {
  return useQuery<Skill[], Error>({
    queryKey: ['skills'],
    queryFn: getSkills,
    staleTime: 5000,
  });
}

export function useSkillDetail(name: string) {
  return useQuery<SkillDetail, Error>({
    queryKey: ['skills', name],
    queryFn: () => getSkillDetail(name),
    staleTime: 10000,
    enabled: !!name,
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; updated: boolean },
    Error,
    { skillName: string; updates: UpdateSkillInput }
  >({
    mutationFn: ({ skillName, updates }) => updateSkill(skillName, updates),
    onSuccess: (data) => {
      toast.success(`Skill "${data.id}" updated successfully`);
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      queryClient.invalidateQueries({ queryKey: ['skills', data.id] });
    },
    onError: (error) => {
      toast.error(`Failed to update skill: ${error.message}`);
    },
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; created: boolean },
    Error,
    { name: string; description: string; instructions: string }
  >({
    mutationFn: ({ name, description, instructions }) =>
      createSkill(name, description, instructions),
    onSuccess: (data) => {
      toast.success(`Skill "${data.id}" created successfully`);
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (error) => {
      toast.error(`Failed to create skill: ${error.message}`);
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();

  return useMutation<{ status: string; name: string }, Error, string>({
    mutationFn: (skillName) => deleteSkill(skillName),
    onSuccess: (data) => {
      toast.success(`Skill "${data.name}" deleted`);
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (error) => {
      toast.error(`Failed to delete skill: ${error.message}`);
    },
  });
}
