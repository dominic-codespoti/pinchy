'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SHORTCUTS, matchesShortcut, type Shortcut, type ShortcutHandler } from '@/shared/lib/shortcuts';

interface UseKeyboardShortcutsOptions {
  onOpenSearch?: () => void;
  onCreateAgent?: () => void;
  onNewSession?: () => void;
  onToggleSidebar?: () => void;
  onShowShortcuts?: () => void;
  onCloseModal?: () => void;
  agents?: { id: string; name: string }[];
  isModalOpen?: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const handlersRef = useRef<Map<string, ShortcutHandler>>(new Map());
  const [isMac, setIsMac] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const optionsRef = useRef(options);
  
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMac(window.navigator.platform.toLowerCase().includes('mac'));
    }
  }, []);

  const navigateToAgent = useCallback((index: number) => {
    const agents = optionsRef.current.agents || [];
    if (index >= 0 && index < agents.length) {
      router.push(`/agents/${agents[index].id}`);
    }
  }, [router]);

  const navigateToSection = useCallback((direction: 'prev' | 'next') => {
    const sections = [
      '/dashboard',
      '/agents',
      '/chat',
      '/cron',
      '/sessions',
      '/logs',
      '/skills',
      '/settings',
    ];
    
    const currentIndex = sections.findIndex(s => pathname?.startsWith(s));
    if (currentIndex === -1) return;
    
    let newIndex: number;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : sections.length - 1;
    } else {
      newIndex = currentIndex < sections.length - 1 ? currentIndex + 1 : 0;
    }
    
    router.push(sections[newIndex]);
  }, [pathname, router]);

  const registerHandler = useCallback((shortcutId: string, handler: ShortcutHandler) => {
    handlersRef.current.set(shortcutId, handler);
    return () => {
      handlersRef.current.delete(shortcutId);
    };
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable;
    
    if (isInput && !event.metaKey && !event.ctrlKey) {
      if (event.key === 'Escape') {
        (target as HTMLInputElement | HTMLTextAreaElement).blur();
        return;
      }
      return;
    }

    const matchingShortcuts = SHORTCUTS
      .filter(s => matchesShortcut(event, s))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    if (matchingShortcuts.length === 0) return;

    const shortcut = matchingShortcuts[0];
    
    const customHandler = handlersRef.current.get(shortcut.id);
    if (customHandler) {
      if (shortcut.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }
      customHandler(shortcut);
      return;
    }

    switch (shortcut.id) {
      case 'open-search':
        event.preventDefault();
        event.stopPropagation();
        setIsSearchOpen(true);
        optionsRef.current.onOpenSearch?.();
        break;
        
      case 'create-agent':
        event.preventDefault();
        event.stopPropagation();
        optionsRef.current.onCreateAgent?.();
        if (!optionsRef.current.onCreateAgent) {
          router.push('/agents');
        }
        break;
        
      case 'new-session':
        event.preventDefault();
        event.stopPropagation();
        optionsRef.current.onNewSession?.();
        break;
        
      case 'toggle-sidebar':
        event.preventDefault();
        event.stopPropagation();
        optionsRef.current.onToggleSidebar?.();
        break;
        
      case 'show-shortcuts':
        event.preventDefault();
        event.stopPropagation();
        setIsShortcutsModalOpen(true);
        optionsRef.current.onShowShortcuts?.();
        break;
        
      case 'close-modal':
        if (options.isModalOpen || isShortcutsModalOpen || isSearchOpen) {
          if (isShortcutsModalOpen) {
            setIsShortcutsModalOpen(false);
          }
          if (isSearchOpen) {
            setIsSearchOpen(false);
          }
          optionsRef.current.onCloseModal?.();
        }
        break;
        
      case 'go-to-logs':
        event.preventDefault();
        event.stopPropagation();
        router.push('/logs');
        break;
        
      case 'go-to-settings':
        event.preventDefault();
        event.stopPropagation();
        router.push('/settings');
        break;
        
      case 'previous-section':
        event.preventDefault();
        event.stopPropagation();
        navigateToSection('prev');
        break;
        
      case 'next-section':
        event.preventDefault();
        event.stopPropagation();
        navigateToSection('next');
        break;
        
      case 'navigate-agent-1':
      case 'navigate-agent-2':
      case 'navigate-agent-3':
      case 'navigate-agent-4':
      case 'navigate-agent-5':
      case 'navigate-agent-6':
      case 'navigate-agent-7':
      case 'navigate-agent-8':
      case 'navigate-agent-9':
        event.preventDefault();
        event.stopPropagation();
        const agentIndex = parseInt(shortcut.id.split('-')[2]) - 1;
        navigateToAgent(agentIndex);
        break;
    }
  }, [navigateToAgent, navigateToSection, router, options.isModalOpen, isShortcutsModalOpen, isSearchOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [handleKeyDown]);

  return {
    isMac,
    registerHandler,
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
    isSearchOpen,
    setIsSearchOpen,
  };
}

export function useKeyboardShortcut(shortcutId: string, handler: ShortcutHandler) {
  const { registerHandler } = useKeyboardShortcuts({});
  
  useEffect(() => {
    return registerHandler(shortcutId, handler);
  }, [shortcutId, handler, registerHandler]);
}
