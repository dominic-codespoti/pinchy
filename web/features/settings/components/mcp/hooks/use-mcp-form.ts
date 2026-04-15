'use client';

import { useState, useCallback } from 'react';
import type { McpTransport, McpServerConfig } from '../../../types';

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

export function useMcpForm() {
  const [formData, setFormData] = useState<McpFormData>(emptyFormData);

  const initFormForEdit = useCallback((name: string, server: McpServerConfig) => {
    setFormData({
      name,
      transport: server.transport ?? 'stdio',
      command: server.command ?? '',
      args: (server.args ?? []).join(' '),
      url: server.url ?? '',
      env: Object.entries(server.env ?? {}).map(([key, value]) => ({ key, value: String(value) })),
      timeout: server.timeout ?? 30,
    });
  }, []);

  const initFormForCreate = useCallback(() => {
    setFormData(emptyFormData);
  }, []);

  const updateField = useCallback(<K extends keyof McpFormData>(
    field: K,
    value: McpFormData[K]
  ) => {
    setFormData((prev: McpFormData) => ({ ...prev, [field]: value }));
  }, []);

  const setFullFormData = useCallback((data: McpFormData) => {
    setFormData(data);
  }, []);

  const addEnvRow = useCallback(() => {
    setFormData((prev: McpFormData) => ({
      ...prev,
      env: [...prev.env, { key: '', value: '' }],
    }));
  }, []);

  const removeEnvRow = useCallback((index: number) => {
    setFormData((prev: McpFormData) => ({
      ...prev,
      env: prev.env.filter((_: unknown, i: number) => i !== index),
    }));
  }, []);

  const updateEnvRow = useCallback((index: number, field: 'key' | 'value', value: string) => {
    setFormData((prev: McpFormData) => ({
      ...prev,
      env: prev.env.map((row: { key: string; value: string }, i: number) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));
  }, []);

  const isValid = Boolean(
    formData.name.trim() &&
      (formData.transport === 'stdio'
        ? formData.command.trim()
        : formData.url.trim())
  );

  return {
    formData,
    setFormData: setFullFormData,
    initFormForEdit,
    initFormForCreate,
    updateField,
    addEnvRow,
    removeEnvRow,
    updateEnvRow,
    isValid,
  };
}
