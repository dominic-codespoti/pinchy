/**
 * Agent data transformation utilities
 * Transforms raw API responses to frontend Agent types
 */

import { Agent, AgentListItem, AgentDetail } from './types';
import { FALLBACKS } from '@/lib/constants/fallbacks';

/**
 * Transform a AgentListItem from the list endpoint to a frontend Agent
 */
export function transformAgent(raw: AgentListItem): Agent {
  return {
    id: raw.id,
    name: raw.id, // Use ID as name if no explicit name field
    description: raw.has_soul ? 'Has custom SOUL configuration' : 'Standard agent configuration',
    status: raw.has_heartbeat ? 'active' : 'inactive',
    config: {
      model: raw.model ?? undefined,
      provider: FALLBACKS.PROVIDER,
      systemPrompt: '', // Will be populated from SOUL.md
      toolsEnabled: raw.has_tools ? ['read_file', 'write_file', 'exec_shell'] : [],
    },
    createdAt: new Date().toISOString(), // Backend doesn't provide creation time
    hasHeartbeat: raw.has_heartbeat,
    heartbeatEnabled: raw.heartbeat_enabled ?? raw.has_heartbeat,
    lastHeartbeatAt: raw.last_heartbeat_at ? new Date(Number(raw.last_heartbeat_at) * 1000).toISOString() : undefined,
    heartbeatInterval: raw.heartbeat_secs ? Number(raw.heartbeat_secs) : undefined,
    cronJobsCount: raw.cron_jobs_count ?? 0,
    maxTurns: raw.max_turns ?? undefined,
    historyMessages: raw.history_messages ?? undefined,
    compactKeepRecentTurns: raw.compact_keep_recent_turns ?? undefined,
    maxToolIterations: raw.max_tool_iterations ?? undefined,
    reasoningEffort: raw.reasoning_effort ?? undefined,
    enabledSkills: raw.enabled_skills ?? undefined,
    timezone: raw.timezone ?? undefined,
  };
}

/**
 * Transform a AgentDetail from the detail endpoint to a full frontend Agent
 * The detail endpoint provides additional fields like soul, tools, heartbeat
 */
export function transformAgentDetail(raw: AgentDetail, id?: string): Agent {
  const base = transformAgent({
    ...raw,
    has_soul: raw.soul !== null,
    has_tools: raw.tools !== null,
    has_heartbeat: raw.heartbeat !== null,
    last_heartbeat_at: null,
    cron_jobs_count: 0,
  } satisfies AgentListItem);

  return {
    ...base,
    id: raw.id || id || raw.id,
    name: raw.id || id || raw.id,
    description: raw.soul
      ? raw.soul.substring(0, 100) + (raw.soul.length > 100 ? '...' : '')
      : base.description,
    soul: raw.soul ?? undefined,
    tools: raw.tools ?? undefined,
    heartbeat: raw.heartbeat ?? undefined,
    sessionCount: raw.session_count || 0,
    watchPaths: raw.watch_paths,
    config: {
      ...base.config,
      systemPrompt: raw.soul || base.config.systemPrompt,
      provider: raw.provider || base.config.provider,
      // Don't split tools by comma - we'll parse the markdown properly in the component
      toolsEnabled: raw.tools ? [] : base.config.toolsEnabled,
    },
  };
}
