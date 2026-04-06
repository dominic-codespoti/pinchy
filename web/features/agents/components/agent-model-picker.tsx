'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AgentModelOption } from '@/features/settings';
import {
  ensureCopilotFallbackModelOption,
  getAgentModelLabel,
  getAgentProviderDisplayLabel,
  getAgentModelOptionsForProvider,
  getAgentModelOptionKey,
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
  const normalizedOptions = React.useMemo(
    () => ensureCopilotFallbackModelOption(modelOptions),
    [modelOptions]
  );
  const selection = normalizeAgentModelSelection(provider, model, normalizedOptions);
  const providerValue = selection.provider;
  const providerChoices = React.useMemo(
    () => Array.from(new Set(normalizedOptions.map((option) => option.provider))).sort(),
    [normalizedOptions]
  );
  const filteredModels = React.useMemo(
    () => (providerValue ? getAgentModelOptionsForProvider(providerValue, normalizedOptions) : normalizedOptions),
    [normalizedOptions, providerValue]
  );
  const selectedModel = filteredModels.find((option) => getAgentModelOptionKey(option) === selection.model);

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
              model: nextModel ? getAgentModelOptionKey(nextModel) : '',
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
                  {getAgentProviderDisplayLabel(option)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{modelLabel}</Label>
        <Select
          value={selectedModel ? getAgentModelOptionKey(selectedModel) : ''}
          onValueChange={(nextModelId) => {
            const nextModel = (filteredModels || []).find((option) => getAgentModelOptionKey(option) === nextModelId);
            if (!nextModel) return;
            onChange({ provider: nextModel.provider, model: getAgentModelOptionKey(nextModel) });
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
                  <SelectItem key={getAgentModelOptionKey(option)} value={getAgentModelOptionKey(option)}>
                    <div className="flex flex-col">
                      <span>{getAgentModelLabel(option)}</span>
                      {option.description ? (
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      ) : null}
                    </div>
                  </SelectItem>
                ))
              )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
