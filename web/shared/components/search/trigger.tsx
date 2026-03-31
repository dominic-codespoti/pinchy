'use client';

import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { useCommandPalette } from '@/shared/hooks/use-search';

interface SearchTriggerProps {
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showText?: boolean;
  showShortcut?: boolean;
}

export function SearchTrigger({ 
  size = 'default', 
  showText = true,
  showShortcut = true 
}: SearchTriggerProps) {
  const { open } = useCommandPalette();

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={open}
      className="gap-2"
    >
      <Search className="h-4 w-4" />
      {showText && <span>Search</span>}
      {showShortcut && (
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      )}
    </Button>
  );
}
