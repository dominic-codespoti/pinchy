/**
 * Agent data transformation utilities
 * Transforms raw API responses to frontend Agent types
 */

import { Agent } from './types';
import { RawAgent } from '@/lib/validation/schemas';
import { FALLBACKS } from '@/lib/constants/fallbacks';

/**
 * Transform a RawAgent from the list endpoint to a frontend Agent
 */
export function transformAgent(raw: RawAgent): Agent {
  return {
    id: raw.id,
    name: raw.id, // Use ID as name if no explicit name field
    description: raw.has_soul ? 'Has custom SOUL configuration' : 'Standard agent configuration',
    status: raw.has_heartbeat ? 'active' : 'inactive',
    config: {
      model: raw.model,
      provider: raw.provider || FALLBACKS.PROVIDER,
      systemPrompt: '', // Will be populated from SOUL.md
      toolsEnabled: raw.has_tools ? ['read_file', 'write_file', 'exec_shell'] : [],
    },
    createdAt: raw.created_at || new Date().toISOString(),
    hasHeartbeat: raw.has_heartbeat,
    lastHeartbeatAt: raw.last_heartbeat_at ? new Date(raw.last_heartbeat_at * 1000).toISOString() : undefined,
    heartbeatInterval: raw.heartbeat_secs || undefined,
    cronJobsCount: raw.cron_jobs_count || 0,
    watchPaths: raw.watch_paths || [],
    maxTurns: raw.max_turns,
    historyMessages: raw.history_messages,
    compactKeepRecentTurns: raw.compact_keep_recent_turns,
    maxToolIterations: raw.max_tool_iterations,
    reasoningEffort: raw.reasoning_effort,
    enabledSkills: raw.enabled_skills,
    timezone: raw.timezone,
  };
}

/**
 * Transform a RawAgent from the detail endpoint to a full frontend Agent
 * The detail endpoint provides additional fields like soul, tools, heartbeat
 */
export function transformAgentDetail(raw: RawAgent, id: string): Agent {
  const base = transformAgent(raw);

  return {
    ...base,
    id,
    name: raw.id || id,
    description: raw.soul
      ? raw.soul.substring(0, 100) + (raw.soul.length > 100 ? '...' : '')
      : base.description,
    soul: raw.soul,
    tools: raw.tools,
    heartbeat: raw.heartbeat,
    sessionCount: raw.session_count || 0,
    config: {
      ...base.config,
      systemPrompt: raw.soul || base.config.systemPrompt,
      // Don't split tools by comma - we'll parse the markdown properly in the component
      toolsEnabled: raw.has_tools ? [] : base.config.toolsEnabled,
    },
  };
}
