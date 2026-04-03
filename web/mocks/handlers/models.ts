import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

const mockModels = [
  {
    id: 'copilot-default',
    name: 'Copilot Default',
    provider: 'copilot',
    provider_id: 'copilot',
    config_id: 'default',
    description: 'GitHub Copilot default model',
    input_price: 0,
    output_price: 0,
    context_window: 128000,
    max_output: 4096,
    tool_call: true,
    reasoning: false,
  },
  {
    id: 'anthropic-claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    provider_id: 'anthropic',
    config_id: 'anthropic',
    description: 'Anthropic Claude 3.5 Sonnet',
    input_price: 3.0,
    output_price: 15.0,
    context_window: 200000,
    max_output: 8192,
    tool_call: true,
    reasoning: true,
  },
  {
    id: 'openai-gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    provider_id: 'openai',
    config_id: 'openai',
    description: 'OpenAI GPT-4o',
    input_price: 2.5,
    output_price: 10.0,
    context_window: 128000,
    max_output: 4096,
    tool_call: true,
    reasoning: false,
  },
];

const mockRegistry = [
  {
    id: 'openai',
    name: 'OpenAI',
    env: ['OPENAI_API_KEY'],
    api: 'https://api.openai.com/v1',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        family: 'gpt-4',
        tool_call: true,
        cost: { input: 2.5, output: 10.0 },
        limit: { context: 128000, output: 4096 },
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        family: 'gpt-4',
        tool_call: true,
        cost: { input: 0.15, output: 0.6 },
        limit: { context: 128000, output: 16384 },
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    env: ['ANTHROPIC_API_KEY'],
    api: 'https://api.anthropic.com/v1',
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        family: 'claude',
        tool_call: true,
        reasoning: true,
        cost: { input: 3.0, output: 15.0 },
        limit: { context: 200000, output: 8192 },
      },
    ],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    env: ['COPILOT_TOKEN'],
    models: [
      {
        id: 'copilot-default',
        name: 'Copilot Default',
        tool_call: true,
        cost: { input: 0, output: 0 },
        limit: { context: 128000, output: 4096 },
      },
    ],
  },
];

// Define handlers with endpoint keys
const handlerMap = {
  'models-list': http.get('/api/models', () => {
    return HttpResponse.json({ models: mockModels });
  }),
  'models-get': http.get('/api/models/:config_model_id', ({ params }) => {
    const configId = params.config_model_id as string;
    const filtered = mockModels.filter(m => m.config_id === configId);
    return HttpResponse.json({ models: filtered });
  }),
  'models-registry': http.get('/api/models/registry', () => {
    return HttpResponse.json({ providers: mockRegistry });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
