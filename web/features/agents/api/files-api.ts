import { fetchApi } from '@/shared/api/client';
import { AgentFile, SendTestMessageResponse } from '../types';

// Agent files - backend only supports specific files via /api/agents/:id/files/:filename
// Allowed files: SOUL.md, TOOLS.md, HEARTBEAT.md
interface AgentFileResponse {
  filename: string;
  content: string;
}

// Backend does not have a file listing endpoint
// This returns common agent files that might exist
export async function getAgentFiles(agentId: string): Promise<AgentFile[]> {
  // Backend doesn't support listing files, only accessing specific ones
  // Return common agent files that might exist
  const allowedFiles = ['SOUL.md', 'TOOLS.md', 'HEARTBEAT.md'];
  return allowedFiles.map(filename => ({
    name: filename,
    path: filename,
    size: 0,
    modifiedAt: new Date().toISOString(),
    isDirectory: false,
  }));
}

// Backend supports GET /api/agents/:id/files/:filename for allowed files
export async function getAgentFileContent(agentId: string, filename: string): Promise<string> {
  const response = await fetchApi<AgentFileResponse>(`/api/agents/${agentId}/files/${encodeURIComponent(filename)}`);
  return response.content;
}

// Backend supports PUT /api/agents/:id/files/:filename to save file content
export async function saveAgentFileContent(agentId: string, filename: string, content: string): Promise<void> {
  await fetchApi<{ filename: string; saved: boolean }>(`/api/agents/${agentId}/files/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// Backend does not support file uploads via multipart/form-data
// Files are managed via read_file/write_file/edit_file tools
export async function uploadAgentFile(agentId: string, file: File, onProgress?: (progress: number) => void): Promise<AgentFile> {
  throw new Error('File upload not supported by backend. Use write_file tool instead.');
}

// Backend does not support file deletion via API
export async function deleteAgentFile(agentId: string, filename: string): Promise<void> {
  // Backend doesn't support file deletion via API
  // Files can be emptied by writing empty content
  throw new Error('File deletion not supported by backend. Use write_file with empty content instead.');
}

async function fetchApiBinary(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = `${endpoint}`;
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response;
}

// Backend supports GET /api/agents/:id/files/:filename for allowed files
export async function downloadAgentFile(agentId: string, filename: string): Promise<Blob> {
  const response = await fetchApiBinary(`/api/agents/${agentId}/files/${encodeURIComponent(filename)}`);
  return response.blob();
}

export async function sendTestMessage(agentId: string, content: string): Promise<SendTestMessageResponse> {
  return fetchApi<SendTestMessageResponse>('/api/agents/test', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, content }),
  });
}
