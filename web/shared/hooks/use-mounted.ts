'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to check if component is mounted on the client.
 * Useful for preventing SSR/hydration mismatches.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
