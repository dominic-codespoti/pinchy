import { Session, RawSession } from '@/features/sessions/types';
import { Memory, RawMemory } from '@/features/memories/types';
import { RawAgent } from '@/lib/validation/schemas';

export type { Session, RawSession } from '@/features/sessions/types';
export type { Memory, RawMemory } from '@/features/memories/types';
export type { ApiError } from '@/shared/types/api';
export type { RawAgent } from '@/lib/validation/schemas';

// ============================================================================
// Receipt Types (moved from deleted api/receipts-api)
// ============================================================================

export interface ReceiptsListResponse {
  receipts: TurnReceipt[];
  total: number;
}

export interface ReceiptsBySessionResponse {
  session_id: string;
  receipts: TurnReceipt[];
}

// ============================================================================
// Heartbeat Types
// ============================================================================

export interface RawHeartbeatStatus {
  agent_id: string;
  enabled: boolean;
  health: string;
  last_tick: string | null;
  next_tick: string | null;
  interval_secs: number | null;
  message_preview?: string;
  latest_session?: { id: string } | string;
}

export interface HeartbeatStatusData {
  agentId: string;
  enabled: boolean;
  health: 'OK' | 'MISSED' | string;
  lastTick: string | null;
  nextTick: string | null;
  intervalSecs: number | null;
  messagePreview?: string;
  latestSession?: { id: string };
}

// ============================================================================
// Receipt / Turn Types
// ============================================================================

export interface ToolCallRecord {
  tool: string;
  success: boolean;
  duration_ms?: number;
  args_summary?: string;
  error?: string;
}

export interface TokenInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
}

export interface TurnReceipt {
  id: string;
  started_at: string;
  model_id?: string;
  duration_ms?: number;
  model_calls?: number;
  tokens: TokenInfo;
  estimated_cost_usd?: number;
  user_prompt: string;
  reply_summary?: string;
  tool_calls: ToolCallRecord[];
  status?: 'success' | 'error' | 'in_progress';
}

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
  // Backend does not provide creation time - generated client-side
  createdAt: string;
  hasHeartbeat?: boolean;
  lastHeartbeatAt?: string;
  heartbeatInterval?: number;
  // Additional fields from api_agent_get
  soul?: string;
  tools?: string;
  heartbeat?: string;
  sessionCount?: number;
  cronJobsCount?: number;
  watchPaths?: string[];
  maxTurns?: number | null;
  historyMessages?: number | null;
  compactKeepRecentTurns?: number | null;
  maxToolIterations?: number | null;
  reasoningEffort?: string | null;
  enabledSkills?: string[] | null;
  timezone?: string;
}

export interface CreateAgentInput {
  id: string;
  model?: string;
  provider?: string;
  soul?: string;
  tools?: string;
  heartbeat?: string;
  heartbeat_secs?: number;
  enabled_skills?: string[];
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
  response?: string;
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
