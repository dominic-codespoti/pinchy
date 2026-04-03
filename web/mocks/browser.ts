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
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

export async function startMockWorker() {
  return worker.start({
    onUnhandledRequest: 'warn',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}
