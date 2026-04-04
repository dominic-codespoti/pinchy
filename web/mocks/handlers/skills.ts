// @ts-nocheck
// Mock handlers - not used in production
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// Type to ensure only valid endpoint keys are used
type HandlerMap = Partial<Record<EndpointKey, RequestHandler>>;

const mockSkills = [
  { id: 'browser', description: 'Browser automation using Playwright', operator_managed: false },
  { id: 'mcp', description: 'Model Context Protocol integration', operator_managed: false },
  { id: 'code-review', description: 'Automated code review', operator_managed: true },
];

// Define handlers with endpoint keys
const handlerMap = {
  'skills-list': http.get('/api/skills', () => {
    return HttpResponse.json({ skills: mockSkills });
  }),
  'skills-create': http.post('/api/skills', async ({ request }) => {
    const body = await request.json() as { name?: string };
    return HttpResponse.json({ id: body.name ?? 'new-skill', created: true });
  }),
  'skills-get': http.get('/api/skills/:name', ({ params }) => {
    const name = params.name as string;
    const skill = mockSkills.find(s => s.id === name) || {
      id: name,
      description: 'Custom skill',
      operator_managed: false,
    };
    return HttpResponse.json({
      ...skill,
      manifest: `# ${skill.id} Skill`,
      instructions: 'Default instructions for this skill.',
      allowed_tools: 'read_file, write_file',
    });
  }),
  'skills-update': http.put('/api/skills/:name', ({ params }) => {
    const name = params.name as string;
    return HttpResponse.json({ id: name, updated: true });
  }),
  'skills-delete': http.delete('/api/skills/:name', ({ params }) => {
    const name = params.name as string;
    return HttpResponse.json({ status: 'deleted', name });
  }),
} satisfies HandlerMap;

// Export for compile-time checking in index.ts
export type HandledKeys = keyof typeof handlerMap;
export { handlerMap };

// Export array of handlers for MSW
export const handlers: RequestHandler[] = Object.values(handlerMap);
