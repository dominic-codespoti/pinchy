// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

// Define handlers with endpoint keys
const handlerMap = {
  'ai-enhance-prompt': http.post('/api/ai/enhance-prompt', async ({ request }) => {
    const body = await request.json() as { prompt?: string };
    const original = body.prompt ?? '';
    return HttpResponse.json({
      enhanced: `${original} [Enhanced with more detail and clarity]`,
      original,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
