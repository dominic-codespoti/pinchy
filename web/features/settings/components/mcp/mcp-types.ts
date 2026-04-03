/**
 * MCP Types - Shared types for MCP components
 */

import type { McpTransport, McpServerConfig, McpServers } from '../../types';

export interface McpFormData {
  name: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  env: Array<{ key: string; value: string }>;
  timeout: number;
}

export const emptyFormData: McpFormData = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: [],
  timeout: 30,
};

export interface McpServerCardProps {
  name: string;
  server: McpServerConfig;
  onEdit: (name: string, server: McpServerConfig) => void;
  onDelete: (name: string) => void;
}

export interface McpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingName: string | null;
  formData: McpFormData;
  onFormChange: (data: McpFormData) => void;
  onSave: () => void;
  isSaving: boolean;
}

export interface McpDeleteDialogProps {
  serverName: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting: boolean;
}
