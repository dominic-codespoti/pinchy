'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AgentModelOption } from '@/features/settings';
import {
  getAgentModelLabel,
  getAgentModelOptionsForProvider,
  normalizeAgentModelSelection,
} from '../model-options';

interface AgentModelPickerProps {
  modelOptions: AgentModelOption[] | undefined;
  provider: string;
  model: string;
  disabled?: boolean;
  providerLabel?: string;
  modelLabel?: string;
  providerPlaceholder?: string;
  modelPlaceholder?: string;
  onChange: (next: { provider: string; model: string }) => void;
}

export function AgentModelPicker({
  modelOptions,
  provider,
  model,
  disabled,
  providerLabel = 'Provider',
  modelLabel = 'Model',
  providerPlaceholder = 'Select provider',
  modelPlaceholder = 'Select model',
  onChange,
}: AgentModelPickerProps) {
  const selection = normalizeAgentModelSelection(provider, model, modelOptions);
  const providerValue = selection.provider;
  const providerChoices = React.useMemo(
    () => Array.from(new Set((modelOptions || []).map((option) => option.provider))).sort(),
    [modelOptions]
  );
  const filteredModels = React.useMemo(
    () => (providerValue ? getAgentModelOptionsForProvider(providerValue, modelOptions) : (modelOptions || [])),
    [modelOptions, providerValue]
  );
  const selectedModel = filteredModels.find((option) => option.config_model_id === selection.model);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>{providerLabel}</Label>
        <Select
          value={providerValue}
          onValueChange={(nextProvider) => {
            const nextModel = getAgentModelOptionsForProvider(nextProvider, modelOptions)[0];
            onChange({
              provider: nextProvider,
              model: nextModel?.config_model_id || '',
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder={disabled ? 'Loading...' : providerPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {providerChoices.length === 0 ? (
              <SelectItem value="__empty__" disabled>
                No configured providers
              </SelectItem>
            ) : (
              providerChoices.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{modelLabel}</Label>
        <Select
          value={selectedModel?.config_model_id || ''}
          onValueChange={(nextModelId) => {
            const nextModel = (filteredModels || []).find((option) => option.config_model_id === nextModelId);
            if (!nextModel) return;
            onChange({ provider: nextModel.provider, model: nextModel.config_model_id });
          }}
          disabled={disabled || filteredModels.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={disabled ? 'Loading...' : modelPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {filteredModels.length === 0 ? (
              <SelectItem value="__empty__" disabled>
                No models available
              </SelectItem>
            ) : (
              filteredModels.map((option) => (
                <SelectItem key={option.config_model_id} value={option.config_model_id}>
                  {getAgentModelLabel(option)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
