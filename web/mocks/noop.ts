/**
 * No-op mock handlers for production builds
 * 
 * This module provides empty implementations that are used when MSW
 * is disabled in production. Webpack aliases the mocks directory to
 * this file in production, ensuring mock data and MSW dependency are
 * excluded from the production bundle.
 */

// Use 'any' type to avoid importing from 'msw' in production
// This is intentional - we don't want MSW types in the production bundle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handlers: any[] = [];

// No-op worker object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const worker: any = {
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  use: () => {},
  resetHandlers: () => {},
};

export async function startMockWorker(): Promise<void> {
  // No-op in production - MSW should never be enabled
  return Promise.resolve();
}

// No-op server for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const server: any = {
  listen: () => {},
  close: () => {},
  use: () => {},
  resetHandlers: () => {},
};
