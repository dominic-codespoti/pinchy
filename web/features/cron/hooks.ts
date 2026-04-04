/**
 * Cron feature React Query hooks
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { MutationOptions } from '@/shared/types/mutation';
import { createMutationHook } from '@/shared/hooks/create-mutation-hook';
import {
  getCronJobs,
  getCronAgents,
  createCronJob,
  updateCronJob,
  deleteCronJob,
  toggleCronJob,
  triggerJob,
} from './api';
import { CronJob, CreateCronJobInput, UpdateCronJobInput } from './types';
import { cronKeys } from './query-keys';

export function useCronJobs() {
  return useQuery<CronJob[], Error>({
    queryKey: cronKeys.lists(),
    queryFn: getCronJobs,
    staleTime: STALE_TIME.SHORT,
  });
}

export function useCronAgents() {
  return useQuery<{ id: string; name: string }[], Error>({
    queryKey: cronKeys.agents(),
    queryFn: getCronAgents,
    staleTime: STALE_TIME.SHORT,
  });
}

export const useCreateCronJob = createMutationHook<CronJob, Error, CreateCronJobInput>({
  mutationFn: createCronJob,
  successMessage: 'Cron job created successfully',
  errorPrefix: 'Failed to create cron job',
  queryKeysToInvalidate: [cronKeys.lists()],
});

export const useDeleteCronJob = createMutationHook<void, Error, string>({
  mutationFn: deleteCronJob,
  successMessage: 'Cron job deleted successfully',
  errorPrefix: 'Failed to delete cron job',
  queryKeysToInvalidate: [cronKeys.lists()],
});

export const useTriggerCronJob = createMutationHook<void, Error, string>({
  mutationFn: triggerJob,
  successMessage: 'Cron job triggered successfully',
  errorPrefix: 'Failed to trigger cron job',
  queryKeysToInvalidate: [cronKeys.lists()],
});

// These mutations have more complex variable patterns and are kept as regular hooks
export function useUpdateCronJob(options?: MutationOptions<CronJob, Error>) {
  const queryClient = useQueryClient();

  return useMutation<CronJob, Error, { id: string; data: UpdateCronJobInput }>({
    mutationFn: ({ id, data }) => updateCronJob(id, data),
    onSuccess: (data) => {
      toast.success('Cron job updated successfully');
      queryClient.invalidateQueries({ queryKey: cronKeys.lists() });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(`Failed to update cron job: ${error.message}`);
      options?.onError?.(error);
    },
  });
}

export function useToggleCronJob(options?: MutationOptions<CronJob, Error>) {
  const queryClient = useQueryClient();

  return useMutation<CronJob, Error, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) => toggleCronJob(id, enabled),
    onSuccess: (data) => {
      toast.success(`Cron job ${data.lastStatus ? 'enabled' : 'disabled'}`);
      queryClient.invalidateQueries({ queryKey: cronKeys.lists() });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(`Failed to toggle cron job: ${error.message}`);
      options?.onError?.(error);
    },
  });
}
