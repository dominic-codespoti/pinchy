import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

const mockProviders = [
  { provider: 'copilot', configured: true, has_api_key: true, source: 'token_file' },
  { provider: 'anthropic', configured: true, has_api_key: true, source: 'env_var', details: 'ANTHROPIC_API_KEY set' },
  { provider: 'openai', configured: false, has_api_key: false },
  { provider: 'azure', configured: false, has_api_key: false },
  { provider: 'bedrock', configured: false, has_api_key: false },
  { provider: 'google', configured: false, has_api_key: false },
];

// Define handlers with endpoint keys
const handlerMap = {
  'providers-status': http.get('/api/providers/status', () => {
    return HttpResponse.json({ providers: mockProviders });
  }),
  'providers-test': http.post('/api/providers/:provider/test', async ({ params }) => {
    const provider = params.provider as string;
    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, 500));

    const providerStatus = mockProviders.find(p => p.provider === provider);
    if (providerStatus?.configured) {
      return HttpResponse.json({ success: true, message: 'Connection successful' });
    }
    return HttpResponse.json(
      { success: false, message: 'No API key configured' },
      { status: 400 },
    );
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
