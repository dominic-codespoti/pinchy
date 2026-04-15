'use client';

import { ReactNode, forwardRef } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/shared/lib/utils';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  description?: string;
  error?: string;
  className?: string;
  required?: boolean;
}

/**
 * FormField - shadcn/ui based form field component.
 *
 * Combines Label, input control, description, and error message
 * in a consistent layout pattern used across settings pages.
 *
 * @example
 * ```tsx
 * <FormField
 *   label="Username"
 *   htmlFor="username"
 *   description="This is your public display name"
 *   error={errors.username}
 * >
 *   <Input id="username" {...register('username')} />
 * </FormField>
 * ```
 */
export function FormField({
  label,
  htmlFor,
  children,
  description,
  error,
  className,
  required,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div>{children}</div>
      {description && (
        <p className="text-[0.8rem] text-muted-foreground">{description}</p>
      )}
      {error && (
        <p className="text-[0.8rem] font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}

interface FormFieldInlineProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  description?: string;
  className?: string;
}

/**
 * FormFieldInline - Horizontal layout for checkbox/switch fields.
 *
 * @example
 * ```tsx
 * <FormFieldInline
 *   label="Enable notifications"
 *   htmlFor="notifications"
 *   description="Receive updates about your agents"
 * >
 *   <Switch id="notifications" />
 * </FormFieldInline>
 * ```
 */
export function FormFieldInline({
  label,
  htmlFor,
  children,
  description,
  className,
}: FormFieldInlineProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="space-y-0.5 min-w-0">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p className="text-[0.8rem] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

interface FormFieldGroupProps {
  children: ReactNode;
  className?: string;
}

/**
 * FormFieldGroup - Groups multiple related fields with consistent spacing.
 */
export function FormFieldGroup({ children, className }: FormFieldGroupProps) {
  return <div className={cn('space-y-4', className)}>{children}</div>;
}
