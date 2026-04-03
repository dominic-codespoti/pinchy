/**
 * MCP Utilities - Helper functions for MCP components
 */

import type { McpTransport, McpServerConfig } from '../../types';
import type { McpFormData } from './mcp-types';

export function transportBadgeVariant(transport?: McpTransport): 'default' | 'secondary' | 'outline' {
  switch (transport) {
    case 'stdio':
      return 'default';
    case 'sse':
      return 'secondary';
    case 'streamablehttp':
      return 'outline';
    default:
      return 'default';
  }
}

export function transportLabel(transport?: McpTransport): string {
  switch (transport) {
    case 'stdio':
      return 'stdio';
    case 'sse':
      return 'SSE';
    case 'streamablehttp':
      return 'HTTP';
    default:
      return 'stdio';
  }
}

export function isValidMcpForm(data: McpFormData): boolean {
  return Boolean(
    data.name.trim() &&
      (data.transport === 'stdio'
        ? data.command.trim()
        : data.url.trim())
  );
}

export function buildServerConfig(formData: McpFormData): { name: string; config: McpServerConfig } {
  const envMap: Record<string, string> = {};
  for (const { key, value } of formData.env) {
    if (key.trim()) {
      envMap[key.trim()] = value;
    }
  }

  const serverConfig: McpServerConfig = {
    transport: formData.transport,
    timeout: formData.timeout,
  };

  if (formData.transport === 'stdio') {
    if (formData.command.trim()) {
      serverConfig.command = formData.command.trim();
    }
    if (formData.args.trim()) {
      serverConfig.args = formData.args
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  } else {
    if (formData.url.trim()) {
      serverConfig.url = formData.url.trim();
    }
  }

  if (Object.keys(envMap).length > 0) {
    serverConfig.env = envMap;
  }

  return { name: formData.name.trim(), config: serverConfig };
}
