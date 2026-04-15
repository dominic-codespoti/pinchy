'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  useMemo,
} from 'react';
import { Agent, Session, Memory } from '@/features/agents/types';

export type SearchResultType = 'agent' | 'session' | 'memory' | 'file' | 'command';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  href: string;
  icon: string;
}

export interface RecentSearch {
  id: string;
  type: SearchResultType;
  title: string;
  href: string;
  timestamp: number;
}

interface SearchContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  query: string;
  setQuery: (query: string) => void;
  recentSearches: RecentSearch[];
  addRecentSearch: (search: Omit<RecentSearch, 'timestamp'>) => void;
  clearRecentSearches: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

const STORAGE_KEY = 'pinchy-recent-searches';
const MAX_RECENT_SEARCHES = 10;

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentSearch[];
        setRecentSearches(parsed);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save recent searches to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSearches));
    } catch {
      // Ignore localStorage errors
    }
  }, [recentSearches]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const addRecentSearch = useCallback(
    (search: Omit<RecentSearch, 'timestamp'>) => {
      setRecentSearches((prev) => {
        // Remove duplicate if exists
        const filtered = prev.filter(
          (item) => !(item.id === search.id && item.type === search.type)
        );
        // Add new search at the beginning
        const newSearch: RecentSearch = {
          ...search,
          timestamp: Date.now(),
        };
        const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        return updated;
      });
    },
    []
  );

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggle, close]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      query,
      setQuery,
      recentSearches,
      addRecentSearch,
      clearRecentSearches,
    }),
    [isOpen, open, close, toggle, query, recentSearches, addRecentSearch, clearRecentSearches]
  );

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useCommandPalette must be used within a SearchProvider');
  }
  return {
    isOpen: context.isOpen,
    open: context.open,
    close: context.close,
    toggle: context.toggle,
  };
}

export function useRecentSearches() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useRecentSearches must be used within a SearchProvider');
  }
  return {
    recentSearches: context.recentSearches,
    addRecentSearch: context.addRecentSearch,
    clearRecentSearches: context.clearRecentSearches,
  };
}

export interface SearchData {
  agents: Agent[];
  sessions: Session[];
  memories: Memory[];
}

export function useSearchResults(query: string, data: SearchData) {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const { agents, sessions, memories } = data;

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);

    // Debounce search
    const timer = setTimeout(() => {
      const searchLower = query.toLowerCase();
      const searchResults: SearchResult[] = [];

      // Search agents
      agents.forEach((agent) => {
        if (
          agent.id.toLowerCase().includes(searchLower) ||
          agent.name.toLowerCase().includes(searchLower) ||
          agent.description?.toLowerCase().includes(searchLower)
        ) {
          searchResults.push({
            id: agent.id,
            type: 'agent',
            title: agent.name || agent.id,
            subtitle: agent.description || `Model: ${agent.config.model}`,
            href: `/agents/${agent.id}`,
            icon: 'bot',
          });
        }
      });

      // Search sessions
      sessions.forEach((session) => {
        if (
          session.id.toLowerCase().includes(searchLower) ||
          session.title?.toLowerCase().includes(searchLower) ||
          session.agentId.toLowerCase().includes(searchLower)
        ) {
          searchResults.push({
            id: session.id,
            type: 'session',
            title: session.title || `Session ${session.id.slice(0, 8)}`,
            subtitle: `Agent: ${session.agentId}`,
            href: `/chat?session=${session.id}`,
            icon: 'message-square',
          });
        }
      });

      // Search memories
      memories.forEach((memory) => {
        if (memory.content.toLowerCase().includes(searchLower)) {
          searchResults.push({
            id: memory.id,
            type: 'memory',
            title:
              memory.content.slice(0, 60) +
              (memory.content.length > 60 ? '...' : ''),
            subtitle: `Agent: ${memory.agentId}`,
            href: `/agents/${memory.agentId}?tab=memories`,
            icon: 'brain',
          });
        }
      });

      // Static commands
      const commands: Omit<SearchResult, 'id'>[] = [
        {
          type: 'command',
          title: 'New Agent',
          subtitle: 'Create a new agent',
          href: '/agents/new',
          icon: 'plus',
        },
        {
          type: 'command',
          title: 'Settings',
          subtitle: 'Manage application settings',
          href: '/settings',
          icon: 'settings',
        },
        {
          type: 'command',
          title: 'Logs',
          subtitle: 'View system logs',
          href: '/logs',
          icon: 'scroll-text',
        },
        {
          type: 'command',
          title: 'Sessions',
          subtitle: 'View all sessions',
          href: '/sessions',
          icon: 'history',
        },
        {
          type: 'command',
          title: 'Skills',
          subtitle: 'Manage agent skills',
          href: '/skills',
          icon: 'lightbulb',
        },
      ];

      commands.forEach((cmd, index) => {
        if (
          cmd.title.toLowerCase().includes(searchLower) ||
          cmd.subtitle?.toLowerCase().includes(searchLower)
        ) {
          searchResults.push({
            ...cmd,
            id: `cmd-${index}`,
          });
        }
      });

      setResults(searchResults);
      setIsLoading(false);
    }, 150);

    return () => clearTimeout(timer);
  }, [query, agents, sessions, memories]);

  return { results, isLoading };
}
