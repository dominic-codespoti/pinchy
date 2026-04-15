'use client';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { useCommandPalette } from '@/shared/hooks/use-search';
import { cn } from '@/shared/lib/utils';

interface SearchTriggerProps {
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  showText?: boolean;
  showShortcut?: boolean;
  className?: string;
}

export function SearchTrigger({ 
  size = 'default', 
  variant = 'ghost',
  showText = true,
  showShortcut = true,
  className,
}: SearchTriggerProps) {
  const { open } = useCommandPalette();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={open}
      className={cn('gap-2', className)}
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
