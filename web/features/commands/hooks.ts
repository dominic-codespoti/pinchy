/**
 * Slash commands feature React Query hooks
 */

import { useQuery } from '@tanstack/react-query';
import { getSlashCommands } from './api';
import { SlashCommand } from './types';

export function useSlashCommands() {
  return useQuery<SlashCommand[], Error>({
    queryKey: ['slash-commands'],
    queryFn: getSlashCommands,
    staleTime: 60000,
  });
}
