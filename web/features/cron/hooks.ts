/**
 * Cron feature React Query hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { MutationOptions } from '@/shared/types/mutation';
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

export function useCronJobs() {
  return useQuery<CronJob[], Error>({
    queryKey: ['cron'],
    queryFn: getCronJobs,
    staleTime: STALE_TIME.SHORT,
  });
}

export function useCronAgents() {
  return useQuery<{ id: string; name: string }[], Error>({
    queryKey: ['cron', 'agents'],
    queryFn: getCronAgents,
    staleTime: STALE_TIME.SHORT,
  });
}

export function useCreateCronJob(options?: MutationOptions<CronJob, Error>) {
  const queryClient = useQueryClient();

  return useMutation<CronJob, Error, CreateCronJobInput>({
    mutationFn: createCronJob,
    onSuccess: (data) => {
      toast.success('Cron job created successfully');
      queryClient.invalidateQueries({ queryKey: ['cron'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(`Failed to create cron job: ${error.message}`);
      options?.onError?.(error);
    },
  });
}

export function useUpdateCronJob(options?: MutationOptions<CronJob, Error>) {
  const queryClient = useQueryClient();

  return useMutation<CronJob, Error, { id: string; data: UpdateCronJobInput }>({
    mutationFn: ({ id, data }) => updateCronJob(id, data),
    onSuccess: (data) => {
      toast.success('Cron job updated successfully');
      queryClient.invalidateQueries({ queryKey: ['cron'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(`Failed to update cron job: ${error.message}`);
      options?.onError?.(error);
    },
  });
}

export function useDeleteCronJob(options?: MutationOptions<void, Error>) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteCronJob,
    onSuccess: () => {
      toast.success('Cron job deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['cron'] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to delete cron job: ${error.message}`);
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
      queryClient.invalidateQueries({ queryKey: ['cron'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(`Failed to toggle cron job: ${error.message}`);
      options?.onError?.(error);
    },
  });
}

export function useTriggerCronJob(options?: MutationOptions<void, Error>) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (jobId) => triggerJob(jobId),
    onSuccess: () => {
      toast.success('Cron job triggered successfully');
      queryClient.invalidateQueries({ queryKey: ['cron'] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to trigger cron job: ${error.message}`);
      options?.onError?.(error);
    },
  });
}
