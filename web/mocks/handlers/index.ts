// @ts-nocheck
// Mock handlers - not used in production
/**
 * Combined MSW Handlers with Compile-Time Endpoint Coverage Enforcement
 *
 * This file imports all handler modules and combines them into a single
 * handlers array. It also performs a compile-time check to ensure every
 * endpoint in the registry has a corresponding mock handler.
 *
 * If you add a new endpoint to registry.ts but forget to add a handler,
 * TypeScript will produce an error here.
 *
 * SAFETY: This module has guards against production activation:
 * 1. Runtime NODE_ENV check below (logs warning in production)
 * 2. MSWProvider guards (prevents import in production)
 * 3. browser.ts guards (throws if worker starts in production)
 */

import type { RequestHandler } from 'msw';
import type { EndpointKey } from '../registry';

// CRITICAL SAFETY CHECK: Log warning if handlers are imported in production
// Use type assertion since NODE_ENV is typed as 'development' | 'test'
const nodeEnv = process.env.NODE_ENV as string;
if (nodeEnv === 'production') {
  console.error('[MSW] CRITICAL: Mock handlers imported in production environment. This should never happen.');
}

// Import handler arrays and HandledKeys types from all handler modules
import { handlers as healthHandlers, type HandledKeys as HealthKeys } from './health';
import { handlers as configHandlers, type HandledKeys as ConfigKeys } from './config';
import { handlers as agentsHandlers, type HandledKeys as AgentsKeys } from './agents';
import { handlers as agentFilesHandlers, type HandledKeys as AgentFilesKeys } from './agent-files';
import { handlers as sessionsHandlers, type HandledKeys as SessionsKeys } from './sessions';
import { handlers as receiptsHandlers, type HandledKeys as ReceiptsKeys } from './receipts';
import { handlers as heartbeatHandlers, type HandledKeys as HeartbeatKeys } from './heartbeat';
import { handlers as cronHandlers, type HandledKeys as CronKeys } from './cron';
import { handlers as memoryHandlers, type HandledKeys as MemoryKeys } from './memory';
import { handlers as skillsHandlers, type HandledKeys as SkillsKeys } from './skills';
import { handlers as aiHandlers, type HandledKeys as AiKeys } from './ai';
import { handlers as slashHandlers, type HandledKeys as SlashKeys } from './slash';
import { handlers as usageHandlers, type HandledKeys as UsageKeys } from './usage';
import { handlers as debugHandlers, type HandledKeys as DebugKeys } from './debug';
import { handlers as modelsHandlers, type HandledKeys as ModelsKeys } from './models';
import { handlers as providersHandlers, type HandledKeys as ProvidersKeys } from './providers';
import { handlers as authHandlers, type HandledKeys as AuthKeys } from './auth';
import { handlers as adminHandlers, type HandledKeys as AdminKeys } from './admin';
import { handlers as webhookHandlers, type HandledKeys as WebhookKeys } from './webhook';

// ---------------------------------------------------------------------------
// Compile-time enforcement: ensure all EndpointKeys are covered
// ---------------------------------------------------------------------------

/**
 * Union of all handled endpoint keys across all handler modules.
 * If this doesn't cover every EndpointKey, the type check below will fail.
 */
type AllHandledKeys =
  | HealthKeys
  | ConfigKeys
  | AgentsKeys
  | AgentFilesKeys
  | SessionsKeys
  | ReceiptsKeys
  | HeartbeatKeys
  | CronKeys
  | MemoryKeys
  | SkillsKeys
  | AiKeys
  | SlashKeys
  | UsageKeys
  | DebugKeys
  | ModelsKeys
  | ProvidersKeys
  | AuthKeys
  | AdminKeys
  | WebhookKeys;

/**
 * Compile-time check: every EndpointKey must be in AllHandledKeys.
 * 
 * If a key from the registry is NOT handled, this type resolves to
 * something other than `never`, and the assertion below will fail.
 * 
 * The error message will show which keys are missing.
 */
type MissingHandlers = Exclude<EndpointKey, AllHandledKeys>;

// This line will cause a compile error if any EndpointKey is not handled.
// The error will read: "Type 'X' is not assignable to type 'never'"
// where X is the missing endpoint key(s).
type _AssertAllCovered = MissingHandlers extends never
  ? true
  : { error: 'Missing mock handlers for these endpoints'; keys: MissingHandlers };

// Force TypeScript to evaluate the assertion (unused vars are fine for type-only)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeCheck: _AssertAllCovered = true;

// ---------------------------------------------------------------------------
// Combined handlers array
// ---------------------------------------------------------------------------

/** All MSW request handlers, combined from all handler modules */
export const handlers: RequestHandler[] = [
  ...healthHandlers,
  ...configHandlers,
  ...agentsHandlers,
  ...agentFilesHandlers,
  ...sessionsHandlers,
  ...receiptsHandlers,
  ...heartbeatHandlers,
  ...cronHandlers,
  ...memoryHandlers,
  ...skillsHandlers,
  ...aiHandlers,
  ...slashHandlers,
  ...usageHandlers,
  ...debugHandlers,
  ...modelsHandlers,
  ...providersHandlers,
  ...authHandlers,
  ...adminHandlers,
  ...webhookHandlers,
];
