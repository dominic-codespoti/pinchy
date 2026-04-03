'use client';

import { useState, useEffect, type ReactNode } from 'react';

interface MSWProviderProps {
  children: ReactNode;
}

/**
 * Conditionally initializes MSW in development/test mode.
 *
 * Set NEXT_PUBLIC_ENABLE_MOCKS=true to enable mock API responses.
 * When disabled, this component renders children immediately.
 */
export function MSWProvider({ children }: MSWProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const shouldEnableMocks = process.env.NEXT_PUBLIC_ENABLE_MOCKS === 'true';

  useEffect(() => {
    // Only initialize MSW on client side
    if (!shouldEnableMocks) return;

    async function initMocks() {
      if (typeof window !== 'undefined') {
        const { startMockWorker } = await import('@/mocks/browser');
        await startMockWorker();
        console.log('[MSW] Mock Service Worker started');
      }
      setIsReady(true);
    }

    initMocks();
  }, [shouldEnableMocks]);

  // Always render children to avoid hydration mismatches
  // MSW readiness is tracked internally but doesn't block rendering
  return <>{children}</>;
}
