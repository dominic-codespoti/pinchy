/**
 * Command palette types - shared across command palette components
 */

export type CommandType = 'nav' | 'agent' | 'session' | 'memory' | 'action' | 'theme' | 'search';

export interface CommandItem {
  id: string;
  type: CommandType;
  title: string;
  subtitle?: string;
  href?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action?: () => void;
  keywords?: string[];
}

export interface RecentCommand {
  id: string;
  type: CommandType;
  title: string;
  href?: string;
  timestamp: number;
}

export interface CommandPaletteProps {
  agents?: Array<{
    id: string;
    name: string;
    description?: string;
    config: {
      model?: string;
    };
  }>;
  sessions?: Array<{
    id: string;
    agentId: string;
    title?: string;
  }>;
  memories?: Array<{
    id: string;
    content: string;
  }>;
}
