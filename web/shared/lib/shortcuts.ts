export interface Shortcut {
  id: string;
  key: string;
  modifiers?: {
    meta?: boolean;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  };
  description: string;
  category: 'navigation' | 'agents' | 'general' | 'view';
  priority?: number;
  preventDefault?: boolean;
  handler?: () => void;
}

export type ShortcutHandler = (shortcut: Shortcut) => void;

export const SHORTCUTS: Shortcut[] = [
  {
    id: 'open-search',
    key: 'k',
    modifiers: { meta: true },
    description: 'Open search/command palette',
    category: 'general',
    priority: 100,
    preventDefault: true,
  },
  {
    id: 'create-agent',
    key: 'n',
    modifiers: { meta: true },
    description: 'Create new agent',
    category: 'agents',
    priority: 90,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-1',
    key: '1',
    modifiers: { meta: true },
    description: 'Navigate to agent 1',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-2',
    key: '2',
    modifiers: { meta: true },
    description: 'Navigate to agent 2',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-3',
    key: '3',
    modifiers: { meta: true },
    description: 'Navigate to agent 3',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-4',
    key: '4',
    modifiers: { meta: true },
    description: 'Navigate to agent 4',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-5',
    key: '5',
    modifiers: { meta: true },
    description: 'Navigate to agent 5',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-6',
    key: '6',
    modifiers: { meta: true },
    description: 'Navigate to agent 6',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-7',
    key: '7',
    modifiers: { meta: true },
    description: 'Navigate to agent 7',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-8',
    key: '8',
    modifiers: { meta: true },
    description: 'Navigate to agent 8',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'navigate-agent-9',
    key: '9',
    modifiers: { meta: true },
    description: 'Navigate to agent 9',
    category: 'agents',
    priority: 80,
    preventDefault: true,
  },
  {
    id: 'show-shortcuts',
    key: '/',
    modifiers: { meta: true },
    description: 'Open keyboard shortcuts help',
    category: 'general',
    priority: 100,
    preventDefault: true,
  },
  {
    id: 'new-session',
    key: 'n',
    modifiers: { meta: true, shift: true },
    description: 'New session',
    category: 'agents',
    priority: 85,
    preventDefault: true,
  },
  {
    id: 'previous-section',
    key: '[',
    modifiers: { meta: true },
    description: 'Previous page/section',
    category: 'navigation',
    priority: 70,
    preventDefault: true,
  },
  {
    id: 'next-section',
    key: ']',
    modifiers: { meta: true },
    description: 'Next page/section',
    category: 'navigation',
    priority: 70,
    preventDefault: true,
  },
  {
    id: 'close-modal',
    key: 'Escape',
    description: 'Close modals/panels',
    category: 'general',
    priority: 1000,
    preventDefault: false,
  },
  {
    id: 'go-to-logs',
    key: 'l',
    modifiers: { meta: true, shift: true },
    description: 'Go to logs',
    category: 'navigation',
    priority: 75,
    preventDefault: true,
  },
  {
    id: 'go-to-settings',
    key: 's',
    modifiers: { meta: true, shift: true },
    description: 'Go to settings',
    category: 'navigation',
    priority: 75,
    preventDefault: true,
  },
  {
    id: 'toggle-sidebar',
    key: 'b',
    modifiers: { meta: true },
    description: 'Toggle sidebar',
    category: 'view',
    priority: 90,
    preventDefault: true,
  },
];

export function getShortcutDisplayKey(key: string): string {
  const keyMap: Record<string, string> = {
    'Escape': 'Esc',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Enter': '↵',
    'Tab': '⇥',
    'Backspace': '⌫',
    'Delete': 'Del',
  };
  return keyMap[key] || key.toUpperCase();
}

export function getModifierSymbol(modifier: string, isMac: boolean): string {
  if (isMac) {
    switch (modifier) {
      case 'meta': return '⌘';
      case 'ctrl': return '⌃';
      case 'shift': return '⇧';
      case 'alt': return '⌥';
    }
  } else {
    switch (modifier) {
      case 'meta': return 'Win';
      case 'ctrl': return 'Ctrl';
      case 'shift': return 'Shift';
      case 'alt': return 'Alt';
    }
  }
  return modifier;
}

export function formatShortcut(shortcut: Shortcut, isMac: boolean): string {
  const parts: string[] = [];
  
  if (shortcut.modifiers) {
    if (shortcut.modifiers.meta) parts.push(getModifierSymbol('meta', isMac));
    if (shortcut.modifiers.ctrl) parts.push(getModifierSymbol('ctrl', isMac));
    if (shortcut.modifiers.shift) parts.push(getModifierSymbol('shift', isMac));
    if (shortcut.modifiers.alt) parts.push(getModifierSymbol('alt', isMac));
  }
  
  parts.push(getShortcutDisplayKey(shortcut.key));
  return parts.join(' ');
}

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  if (event.key !== shortcut.key && event.code !== `Key${shortcut.key.toUpperCase()}`) {
    if (shortcut.key.length === 1) {
      if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
    } else {
      return false;
    }
  }
  
  if (shortcut.modifiers) {
    const hasMeta = event.metaKey || event.ctrlKey;
    const hasCtrl = event.ctrlKey;
    const hasShift = event.shiftKey;
    const hasAlt = event.altKey;
    
    if (shortcut.modifiers.meta && !hasMeta) return false;
    if (shortcut.modifiers.ctrl && !hasCtrl) return false;
    if (shortcut.modifiers.shift && !hasShift) return false;
    if (shortcut.modifiers.alt && !hasAlt) return false;
    
    if (!shortcut.modifiers.meta && hasMeta && shortcut.key !== 'Escape') return false;
    if (!shortcut.modifiers.ctrl && hasCtrl && shortcut.key !== 'Escape') return false;
    if (!shortcut.modifiers.shift && hasShift && shortcut.key !== 'Escape') return false;
    if (!shortcut.modifiers.alt && hasAlt && shortcut.key !== 'Escape') return false;
  } else {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }
  }
  
  return true;
}

export function getShortcutsByCategory(category: Shortcut['category']): Shortcut[] {
  return SHORTCUTS.filter(s => s.category === category);
}

export const CATEGORY_LABELS: Record<Shortcut['category'], string> = {
  navigation: 'Navigation',
  agents: 'Agents',
  general: 'General',
  view: 'View',
};
