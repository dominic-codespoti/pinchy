/**
 * MSW Node Server Setup
 * 
 * For use in test environments (Vitest, Jest, Playwright).
 * 
 * Usage:
 *   import { server } from '@/mocks/server';
 *   beforeAll(() => server.listen());
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
