import {
  CornerDownLeft,
  LayoutDashboard,
  Bot,
  Plus,
  Settings,
  ScrollText,
  Calendar,
  Lightbulb,
  History,
  Cpu,
  Sun,
  Moon,
  Monitor,
  MessageSquare,
} from 'lucide-react';
import { CommandItem } from './types';

export function buildNavigationCommands(): CommandItem[] {
  return [
    {
      id: 'nav-dashboard',
      type: 'nav',
      title: 'Go to Dashboard',
      subtitle: 'View system overview',
      href: '/dashboard',
      icon: <LayoutDashboard className="h-4 w-4" />,
      shortcut: 'G D',
      keywords: ['home', 'main', 'overview'],
    },
    {
      id: 'nav-chat',
      type: 'nav',
      title: 'Go to Chat',
      subtitle: 'Start a conversation',
      href: '/chat',
      icon: <MessageSquare className="h-4 w-4" />,
      shortcut: 'G C',
      keywords: ['chat', 'conversation', 'message', 'talk'],
    },
    {
      id: 'nav-agents',
      type: 'nav',
      title: 'Go to Agents',
      subtitle: 'Manage your agents',
      href: '/agents',
      icon: <Bot className="h-4 w-4" />,
      shortcut: 'G A',
      keywords: ['bots', 'ai', 'assistants'],
    },
    {
      id: 'nav-sessions',
      type: 'nav',
      title: 'Go to Sessions',
      subtitle: 'View all chat sessions',
      href: '/sessions',
      icon: <History className="h-4 w-4" />,
      shortcut: 'G S',
      keywords: ['chats', 'conversations', 'history'],
    },
    {
      id: 'nav-cron',
      type: 'nav',
      title: 'Go to Cron Jobs',
      subtitle: 'Scheduled tasks',
      href: '/cron',
      icon: <Calendar className="h-4 w-4" />,
      keywords: ['schedule', 'tasks', 'jobs', 'automation'],
    },
    {
      id: 'nav-skills',
      type: 'nav',
      title: 'Go to Skills',
      subtitle: 'Manage agent skills',
      href: '/skills',
      icon: <Lightbulb className="h-4 w-4" />,
      keywords: ['abilities', 'tools', 'capabilities'],
    },
    {
      id: 'nav-logs',
      type: 'nav',
      title: 'Go to Logs',
      subtitle: 'System logs and events',
      href: '/logs',
      icon: <ScrollText className="h-4 w-4" />,
      shortcut: 'G L',
      keywords: ['events', 'errors', 'debug'],
    },
    {
      id: 'nav-settings',
      type: 'nav',
      title: 'Go to Settings',
      subtitle: 'Application settings',
      href: '/settings',
      icon: <Settings className="h-4 w-4" />,
      shortcut: 'G ,',
      keywords: ['config', 'preferences', 'options'],
    },
    {
      id: 'nav-models',
      type: 'nav',
      title: 'Go to Model Settings',
      subtitle: 'Configure AI models',
      href: '/settings/models',
      icon: <Cpu className="h-4 w-4" />,
      keywords: ['ai', 'llm', 'providers', 'openai'],
    },
  ];
}

export function buildActionCommands(): CommandItem[] {
  return [
    {
      id: 'action-create-agent',
      type: 'action',
      title: 'Create Agent',
      subtitle: 'Add a new AI agent',
      href: '/agents/new',
      icon: <Plus className="h-4 w-4" />,
      shortcut: 'C A',
      keywords: ['new', 'add', 'bot'],
    },
    {
      id: 'action-new-session',
      type: 'action',
      title: 'New Session',
      subtitle: 'Start a new chat session',
      href: '/chat',
      icon: <MessageSquare className="h-4 w-4" />,
      shortcut: 'C S',
      keywords: ['chat', 'conversation', 'start'],
    },
  ];
}

export function buildThemeCommands(
  handleThemeChange: (variant: 'light' | 'dark' | 'system') => void
): CommandItem[] {
  return [
    {
      id: 'theme-light',
      type: 'theme',
      title: 'Switch to Light Mode',
      icon: <Sun className="h-4 w-4" />,
      action: () => handleThemeChange('light'),
      keywords: ['bright', 'day', 'white'],
    },
    {
      id: 'theme-dark',
      type: 'theme',
      title: 'Switch to Dark Mode',
      icon: <Moon className="h-4 w-4" />,
      action: () => handleThemeChange('dark'),
      keywords: ['night', 'black', 'dim'],
    },
    {
      id: 'theme-system',
      type: 'theme',
      title: 'Use System Theme',
      icon: <Monitor className="h-4 w-4" />,
      action: () => handleThemeChange('system'),
      keywords: ['auto', 'default', 'os'],
    },
  ];
}

export function buildAgentCommands(
  agents: Array<{
    id: string;
    name: string;
    description?: string;
    config: { model?: string };
  }>
): CommandItem[] {
  return agents.slice(0, 8).map((agent) => ({
    id: `agent-${agent.id}`,
    type: 'agent',
    title: agent.name || agent.id,
    subtitle: agent.description || `Model: ${agent.config.model}`,
    href: `/agents/${agent.id}`,
    icon: <Bot className="h-4 w-4" />,
    keywords: ['agent', 'bot'],
  }));
}

export function buildSessionCommands(
  sessions: Array<{ id: string; agentId: string; title?: string }>
): CommandItem[] {
  return sessions.slice(0, 5).map((session) => ({
    id: `session-${session.id}`,
    type: 'session',
    title: session.title || `Session ${session.id.slice(0, 8)}`,
    subtitle: `Agent: ${session.agentId}`,
    href: `/chat?session=${session.id}`,
    icon: <MessageSquare className="h-4 w-4" />,
    keywords: ['chat', 'conversation'],
  }));
}
