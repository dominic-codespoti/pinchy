/**
 * Mock API Endpoint Registry
 * 
 * Source of truth for all backend API endpoints.
 * Adding a new endpoint here WITHOUT adding a corresponding handler
 * will cause a TypeScript compilation error.
 * 
 * See handlers/index.ts for the compile-time enforcement mechanism.
 */

export const ENDPOINTS = {
  // Health
  'health': { method: 'GET' as const, path: '/api/health' },
  'status': { method: 'GET' as const, path: '/api/status' },

  // Config
  'config-get': { method: 'GET' as const, path: '/api/config' },
  'config-put': { method: 'PUT' as const, path: '/api/config' },
  'config-schema': { method: 'GET' as const, path: '/api/config/schema' },

  // Agents
  'agents-list': { method: 'GET' as const, path: '/api/agents' },
  'agents-create': { method: 'POST' as const, path: '/api/agents' },
  'agents-get': { method: 'GET' as const, path: '/api/agents/:agent_id' },
  'agents-update': { method: 'PUT' as const, path: '/api/agents/:agent_id' },
  'agents-delete': { method: 'DELETE' as const, path: '/api/agents/:agent_id' },
  'agents-clone': { method: 'POST' as const, path: '/api/agents/:agent_id/clone' },

  // Agent Files
  'agent-files-get': { method: 'GET' as const, path: '/api/agents/:agent_id/files/:filename' },
  'agent-files-put': { method: 'PUT' as const, path: '/api/agents/:agent_id/files/:filename' },

  // Sessions
  'sessions-current': { method: 'GET' as const, path: '/api/agents/:agent_id/session/current' },
  'sessions-list': { method: 'GET' as const, path: '/api/agents/:agent_id/sessions' },
  'sessions-get': { method: 'GET' as const, path: '/api/agents/:agent_id/sessions/:session_file' },
  'sessions-update': { method: 'PUT' as const, path: '/api/agents/:agent_id/sessions/:session_file' },
  'sessions-delete': { method: 'DELETE' as const, path: '/api/agents/:agent_id/sessions/:session_file' },

  // Receipts
  'receipts-list': { method: 'GET' as const, path: '/api/agents/:agent_id/receipts' },
  'receipts-by-session': { method: 'GET' as const, path: '/api/agents/:agent_id/receipts/:session_id' },

  // Heartbeat
  'heartbeat-status-all': { method: 'GET' as const, path: '/api/heartbeat/status' },
  'heartbeat-status-one': { method: 'GET' as const, path: '/api/heartbeat/status/:agent_id' },

  // Cron
  'cron-jobs-list': { method: 'GET' as const, path: '/api/cron/jobs' },
  'cron-jobs-create': { method: 'POST' as const, path: '/api/cron/jobs' },
  'cron-jobs-by-agent': { method: 'GET' as const, path: '/api/cron/jobs/:agent_id' },
  'cron-job-runs': { method: 'GET' as const, path: '/api/cron/jobs/:job_id/runs' },
  'cron-jobs-delete': { method: 'DELETE' as const, path: '/api/cron/jobs/:job_id/delete' },
  'cron-jobs-update': { method: 'PUT' as const, path: '/api/cron/jobs/:job_id/update' },
  'cron-job-trigger': { method: 'POST' as const, path: '/api/cron/jobs/:job_id/trigger' },

  // Memory
  'memory-list': { method: 'GET' as const, path: '/api/agents/:agent_id/memory' },
  'memory-delete': { method: 'DELETE' as const, path: '/api/agents/:agent_id/memory/:key' },

  // Skills
  'skills-list': { method: 'GET' as const, path: '/api/skills' },
  'skills-create': { method: 'POST' as const, path: '/api/skills' },
  'skills-get': { method: 'GET' as const, path: '/api/skills/:name' },
  'skills-update': { method: 'PUT' as const, path: '/api/skills/:name' },
  'skills-delete': { method: 'DELETE' as const, path: '/api/skills/:name' },

  // AI
  'ai-enhance-prompt': { method: 'POST' as const, path: '/api/ai/enhance-prompt' },

  // Slash Commands
  'slash-commands': { method: 'GET' as const, path: '/api/slash/commands' },

  // Usage
  'usage': { method: 'GET' as const, path: '/api/usage' },

  // Debug
  'debug-model-requests-list': { method: 'GET' as const, path: '/api/debug/model-requests' },
  'debug-model-request-get': { method: 'GET' as const, path: '/api/debug/model-requests/:request_id' },

  // Models
  'models-list': { method: 'GET' as const, path: '/api/models' },
  'models-get': { method: 'GET' as const, path: '/api/models/:config_model_id' },
  'models-registry': { method: 'GET' as const, path: '/api/models/registry' },

  // Providers
  'providers-status': { method: 'GET' as const, path: '/api/providers/status' },
  'providers-test': { method: 'POST' as const, path: '/api/providers/:provider/test' },

  // Auth
  'auth-masked': { method: 'GET' as const, path: '/api/auth/:provider/masked' },
  'auth-save': { method: 'POST' as const, path: '/api/auth/:provider' },
  'auth-clear': { method: 'DELETE' as const, path: '/api/auth/:provider' },
  'auth-copilot-start': { method: 'POST' as const, path: '/api/auth/copilot/start' },
  'auth-copilot-poll': { method: 'POST' as const, path: '/api/auth/copilot/poll' },

  // Admin
  'admin-stats': { method: 'GET' as const, path: '/api/admin/stats' },
  'admin-db-status': { method: 'GET' as const, path: '/api/admin/db/status' },
  'admin-db-tables': { method: 'GET' as const, path: '/api/admin/db/tables' },
  'admin-db-optimize': { method: 'POST' as const, path: '/api/admin/db/optimize' },
  'admin-db-wal-checkpoint': { method: 'POST' as const, path: '/api/admin/db/wal-checkpoint' },
  'admin-db-diagnostics': { method: 'GET' as const, path: '/api/admin/db/diagnostics' },
  'admin-backups-list': { method: 'GET' as const, path: '/api/admin/backups' },
  'admin-backup-create': { method: 'POST' as const, path: '/api/admin/backups' },

  // Webhook
  'webhook-ingest': { method: 'POST' as const, path: '/api/webhook/:agent_id' },
} as const;

/** Union of all endpoint keys */
export type EndpointKey = keyof typeof ENDPOINTS;

/** All endpoint keys as an array (for iteration) */
export const ENDPOINT_KEYS = Object.keys(ENDPOINTS) as EndpointKey[];
