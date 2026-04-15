'use client';

import { useState, useEffect, type ReactNode } from 'react';

interface MSWProviderProps {
  children: ReactNode;
}

/**
 * Development-only banner to indicate mocks are active.
 * Only renders when MSW is actually running.
 */
function MockBanner() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#f59e0b',
        color: '#000',
        padding: '4px 8px',
        fontSize: '12px',
        fontWeight: 600,
        textAlign: 'center',
        zIndex: 9999,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      role="status"
      aria-label="Mock API active"
    >
      🧪 Mock API Active — MSW intercepting requests
    </div>
  );
}

/**
 * Conditionally initializes MSW in development/test mode.
 *
 * Set NEXT_PUBLIC_ENABLE_MOCKS=true to enable mock API responses.
 * When disabled, this component renders children immediately.
 *
 * SAFETY: Multiple guards prevent MSW in production:
 * 1. Runtime NODE_ENV check (this file)
 * 2. Mock worker initialization check (browser.ts)
 * 3. Webpack exclusion in next.config.ts (build-time)
 *
 * Defense in depth: Even if env vars are misconfigured, MSW
 * cannot activate in production builds.
 */
export function MSWProvider({ children }: MSWProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [isMockActive, setIsMockActive] = useState(false);

  // CRITICAL SAFETY CHECK: Never enable mocks in production
  // Use type assertion since NODE_ENV is typed as 'development' | 'test'
  const nodeEnv = process.env.NODE_ENV as string;
  if (nodeEnv === 'production') {
    // This should never happen due to webpack config, but guard anyway
    console.error('[MSW] CRITICAL: MSWProvider rendered in production. Mocking disabled.');
    return <>{children}</>;
  }

  const shouldEnableMocks = process.env.NEXT_PUBLIC_ENABLE_MOCKS === 'true';
  // Use type assertion since NODE_ENV is typed as 'development' | 'test'
  const isProductionBuild = nodeEnv === 'production';
  const canEnableMocks = shouldEnableMocks && !isProductionBuild;

  useEffect(() => {
    // Only initialize MSW on client side when explicitly enabled AND not production
    if (!canEnableMocks) {
      setIsReady(true);
      return;
    }

    async function initMocks() {
      if (typeof window !== 'undefined') {
        try {
          // Dynamic import ensures mock code is only loaded when needed
          const { startMockWorker } = await import('@/mocks/browser');
          await startMockWorker();
          console.log('[MSW] Mock Service Worker started');
          setIsMockActive(true);
        } catch (error) {
          console.error('[MSW] Failed to start mock worker:', error);
        }
      }
      setIsReady(true);
    }

    initMocks();
  }, [canEnableMocks]);

  // Always render children to avoid hydration mismatches
  // MSW readiness is tracked internally but doesn't block rendering
  return (
    <>
      {children}
      {isMockActive && <MockBanner />}
    </>
  );
}
