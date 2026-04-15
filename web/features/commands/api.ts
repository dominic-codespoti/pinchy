/**
 * Slash commands feature API functions
 */

import { fetchApi } from '@/shared/api/client';
import { SlashCommand } from './types';

export async function getSlashCommands(): Promise<SlashCommand[]> {
  const response = await fetchApi<{ commands: SlashCommand[] }>('/api/slash/commands');
  return response.commands;
}
