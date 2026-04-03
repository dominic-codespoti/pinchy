import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

const mockAgents = [
  {
    id: 'default',
    model: 'copilot-default',
    provider: 'copilot',
    timezone: 'UTC',
    has_heartbeat: true,
    last_heartbeat_at: new Date().toISOString(),
    has_soul: true,
    has_tools: true,
    cron_jobs_count: 2,
    heartbeat_secs: 300,
    session_count: 5,
    created_at: '2024-01-15T10:00:00Z',
    enabled_skills: ['browser', 'mcp'],
    soul: 'You are a helpful assistant.',
    tools: '# Tool instructions\nUse tools wisely.',
    heartbeat: '# Heartbeat\nCheck system status.',
  },
  {
    id: 'researcher',
    model: 'anthropic-claude-3-5-sonnet',
    provider: 'anthropic',
    has_heartbeat: false,
    has_soul: true,
    has_tools: false,
    cron_jobs_count: 0,
    session_count: 12,
    created_at: '2024-02-20T14:30:00Z',
    enabled_skills: [],
  },
];

// Define handlers with endpoint keys
const handlerMap = {
  'agents-list': http.get('/api/agents', () => {
    return HttpResponse.json({ agents: mockAgents });
  }),

  'agents-create': http.post('/api/agents', async ({ request }) => {
    const body = (await request.json()) as { id?: string };
    return HttpResponse.json({
      id: body.id || 'new-agent',
      created: true,
    });
  }),

  'agents-get': http.get('/api/agents/:agent_id', ({ params }) => {
    const agentId = params.agent_id as string;
    const agent = mockAgents.find((a) => a.id === agentId);
    if (!agent) {
      return HttpResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    return HttpResponse.json(agent);
  }),

  'agents-update': http.put('/api/agents/:agent_id', ({ params }) => {
    const agentId = params.agent_id as string;
    return HttpResponse.json({
      id: agentId,
      updated: ['model', 'soul'],
    });
  }),

  'agents-delete': http.delete('/api/agents/:agent_id', ({ params }) => {
    const agentId = params.agent_id as string;
    return HttpResponse.json({
      id: agentId,
      deleted: true,
    });
  }),

  'agents-clone': http.post('/api/agents/:agent_id/clone', ({ params }) => {
    const agentId = params.agent_id as string;
    return HttpResponse.json({
      id: `${agentId}-clone`,
      created: true,
    });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
