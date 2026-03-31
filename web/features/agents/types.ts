import { Session, RawSession } from '@/features/sessions/types';
import { Memory, RawMemory } from '@/features/memories/types';

export type { Session, RawSession } from '@/features/sessions/types';
export type { Memory, RawMemory } from '@/features/memories/types';
export type { ApiError } from '@/shared/types/api';

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  agentIds: string[];
  order: number;
}

// Agent type for frontend use (transformed from RawAgent)
export interface Agent {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  config: {
    model?: string;
    provider: string;
    systemPrompt: string;
    toolsEnabled: string[];
  };
  createdAt: string;
  hasHeartbeat?: boolean;
  lastHeartbeatAt?: string;
  heartbeatInterval?: number;
  // Additional fields from api_agent_get
  soul?: string;
  tools?: string;
  heartbeat?: string;
  sessionCount?: number;
  watchPaths?: string[];
  maxTurns?: number | null;
  historyMessages?: number | null;
  compactKeepRecentTurns?: number | null;
  maxToolIterations?: number | null;
  reasoningEffort?: string | null;
  enabledSkills?: string[] | null;
  timezone?: string;
}

// Raw API response from backend (list endpoint)
export interface RawAgent {
  id: string;
  model?: string;
  timezone?: string;
  has_heartbeat?: boolean;
  has_soul?: boolean;
  has_tools?: boolean;
  cron_jobs_count?: number;
  heartbeat_secs?: number | null;
  max_turns?: number | null;
  history_messages?: number | null;
  compact_keep_recent_turns?: number | null;
  max_tool_iterations?: number | null;
  reasoning_effort?: string | null;
  enabled_skills?: string[] | null;
  watch_paths?: string[];
  // Additional fields from api_agent_get (detail endpoint)
  soul?: string;
  tools?: string;
  heartbeat?: string;
  session_count?: number;
}

export interface CreateAgentInput {
  id: string;
  model?: string;
  soul?: string;
  tools?: string;
  heartbeat?: string;
  heartbeat_secs?: number;
}

export interface UpdateAgentInput {
  soul?: string;
  tools?: string;
  heartbeat?: string;
  model?: string;
  heartbeat_secs?: number | null;
  max_tool_iterations?: number;
  enabled_skills?: string[];
  max_turns?: number;
  compact_keep_recent_turns?: number;
  history_messages?: number;
  reasoning_effort?: string;
  enabled?: boolean;
}

// ============================================================================
// File Types
// ============================================================================

export interface AgentFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface SendTestMessageResponse {
  response: string;
  content?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

// ============================================================================
// Clone Types
// ============================================================================

export interface CloneAgentOptions {
  cloneSettings: boolean;
  cloneFiles: boolean;
  cloneMemories: boolean;
  newName?: string;
}

export interface CloneAgentResult {
  success: boolean;
  agentId?: string;
  clonedSettings: boolean;
  clonedFiles: boolean;
  clonedMemories: boolean;
  errors: string[];
}
