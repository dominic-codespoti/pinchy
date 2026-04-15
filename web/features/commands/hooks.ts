'use client';

/**
 * Slash commands feature React Query hooks
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { getSlashCommands } from './api';
import { SlashCommand } from './types';

export function useSlashCommands() {
  const { data, isLoading, error } = useQuery<SlashCommand[], Error>({
    queryKey: ['slash-commands'],
    queryFn: getSlashCommands,
    staleTime: STALE_TIME.LONG,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load slash commands: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}
