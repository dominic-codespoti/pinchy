'use client';

import { useState, createContext, useContext, ReactNode } from 'react';
import { useKeyboardShortcuts as useKeyboardShortcutsHook } from '@/shared/hooks/use-keyboard-shortcuts';
import { ShortcutsHelpModal } from './shortcuts-help-modal';

interface KeyboardShortcutsContextValue {
  isMac: boolean;
  isShortcutsModalOpen: boolean;
  setIsShortcutsModalOpen: (open: boolean) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useKeyboardShortcutsContext() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcutsContext must be used within KeyboardShortcutsProvider');
  }
  return context;
}

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const isModalOpen = isShortcutsModalOpen || isSearchOpen;

  const {
    isMac,
  } = useKeyboardShortcutsHook({
    onOpenSearch: () => setIsSearchOpen(true),
    onShowShortcuts: () => setIsShortcutsModalOpen(true),
    onCloseModal: () => {
      setIsSearchOpen(false);
      setIsShortcutsModalOpen(false);
    },
    isModalOpen,
  });

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        isMac,
        isShortcutsModalOpen,
        setIsShortcutsModalOpen,
        isSearchOpen,
        setIsSearchOpen,
      }}
    >
      {children}
      <ShortcutsHelpModal
        open={isShortcutsModalOpen}
        onOpenChange={setIsShortcutsModalOpen}
        isMac={isMac}
      />
    </KeyboardShortcutsContext.Provider>
  );
}
