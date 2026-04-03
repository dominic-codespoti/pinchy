import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

const maskedKeys: Record<string, string | null> = {
  'openai': 'sk-...abc123',
  'anthropic': 'sk-ant-...xyz789',
  'copilot': null,
  'azure': null,
};

// Define handlers with endpoint keys
const handlerMap = {
  'auth-masked': http.get('/api/auth/:provider/masked', ({ params }) => {
    const provider = params.provider as string;
    const maskedKey = maskedKeys[provider] ?? null;
    return HttpResponse.json({ masked_key: maskedKey });
  }),
  'auth-save': http.post('/api/auth/:provider', () => {
    return HttpResponse.json({ status: 'saved', success: true });
  }),
  'auth-clear': http.delete('/api/auth/:provider', () => {
    return new HttpResponse(null, { status: 204 });
  }),
  'auth-copilot-start': http.post('/api/auth/copilot/start', () => {
    return HttpResponse.json({
      device_code: 'MOCK-DEVICE-CODE',
      user_code: 'MOCK-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    });
  }),
  'auth-copilot-poll': http.post('/api/auth/copilot/poll', () => {
    return HttpResponse.json({
      status: 'complete',
      token: 'mock-copilot-token',
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
