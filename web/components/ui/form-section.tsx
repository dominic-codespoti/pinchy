'use client';

import { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Separator } from '@/components/ui/separator';

interface FormSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  bordered?: boolean;
  separated?: boolean;
}

/**
 * FormSection - Groups related form fields with optional title and description.
 *
 * Can render with or without borders depending on context.
 *
 * @example
 * ```tsx
 * <FormSection
 *   title="API Configuration"
 *   description="Configure your API credentials"
 *   bordered
 * >
 *   <FormField label="API Key">
 *     <Input type="password" />
 *   </FormField>
 *   <FormField label="Endpoint">
 *     <Input />
 *   </FormField>
 * </FormSection>
 * ```
 */
export function FormSection({
  title,
  description,
  children,
  className,
  bordered = false,
  separated = false,
}: FormSectionProps) {
  return (
    <div
      className={cn(
        'space-y-4',
        bordered && 'rounded-lg border p-4',
        className
      )}
    >
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h4 className="text-sm font-medium text-foreground">{title}</h4>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-4">{children}</div>
      {separated && <Separator />}
    </div>
  );
}

interface FormSectionGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
  gap?: 'sm' | 'md' | 'lg';
}

/**
 * FormSectionGrid - Grid layout for form sections.
 *
 * Responsive: stacks on mobile, grid on larger screens.
 *
 * @example
 * ```tsx
 * <FormSectionGrid columns={2}>
 *   <FormField label="First Name"><Input /></FormField>
 *   <FormField label="Last Name"><Input /></FormField>
 * </FormSectionGrid>
 * ```
 */
export function FormSectionGrid({
  children,
  columns = 2,
  className,
  gap = 'md',
}: FormSectionGridProps) {
  const gapClasses = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6',
  };

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div
      className={cn('grid', gridCols[columns], gapClasses[gap], className)}
    >
      {children}
    </div>
  );
}

interface FormSectionDividerProps {
  label?: string;
  className?: string;
}

/**
 * FormSectionDivider - Visual separator between form sections with optional label.
 */
export function FormSectionDivider({
  label,
  className,
}: FormSectionDividerProps) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t" />
      </div>
      {label && (
        <div className="relative flex justify-center">
          <span className="bg-background px-2 text-xs text-muted-foreground">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
