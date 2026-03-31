'use client';

import { useEffect, useCallback } from 'react';
import { useBeforeUnload } from '@/shared/hooks/use-before-unload';

interface UseUnsavedChangesWarningOptions {
  hasChanges: boolean;
  message?: string;
}

export function useUnsavedChangesWarning({
  hasChanges,
  message = 'You have unsaved changes. Are you sure you want to leave?',
}: UseUnsavedChangesWarningOptions) {
  // Handle browser beforeunload event
  useBeforeUnload(hasChanges, message);

  // Handle Next.js navigation
  const handleBeforeNavigate = useCallback(() => {
    if (hasChanges) {
      return confirm(message);
    }
    return true;
  }, [hasChanges, message]);

  return {
    handleBeforeNavigate,
    hasChanges,
  };
}
