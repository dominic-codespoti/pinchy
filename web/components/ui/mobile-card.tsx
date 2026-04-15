'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/utils';

const mobileCardVariants = cva(
  'relative flex flex-col gap-3 p-4 transition-colors bg-card',
  {
    variants: {
      selected: {
        true: 'bg-accent/50',
        false: '',
      },
    },
    defaultVariants: {
      selected: false,
    },
  }
);

export interface MobileCardProps
  extends React.ComponentPropsWithoutRef<typeof Card>,
    VariantProps<typeof mobileCardVariants> {
  onSelect?: () => void;
  selectable?: boolean;
  actions?: React.ReactNode;
}

const MobileCard = React.forwardRef<HTMLDivElement, MobileCardProps>(
  ({ className, selected, onSelect, selectable, actions, children, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn(mobileCardVariants({ selected }), className)}
      data-selected={selected}
      {...props}
    >
      <CardContent className="p-0 space-y-3">
        {selectable && (
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selected ?? false}
              onCheckedChange={() => onSelect?.()}
              className="size-5 touch-target"
            />
            <span className="text-sm text-muted-foreground">Select</span>
          </div>
        )}
        {children}
        {actions && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            {actions}
          </div>
        )}
      </CardContent>
    </Card>
  )
);
MobileCard.displayName = 'MobileCard';

export interface MobileCardRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
}

const MobileCardRow = React.forwardRef<HTMLDivElement, MobileCardRowProps>(
  ({ className, label, value, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-start justify-between gap-2', className)}
      {...props}
    >
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="text-sm font-medium text-right">{value}</div>
    </div>
  )
);
MobileCardRow.displayName = 'MobileCardRow';

export type MobileCardBadgeProps = React.ComponentPropsWithoutRef<typeof Badge>;

const MobileCardBadge = ({ className, ...props }: MobileCardBadgeProps) => (
  <Badge className={cn('text-xs', className)} {...props} />
);
MobileCardBadge.displayName = 'MobileCardBadge';

export type MobileCardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

const MobileCardTitle = React.forwardRef<HTMLHeadingElement, MobileCardTitleProps>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-semibold text-base', className)} {...props} />
  )
);
MobileCardTitle.displayName = 'MobileCardTitle';

export type MobileCardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

const MobileCardDescription = React.forwardRef<HTMLParagraphElement, MobileCardDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-muted-foreground line-clamp-2', className)}
      {...props}
    />
  )
);
MobileCardDescription.displayName = 'MobileCardDescription';

export type MobileCardActionProps = React.ComponentPropsWithoutRef<typeof Button>;

const MobileCardAction = React.forwardRef<HTMLButtonElement, MobileCardActionProps>(
  ({ className, variant = 'ghost', ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size="lg"
      className={cn('h-11 px-4 touch-target', className)}
      {...props}
    />
  )
);
MobileCardAction.displayName = 'MobileCardAction';

export {
  MobileCard,
  MobileCardRow,
  MobileCardBadge,
  MobileCardTitle,
  MobileCardDescription,
  MobileCardAction,
};
