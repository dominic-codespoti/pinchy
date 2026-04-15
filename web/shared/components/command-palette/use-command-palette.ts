'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCommandPalette, useRecentSearches } from '@/shared/hooks/use-search';
import { useTheme, ThemePreset } from '@/shared/providers/theme-provider';
import { toast } from 'sonner';
import { Agent } from '@/features/agents/types';
import { Session } from '@/features/sessions/types';
import { Memory } from '@/features/memories/types';
import { CommandItem, RecentCommand, CommandPaletteProps } from './types';

const RECENT_COMMANDS_KEY = 'pinchy-recent-commands';
const MAX_RECENT_COMMANDS = 8;

export function useCommandPaletteLogic({ agents = [], sessions = [], memories = [] }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen, close } = useCommandPalette();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [recentCommands, setRecentCommands] = useState<RecentCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load recent commands from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentCommand[];
        setRecentCommands(parsed);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save recent commands to localStorage
  const saveRecentCommands = useCallback((commands: RecentCommand[]) => {
    try {
      localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(commands));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const addRecentCommand = useCallback(
    (command: Omit<RecentCommand, 'timestamp'>) => {
      setRecentCommands((prev) => {
        const filtered = prev.filter((item) => item.id !== command.id);
        const newCommand: RecentCommand = {
          ...command,
          timestamp: Date.now(),
        };
        const updated = [newCommand, ...filtered].slice(0, MAX_RECENT_COMMANDS);
        saveRecentCommands(updated);
        return updated;
      });
    },
    [saveRecentCommands]
  );

  const clearRecentCommands = useCallback(() => {
    setRecentCommands([]);
    try {
      localStorage.removeItem(RECENT_COMMANDS_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const handleNavigate = useCallback(
    (href: string, commandInfo: RecentCommand) => {
      addRecentCommand(commandInfo);
      close();
      router.push(href);
    },
    [router, close, addRecentCommand]
  );

  const handleThemeChange = useCallback(
    (variant: 'light' | 'dark' | 'system') => {
      theme.setMode(variant);
      toast.success(`Theme set to ${variant}`);
      addRecentCommand({
        id: `theme-${variant}`,
        type: 'theme',
        title: `Switch to ${variant} mode`,
      });
      close();
    },
    [theme, addRecentCommand, close]
  );

  const handleThemePresetChange = useCallback(
    (preset: ThemePreset) => {
      theme.setColorTheme(preset.id);
      toast.success(`Theme changed to ${preset.name}`);
      addRecentCommand({
        id: `theme-preset-${preset.id}`,
        type: 'theme',
        title: `Apply ${preset.name} theme`,
      });
      close();
    },
    [theme, addRecentCommand, close]
  );

  const handleSelect = useCallback(
    (command: CommandItem) => {
      if (command.action) {
        command.action();
      } else if (command.href) {
        handleNavigate(command.href, {
          id: command.id,
          type: command.type,
          title: command.title,
          href: command.href,
          timestamp: Date.now(),
        });
      }
    },
    [handleNavigate]
  );

  const handleRecentSelect = useCallback(
    (recent: RecentCommand) => {
      if (recent.href) {
        close();
        router.push(recent.href);
      }
    },
    [router, close]
  );

  const showRecent = query === '' && recentCommands.length > 0;

  return {
    isOpen,
    close,
    pathname,
    query,
    setQuery,
    recentCommands,
    isLoading,
    theme,
    showRecent,
    addRecentCommand,
    clearRecentCommands,
    handleSelect,
    handleRecentSelect,
    handleThemeChange,
    handleThemePresetChange,
    agents,
    sessions,
    memories,
  };
}
