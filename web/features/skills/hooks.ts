/**
 * Skills feature React Query hooks
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { MutationOptions } from '@/shared/types/mutation';
import { createMutationHook } from '@/shared/hooks/create-mutation-hook';
import {
  getSkills,
  getSkillDetail,
  updateSkill,
  createSkill,
  deleteSkill,
} from './api';
import { Skill, SkillDetail, UpdateSkillInput } from './types';
import { skillsKeys } from './query-keys';

export function useSkills() {
  return useQuery<Skill[], Error>({
    queryKey: skillsKeys.lists(),
    queryFn: getSkills,
    staleTime: STALE_TIME.SHORT,
  });
}

export function useSkillDetail(name: string) {
  return useQuery<SkillDetail, Error>({
    queryKey: skillsKeys.detail(name),
    queryFn: () => getSkillDetail(name),
    staleTime: STALE_TIME.MEDIUM,
    enabled: !!name,
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();

  // Note: This mutation has a custom success message with dynamic data
  // and multiple query key invalidations, so it's not using the factory
  return useMutation<
    { id: string; updated: boolean },
    Error,
    { skillName: string; updates: UpdateSkillInput }
  >({
    mutationFn: ({ skillName, updates }) => updateSkill(skillName, updates),
    onSuccess: (data) => {
      toast.success(`Skill "${data.id}" updated successfully`);
      queryClient.invalidateQueries({ queryKey: skillsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: skillsKeys.detail(data.id) });
    },
    onError: (error) => {
      toast.error(`Failed to update skill: ${error.message}`);
    },
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();

  // Note: This mutation has a custom success message with dynamic data
  // so it's not using the factory
  return useMutation<
    { id: string; created: boolean },
    Error,
    { name: string; description: string; instructions: string }
  >({
    mutationFn: ({ name, description, instructions }) =>
      createSkill(name, description, instructions),
    onSuccess: (data) => {
      toast.success(`Skill "${data.id}" created successfully`);
      queryClient.invalidateQueries({ queryKey: skillsKeys.lists() });
    },
    onError: (error) => {
      toast.error(`Failed to create skill: ${error.message}`);
    },
  });
}

export const useDeleteSkill = createMutationHook<
  { status: string; name: string },
  Error,
  string
>({
  mutationFn: deleteSkill,
  successMessage: 'Skill deleted successfully',
  errorPrefix: 'Failed to delete skill',
  queryKeysToInvalidate: [skillsKeys.lists()],
});
