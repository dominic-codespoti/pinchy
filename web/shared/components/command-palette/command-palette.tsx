'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CommandPaletteProps } from './types';
import { useCommandPaletteLogic } from './use-command-palette';
import {
  buildNavigationCommands,
  buildActionCommands,
  buildThemeCommands,
  buildAgentCommands,
  buildSessionCommands,
} from './command-builders';
import {
  RecentCommandsGroup,
  NavigationCommandsGroup,
  ActionCommandsGroup,
  ThemeCommandsGroup,
  AgentCommandsGroup,
  SessionCommandsGroup,
} from './command-renderer';

export function CommandPalette({ agents = [], sessions = [], memories = [] }: CommandPaletteProps) {
  const {
    isOpen,
    close,
    pathname,
    query,
    setQuery,
    recentCommands,
    showRecent,
    theme,
    clearRecentCommands,
    handleSelect,
    handleRecentSelect,
    handleThemeChange,
  } = useCommandPaletteLogic({ agents, sessions, memories });

  const navCommands = buildNavigationCommands();
  const actionCommands = buildActionCommands();
  const themeCommands = buildThemeCommands(handleThemeChange);
  const agentCommands = buildAgentCommands(agents);
  const sessionCommands = buildSessionCommands(sessions);

  const filterCommands = (cmds: typeof navCommands) => {
    if (!query.trim()) return cmds;
    const searchLower = query.toLowerCase();
    return cmds.filter((cmd) => {
      const matchesTitle = cmd.title.toLowerCase().includes(searchLower);
      const matchesSubtitle = cmd.subtitle?.toLowerCase().includes(searchLower);
      const matchesKeywords = cmd.keywords?.some((k) => k.toLowerCase().includes(searchLower));
      const matchesType = cmd.type.toLowerCase().includes(searchLower);
      return matchesTitle || matchesSubtitle || matchesKeywords || matchesType;
    });
  };

  const filteredNavCommands = filterCommands(navCommands);
  const filteredActionCommands = filterCommands(actionCommands);
  const filteredThemeCommands = filterCommands(themeCommands);
  const filteredAgentCommands = filterCommands(agentCommands);
  const filteredSessionCommands = filterCommands(sessionCommands);

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder="Search commands, agents, sessions, or navigate..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          <div className="py-6 text-center text-sm">
            <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>No results found for &quot;{query}&quot;</p>
            <p className="text-muted-foreground text-xs mt-1">
              Try different keywords or check spelling
            </p>
          </div>
        </CommandEmpty>

        {showRecent && (
          <RecentCommandsGroup
            recentCommands={recentCommands}
            onSelect={handleRecentSelect}
            onClear={clearRecentCommands}
          />
        )}

        {showRecent && (
          (filteredNavCommands.length > 0 || filteredActionCommands.length > 0) && <CommandSeparator />
        )}

        <NavigationCommandsGroup
          commands={filteredNavCommands}
          pathname={pathname}
          onSelect={handleSelect}
        />

        <ActionCommandsGroup
          commands={filteredActionCommands}
          onSelect={handleSelect}
        />

        <ThemeCommandsGroup
          commands={filteredThemeCommands}
          currentTheme={theme.theme}
          currentColorThemeId={theme.colorTheme.id}
          onSelect={handleSelect}
        />

        <AgentCommandsGroup
          commands={filteredAgentCommands}
          onSelect={handleSelect}
        />

        <SessionCommandsGroup
          commands={filteredSessionCommands}
          onSelect={handleSelect}
        />
      </CommandList>

      <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-2">
          <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">↑↓</kbd>
          <span>Navigate</span>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">↵</kbd>
          <span>Select</span>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">Esc</kbd>
          <span>Close</span>
        </div>
      </div>
    </CommandDialog>
  );
}
