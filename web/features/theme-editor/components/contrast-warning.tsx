'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { getContrastRatio } from '@/features/theme-editor/hooks/use-custom-theme';
import { cn } from '@/shared/lib/utils';

interface ContrastWarningProps {
  foreground: string;
  background: string;
  className?: string;
}

export function ContrastWarning({ foreground, background, className }: ContrastWarningProps) {
  const ratio = getContrastRatio(foreground, background);
  const wcagAA = ratio >= 4.5;
  const wcagAAA = ratio >= 7;

  if (wcagAAA) {
    return (
      <Alert className={cn('py-2', className)}>
        <Check className="h-4 w-4" />
        <AlertTitle>Contrast: {ratio.toFixed(2)}:1</AlertTitle>
        <AlertDescription>WCAG AAA compliant</AlertDescription>
      </Alert>
    );
  }

  if (wcagAA) {
    return (
      <Alert className={cn('py-2', className)}>
        <Check className="h-4 w-4" />
        <AlertTitle>Contrast: {ratio.toFixed(2)}:1</AlertTitle>
        <AlertDescription>WCAG AA compliant</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="warning" className={cn('py-2', className)}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Contrast: {ratio.toFixed(2)}:1</AlertTitle>
      <AlertDescription>Low contrast - may affect readability</AlertDescription>
    </Alert>
  );
}
