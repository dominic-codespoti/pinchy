'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const kbdVariants = cva(
  'inline-flex items-center justify-center rounded font-mono font-medium leading-none',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground shadow-sm border-b-2 border-muted-foreground/20',
        outline: 'bg-transparent border border-border text-foreground',
        ghost: 'bg-transparent text-muted-foreground',
      },
      size: {
        sm: 'min-h-5 px-1.5 py-0.5 text-[10px]',
        md: 'min-h-6 px-2 py-1 text-xs',
        lg: 'min-h-8 px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface KbdProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof kbdVariants> {}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, variant, size, ...props }, ref) => (
    <kbd ref={ref} className={cn(kbdVariants({ variant, size }), className)} {...props} />
  )
);
Kbd.displayName = 'Kbd';

export interface KbdComboProps extends Omit<KbdProps, 'children'> {
  keys: string[];
  separator?: React.ReactNode;
}

const KbdCombo = React.forwardRef<HTMLSpanElement, KbdComboProps>(
  ({ keys, separator = <span className="mx-0.5 text-muted-foreground/50">+</span>, ...props }, ref) => (
    <span ref={ref} className="inline-flex items-center">
      {keys.map((key, index) => (
        <span key={index} className="inline-flex items-center">
          <Kbd {...props}>{key}</Kbd>
          {index < keys.length - 1 && separator}
        </span>
      ))}
    </span>
  )
);
KbdCombo.displayName = 'KbdCombo';

export { Kbd, KbdCombo };
