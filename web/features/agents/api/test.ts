/**
 * Test API - Agent testing operations
 * Uses assistant API for test message sending
 */

import { fetchApi, getErrorMessage } from '@/shared/api/client';
import type { SendTestMessageResponse } from '../types';

const ASSISTANT_API_BASE = '/api/assistant';
const PINCHY_API_BASE = '/api/pinchy';

// ============================================================================
// Test Types
// ============================================================================

export interface TestAgentOptions {
  /** Use the Pinchy agent runtime instead of assistant API */
  usePinchyRuntime?: boolean;
  /** Existing session ID to continue conversation */
  sessionId?: string;
  /** Previous conversation history for context */
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface TestAgentResult {
  success: boolean;
  response: string;
  sessionId?: string;
  usedModel: boolean;
  proposedActions?: Array<{
    type: string;
    description: string;
    params: Record<string, unknown>;
  }>;
  error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Send a test message to an agent using the assistant API
 * POST /api/assistant/chat
 *
 * Uses the assistant API which provides structured action proposals
 * and conversational responses for testing agent configuration.
 */
export async function testAgentWithAssistant(
  agentId: string,
  message: string,
  options?: TestAgentOptions
): Promise<TestAgentResult> {
  try {
    const request = {
      message,
      scope: {
        scope_type: 'agent' as const,
        agent_id: agentId,
      },
      history: options?.history,
    };

    const response = await fetchApi<{
      reply: string;
      proposed_actions?: Array<{
        action_type: string;
        description: string;
        params: Record<string, unknown>;
      }>;
      used_model: boolean;
    }>(
      `${ASSISTANT_API_BASE}/chat`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    return {
      success: true,
      response: response.reply,
      usedModel: response.used_model,
      proposedActions: response.proposed_actions?.map((action) => ({
        type: action.action_type,
        description: action.description,
        params: action.params,
      })),
    };
  } catch (error) {
    return {
      success: false,
      response: '',
      usedModel: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Send a test message to an agent using the Pinchy runtime
 * POST /api/pinchy/chat
 *
 * Uses the actual Pinchy agent runtime for more realistic testing.
 * This runs through the full agent turn execution with tool access.
 */
export async function testAgentWithPinchy(
  agentId: string,
  message: string,
  options?: TestAgentOptions
): Promise<TestAgentResult> {
  try {
    const request = {
      message,
      session_id: options?.sessionId,
      context: {
        scope_type: 'agent' as const,
        agent_id: agentId,
      },
      history: options?.history,
    };

    const response = await fetchApi<{
      reply: string;
      session_id: string;
      agent_id: string;
    }>(
      `${PINCHY_API_BASE}/chat`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    return {
      success: true,
      response: response.reply,
      sessionId: response.session_id,
      usedModel: true,
    };
  } catch (error) {
    return {
      success: false,
      response: '',
      usedModel: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Send a test message to an agent
 *
 * By default uses the assistant API for better error handling and
 * action proposals. Use options.usePinchyRuntime for full agent testing.
 */
export async function testAgent(
  agentId: string,
  message: string,
  options?: TestAgentOptions
): Promise<TestAgentResult> {
  if (options?.usePinchyRuntime) {
    return testAgentWithPinchy(agentId, message, options);
  }

  return testAgentWithAssistant(agentId, message, options);
}

/**
 * Legacy test agent function for backward compatibility
 * Simple text-only test without structured output
 */
export async function sendTestMessage(
  agentId: string,
  message: string
): Promise<SendTestMessageResponse> {
  const result = await testAgent(agentId, message);

  if (!result.success) {
    throw new Error(result.error || 'Test failed');
  }

  return {
    response: result.response,
    content: result.response,
  };
}
