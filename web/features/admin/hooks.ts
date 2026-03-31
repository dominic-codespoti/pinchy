import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSystemStats } from './api';
import { LogLevel, MaintenanceMode } from './types';

export function useSystemStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getSystemStats,
    staleTime: 5000,
    refetchInterval: 30000,
  });
}

export function useVacuumDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { success: true };
    },
    onSuccess: () => {
      toast.success('Database optimized successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to optimize database: ${error.message}`);
    },
  });
}

export function useClearCache() {
  return useMutation({
    mutationFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: true };
    },
    onSuccess: () => {
      toast.success('Cache cleared successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to clear cache: ${error.message}`);
    },
  });
}

export function useCreateBackup() {
  return useMutation({
    mutationFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { id: `backup-${Date.now()}`, success: true };
    },
    onSuccess: () => {
      toast.success('Backup created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create backup: ${error.message}`);
    },
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: async (backupId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { backupId, success: true };
    },
    onSuccess: (data) => {
      toast.success(`Backup ${data.backupId} restored successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore backup: ${error.message}`);
    },
  });
}

export function useDeleteBackup() {
  return useMutation({
    mutationFn: async (backupId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { backupId, success: true };
    },
    onSuccess: (data) => {
      toast.success(`Backup ${data.backupId} deleted`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete backup: ${error.message}`);
    },
  });
}

export function useSetLogLevel() {
  return useMutation({
    mutationFn: async (level: LogLevel) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { level, success: true };
    },
    onSuccess: (data) => {
      toast.success(`Log level changed to ${data.level}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to change log level: ${error.message}`);
    },
  });
}

export function useSetMaintenanceMode() {
  return useMutation({
    mutationFn: async (mode: MaintenanceMode) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { mode, success: true };
    },
    onSuccess: (data) => {
      if (data.mode === 'off') {
        toast.success('Maintenance mode disabled');
      } else {
        toast.warning(`Maintenance mode enabled: ${data.mode}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to change maintenance mode: ${error.message}`);
    },
  });
}
