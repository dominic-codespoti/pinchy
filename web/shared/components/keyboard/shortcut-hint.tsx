'use client';

import { cn } from '@/shared/lib/utils';
import { Kbd } from './kbd';
import { formatShortcut, type Shortcut } from '@/shared/lib/shortcuts';

interface ShortcutHintProps {
  shortcut: Shortcut | string;
  isMac?: boolean;
  showIcon?: boolean;
  className?: string;
  variant?: 'inline' | 'badge' | 'tooltip';
  children?: React.ReactNode;
}

export function ShortcutHint({ 
  shortcut,
  isMac = false,
  showIcon = true,
  className,
  variant = 'inline',
  children
}: ShortcutHintProps) {
  let formatted: string;
  
  if (typeof shortcut === 'string') {
    formatted = shortcut;
  } else {
    formatted = formatShortcut(shortcut, isMac);
  }
  
  const keys = formatted.split(' ');

  if (variant === 'badge') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs',
        className
      )}>
        {children}
        {showIcon && (
          <span className="flex items-center gap-0.5">
            {keys.map((key, i) => (
              <Kbd key={i} size="sm" variant="ghost" className="px-1">{key}</Kbd>
            ))}
          </span>
        )}
      </span>
    );
  }

  if (variant === 'tooltip') {
    return (
      <span className={cn('flex items-center gap-2', className)}>
        {children}
        <span className="flex items-center gap-0.5 text-muted-foreground">
          {keys.map((key, i) => (
            <Kbd key={i} size="sm" variant="ghost" className="text-muted-foreground">{key}</Kbd>
          ))}
        </span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {children}
      {showIcon && (
        <span className="flex items-center gap-0.5 text-muted-foreground">
          {keys.map((key, i) => (
            <Kbd key={i} size="sm" variant="ghost">{key}</Kbd>
          ))}
        </span>
      )}
    </span>
  );
}

interface ShortcutBadgeProps {
  keys: string[];
  label?: string;
  className?: string;
}

export function ShortcutBadge({ keys, label, className }: ShortcutBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-2 text-xs text-muted-foreground',
      className
    )}>
      {label && <span>{label}</span>}
      <span className="flex items-center gap-0.5">
        {keys.map((key, i) => (
          <Kbd key={i} size="sm" variant="outline">{key}</Kbd>
        ))}
      </span>
    </span>
  );
}
