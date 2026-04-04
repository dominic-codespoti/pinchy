'use client';

import { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardTitle } from './card';
import { Button } from './button';
import { cn } from '@/shared/lib/utils';

export interface EmptyStateProps {
  /** Icon to display above the title */
  icon?: ReactNode;
  /** Title text */
  title: string;
  /** Description text */
  description: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
    icon?: ReactNode;
  };
  /** Optional additional className for the card */
  className?: string;
  /** Whether to use compact padding (for inline empty states) */
  compact?: boolean;
}

/**
 * Generic empty state component with icon, title, description, and optional action button.
 * Used across the application for consistent empty state UI.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <Card className={cn(className)}>
      <CardContent
        className={cn(
          'flex flex-col items-center justify-center text-center',
          compact ? 'py-8' : 'py-12 sm:py-16'
        )}
      >
        {icon && (
          <div className="rounded-full bg-muted p-3 sm:p-4 mb-4">
            <div className="text-muted-foreground">{icon}</div>
          </div>
        )}
        <CardTitle className={cn('text-lg mb-2', compact && 'text-base')}>
          {title}
        </CardTitle>
        <CardDescription
          className={cn(
            'max-w-sm mb-6',
            compact && 'text-sm mb-4 max-w-xs'
          )}
        >
          {description}
        </CardDescription>
        {action && (
          <Button
            onClick={action.onClick}
            variant={action.variant || 'default'}
            size={compact ? 'sm' : 'default'}
          >
            {action.icon && <span className="mr-2">{action.icon}</span>}
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

EmptyState.displayName = 'EmptyState';
