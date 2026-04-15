/**
 * Slash commands feature - vertical slice
 *
 * Discovery and help UI for slash commands
 */

export { CommandsPage } from './components/commands-page';

// Types
export type { SlashCommand } from './types';

// API
export { getSlashCommands } from './api';

// Hooks
export { useSlashCommands } from './hooks';
