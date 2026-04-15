'use client';

import { useEffect, useCallback } from 'react';

export function useBeforeUnload(enabled: boolean, message?: string) {
  const handleBeforeUnload = useCallback(
    (event: BeforeUnloadEvent) => {
      if (!enabled) return;

      // Standard way to trigger browser's native unsaved changes dialog
      event.preventDefault();
      // Chrome requires returnValue to be set
      event.returnValue = message || '';
      return message;
    },
    [enabled, message]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, handleBeforeUnload]);
}
