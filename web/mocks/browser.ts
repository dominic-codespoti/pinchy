/**
 * MSW Browser Worker Setup
 *
 * Import and call `startMockWorker()` in your app entry point
 * to intercept all fetch() calls with mock handlers.
 *
 * Usage in development:
 *   if (process.env.NODE_ENV === 'development') {
 *     const { startMockWorker } = await import('@/mocks/browser');
 *     await startMockWorker();
 *   }
 *
 * SAFETY: This module has multiple guards against production activation:
 * 1. Runtime NODE_ENV check below (refuses to start in production)
 * 2. MSWProvider guards (prevents import in production)
 * 3. Webpack exclusion in next.config.ts (build-time)
 */

// CRITICAL SAFETY CHECK: Never initialize MSW in production
// Use type assertion since NODE_ENV is typed as 'development' | 'test'
const nodeEnv = process.env.NODE_ENV as string;
if (nodeEnv === 'production') {
  console.error('[MSW] CRITICAL: Attempted to load MSW browser module in production. Mock handlers will not be registered.');
  throw new Error('MSW cannot be used in production environment');
}

// Dynamic import to prevent TypeScript from resolving during production build
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

export async function startMockWorker() {
  // Additional runtime safety check before starting
  const runtimeEnv = process.env.NODE_ENV as string;
  if (runtimeEnv === 'production') {
    console.error('[MSW] CRITICAL: startMockWorker() called in production. Aborting.');
    throw new Error('MSW should never be enabled in production');
  }

  if (!worker) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { setupWorker }: any = await import('msw/browser');
    const { handlers } = await import('./handlers');
    worker = setupWorker(...handlers);
  }

  return worker.start({
    onUnhandledRequest: 'warn',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}
