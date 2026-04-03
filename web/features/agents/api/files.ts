/**
 * Files API - Agent file operations
 * Endpoints from src/gateway/handlers/agents.rs
 */

import { fetchApi } from '@/shared/api/client';

const API_BASE = '/api/agents';

// ============================================================================
// Response Types
// ============================================================================

interface AgentFileResponse {
  filename: string;
  content: string;
}

interface SaveFileResponse {
  filename: string;
  saved: boolean;
}

/**
 * Agent file metadata (for file listing)
 * Extended with content for detail view
 */
export interface AgentFileData {
  filename: string;
  content: string;
  lastModified?: Date;
  size?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Allowlisted filenames that can be read/written via the API
 * Matches ALLOWED_AGENT_FILES in agents.rs
 */
export const ALLOWED_AGENT_FILES = [
  'SOUL.md',
  'TOOLS.md',
  'HEARTBEAT.md',
] as const;

export type AllowedAgentFile = (typeof ALLOWED_AGENT_FILES)[number];

/**
 * Check if a filename is allowed
 */
export function isAllowedFilename(filename: string): filename is AllowedAgentFile {
  return ALLOWED_AGENT_FILES.includes(filename as AllowedAgentFile);
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get agent files metadata
 * Note: Backend doesn't have a direct "list files" endpoint, but we know
 * the allowed files are SOUL.md, TOOLS.md, HEARTBEAT.md
 * This returns metadata for all allowed files
 */
export async function getAgentFiles(agentId: string): Promise<{ name: string; path: string }[]> {
  // Since the backend doesn't list files, we return the known structure
  // Components can then fetch individual files as needed
  return ALLOWED_AGENT_FILES.map((filename) => ({
    name: filename,
    path: `${API_BASE}/${encodeURIComponent(agentId)}/files/${filename}`,
  }));
}

/**
 * Get a single agent file content
 * GET /api/agents/:id/files/:filename
 */
export async function getAgentFile(
  agentId: string,
  filename: AllowedAgentFile | string
): Promise<AgentFileData> {
  if (!isAllowedFilename(filename)) {
    throw new Error(`Invalid filename: ${filename}. Allowed: ${ALLOWED_AGENT_FILES.join(', ')}`);
  }

  const response = await fetchApi<AgentFileResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/files/${encodeURIComponent(filename)}`
  );

  return {
    filename: response.filename,
    content: response.content,
  };
}

/**
 * Save an agent file
 * PUT /api/agents/:id/files/:filename
 */
export async function saveAgentFile(
  agentId: string,
  filename: AllowedAgentFile | string,
  content: string
): Promise<void> {
  if (!isAllowedFilename(filename)) {
    throw new Error(`Invalid filename: ${filename}. Allowed: ${ALLOWED_AGENT_FILES.join(', ')}`);
  }

  await fetchApi<SaveFileResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/files/${encodeURIComponent(filename)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }
  );
}

/**
 * Helper to fetch all agent files at once
 */
export async function getAllAgentFiles(agentId: string): Promise<Record<AllowedAgentFile, string>> {
  const results: Partial<Record<AllowedAgentFile, string>> = {};

  await Promise.all(
    ALLOWED_AGENT_FILES.map(async (filename) => {
      try {
        const file = await getAgentFile(agentId, filename);
        results[filename] = file.content;
      } catch {
        // File may not exist yet
        results[filename] = '';
      }
    })
  );

  return results as Record<AllowedAgentFile, string>;
}
