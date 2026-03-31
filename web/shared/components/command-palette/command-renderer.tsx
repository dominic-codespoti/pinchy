import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Clock, Palette, ArrowRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CommandItem as CommandItemType, RecentCommand } from './types';

interface RecentCommandsGroupProps {
  recentCommands: RecentCommand[];
  onSelect: (recent: RecentCommand) => void;
  onClear: () => void;
}

export function RecentCommandsGroup({ recentCommands, onSelect, onClear }: RecentCommandsGroupProps) {
  if (recentCommands.length === 0) return null;

  return (
    <CommandGroup heading="Recent">
      {recentCommands.slice(0, 5).map((recent) => (
        <CommandItem
          key={`recent-${recent.id}`}
          onSelect={() => onSelect(recent)}
          className="gap-2"
        >
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">{recent.title}</span>
          <Badge variant="secondary" className="text-xs capitalize">
            {recent.type}
          </Badge>
          <CommandShortcut>
            <Clock className="h-3 w-3" />
          </CommandShortcut>
        </CommandItem>
      ))}
      {recentCommands.length > 0 && (
        <CommandItem onSelect={onClear} className="text-muted-foreground text-xs">
          Clear recent commands
        </CommandItem>
      )}
    </CommandGroup>
  );
}

interface NavigationCommandsGroupProps {
  commands: CommandItemType[];
  pathname: string;
  onSelect: (command: CommandItemType) => void;
}

export function NavigationCommandsGroup({ commands, pathname, onSelect }: NavigationCommandsGroupProps) {
  if (commands.length === 0) return null;

  return (
    <CommandGroup heading="Navigation">
      {commands.map((command) => (
        <CommandItem
          key={command.id}
          onSelect={() => onSelect(command)}
          className={cn('gap-2', pathname === command.href && 'bg-accent text-accent-foreground')}
        >
          {command.icon}
          <span className="flex-1">{command.title}</span>
          {command.subtitle && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{command.subtitle}</span>
          )}
          {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

interface ActionCommandsGroupProps {
  commands: CommandItemType[];
  onSelect: (command: CommandItemType) => void;
}

export function ActionCommandsGroup({ commands, onSelect }: ActionCommandsGroupProps) {
  if (commands.length === 0) return null;

  return (
    <CommandGroup heading="Actions">
      {commands.map((command) => (
        <CommandItem key={command.id} onSelect={() => onSelect(command)} className="gap-2">
          {command.icon}
          <span className="flex-1">{command.title}</span>
          {command.subtitle && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{command.subtitle}</span>
          )}
          {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
          <CommandShortcut><Clock className="h-3 w-3" /></CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

interface ThemeCommandsGroupProps {
  commands: CommandItemType[];
  currentTheme: string;
  currentColorThemeId: string;
  onSelect: (command: CommandItemType) => void;
}

export function ThemeCommandsGroup({ commands, currentTheme, currentColorThemeId, onSelect }: ThemeCommandsGroupProps) {
  const themeCommands = commands.filter((c) => c.id.startsWith('theme-') && !c.id.startsWith('theme-preset-'));
  const presetCommands = commands.filter((c) => c.id.startsWith('theme-preset-'));

  if (themeCommands.length === 0 && presetCommands.length === 0) return null;

  return (
    <CommandGroup heading="Theme">
      {themeCommands.map((command) => (
        <CommandItem key={command.id} onSelect={() => onSelect(command)} className="gap-2">
          {command.icon}
          <span className="flex-1">{command.title}</span>
          {currentTheme === command.id.replace('theme-', '') && (
            <Badge variant="default" className="text-xs">Active</Badge>
          )}
        </CommandItem>
      ))}
      {presetCommands.length > 0 && <CommandSeparator className="my-1" />}
      {presetCommands.slice(0, 4).map((command) => (
        <CommandItem key={command.id} onSelect={() => onSelect(command)} className="gap-2">
          <Palette className="h-4 w-4" />
          <span className="flex-1">{command.title}</span>
          {currentColorThemeId === command.id.replace('theme-preset-', '') && (
            <Badge variant="default" className="text-xs">Active</Badge>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

interface AgentCommandsGroupProps {
  commands: CommandItemType[];
  onSelect: (command: CommandItemType) => void;
}

export function AgentCommandsGroup({ commands, onSelect }: AgentCommandsGroupProps) {
  if (commands.length === 0) return null;

  return (
    <CommandGroup heading="Agents">
      {commands.map((command) => (
        <CommandItem key={command.id} onSelect={() => onSelect(command)} className="gap-2">
          {command.icon}
          <span className="flex-1">{command.title}</span>
          {command.subtitle && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{command.subtitle}</span>
          )}
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

interface SessionCommandsGroupProps {
  commands: CommandItemType[];
  onSelect: (command: CommandItemType) => void;
}

export function SessionCommandsGroup({ commands, onSelect }: SessionCommandsGroupProps) {
  if (commands.length === 0) return null;

  return (
    <CommandGroup heading="Sessions">
      {commands.map((command) => (
        <CommandItem key={command.id} onSelect={() => onSelect(command)} className="gap-2">
          {command.icon}
          <span className="flex-1 truncate max-w-xs">{command.title}</span>
          {command.subtitle && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{command.subtitle}</span>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
