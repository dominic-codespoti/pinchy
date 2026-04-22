import type { AgentModelOption, ModelInfo } from '@/features/settings';

const MODEL_REF_KEYS = ['config_model_id', 'model_id', 'model', 'id', 'model_name', 'name'] as const;
const STABLE_MODEL_REF_KEYS = ['config_model_id', 'model_id', 'model', 'id'] as const;

export interface AgentModelSelection {
  provider: string;
  model: string;
  option?: AgentModelOption;
}

export interface ReasoningPresetOption {
  value: string;
  label: string;
}

export interface ReasoningControlSpec {
  label: string;
  description: string;
  options: ReasoningPresetOption[];
  defaultValue: string;
  visible: boolean;
}

export type AgentModelSelectionMode = 'display' | 'save';

const DEFAULT_REASONING_SPEC: ReasoningControlSpec = {
  label: 'Reasoning Preset',
  description: 'Generic reasoning preset. Exact behavior varies by provider and model.',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ],
  defaultValue: 'medium',
  visible: true,
};

const OPENAI_REASONING_SPEC: ReasoningControlSpec = {
  label: 'Reasoning Effort',
  description: 'OpenAI reasoning effort. Supported levels vary by model family.',
  options: [
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ],
  defaultValue: 'medium',
  visible: true,
};

const CLAUDE_REASONING_SPEC: ReasoningControlSpec = {
  label: 'Thinking Preset',
  description: 'Anthropic-native thinking uses adaptive or budgeted reasoning under the hood.',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ],
  defaultValue: 'medium',
  visible: true,
};

const GEMINI_REASONING_SPEC: ReasoningControlSpec = {
  label: 'Thinking Preset',
  description: 'Gemini maps these presets to provider-specific thinking levels or token budgets.',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ],
  defaultValue: 'medium',
  visible: true,
};

const COPILOT_REASONING_SPEC: ReasoningControlSpec = {
  label: 'Reasoning Preset',
  description: 'Copilot routes requests to different providers. This preset is translated heuristically per model.',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ],
  defaultValue: 'medium',
  visible: true,
};

const HIDDEN_REASONING_SPEC: ReasoningControlSpec = {
  label: 'Reasoning',
  description: 'This model does not advertise reasoning support in the model inventory.',
  options: [],
  defaultValue: 'medium',
  visible: false,
};

export function getAgentModelOptionKey(option: AgentModelOption): string {
  return option.config_model_id || option.model_id || option.model || option.id;
}

function hasAgentModelReference(option: AgentModelOption, reference: string): boolean {
  return STABLE_MODEL_REF_KEYS.some((key) => option[key] === reference);
}

export function resolveAgentModelOption(
  value: string | undefined | null,
  options: AgentModelOption[] | undefined
): AgentModelOption | undefined {
  const normalized = value?.trim();
  if (!normalized || !options?.length) return undefined;

  return options.find((option) =>
    getAgentModelOptionKey(option) === normalized || MODEL_REF_KEYS.some((key) => option[key] === normalized)
  );
}

export function isValidAgentModelOption(
  value: string | undefined | null,
  options: AgentModelOption[] | undefined
): boolean {
  return !!resolveAgentModelOption(value, options);
}

export function getAgentModelLabel(option: AgentModelOption): string {
  return option.name || option.model_name || option.model || option.id;
}

export function getAgentProviderDisplayLabel(provider: string | undefined | null): string {
  const normalized = provider?.trim();
  if (!normalized) return 'Unknown provider';

  switch (normalized) {
    case 'copilot':
      return 'Copilot';
    case 'azure-openai':
      return 'Azure OpenAI';
    case 'google':
      return 'Google';
    case 'bedrock':
      return 'Bedrock';
    case 'xai':
      return 'xAI';
    case 'lmstudio':
      return 'LM Studio';
    default:
      return normalized
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function getAgentModelProvider(option?: AgentModelOption): string {
  return option?.provider || '';
}

export function getSelectedAgentModelLabel(
  value: string | undefined | null,
  options: AgentModelOption[] | undefined
): string {
  const option = resolveAgentModelOption(value, options);
  if (option) return getAgentModelLabel(option);
  return value?.trim() ? 'Unconfigured model' : 'Default model';
}

export function getSelectedAgentProviderLabel(
  provider: string | undefined | null,
  model: string | undefined | null,
  options: AgentModelOption[] | undefined
): string {
  const stored = provider?.trim();
  if (stored) return getAgentProviderDisplayLabel(stored);

  const option = resolveAgentModelOption(model, options);
  return getAgentProviderDisplayLabel(option?.provider || (model?.trim() ? 'unknown-provider' : ''));
}

export function getAgentModelProviderLabel(
  provider: string | undefined | null,
  model: string | undefined | null,
  options: AgentModelOption[] | undefined
): string {
  const stored = provider?.trim();
  if (stored) return getAgentProviderDisplayLabel(stored);

  const option = resolveAgentModelOption(model, options);
  return getAgentProviderDisplayLabel(option?.provider || (model?.trim() ? 'unknown-provider' : ''));
}

export function getAgentModelFormValue(
  value: string | undefined | null,
  options: AgentModelOption[] | undefined
): string {
  const option = resolveAgentModelOption(value, options);
  return option?.config_model_id || value?.trim() || '';
}

export function getAgentModelOptionsForProvider(
  provider: string,
  options: AgentModelOption[] | undefined
) {
  const normalized = provider.trim();
  const filtered = (options || []).filter((option) => option.provider === normalized);
  return filtered.sort((a, b) => getAgentModelLabel(a).localeCompare(getAgentModelLabel(b)));
}

export function normalizeAgentModelSelection(
  provider: string | undefined | null,
  model: string | undefined | null,
  options: AgentModelOption[] | undefined,
  mode: AgentModelSelectionMode = 'display'
): AgentModelSelection {
  const normalizedProvider = provider?.trim() || '';
  const normalizedModel = model?.trim() || '';

  if (!options?.length) {
    return { provider: normalizedProvider, model: normalizedModel };
  }

  const selected = resolveAgentModelOption(normalizedModel, options);
  if (selected) {
    return {
      provider: selected.provider || normalizedProvider,
      model: getAgentModelOptionKey(selected) || normalizedModel,
      option: selected,
    };
  }

  if (!normalizedProvider) {
    return { provider: '', model: '' };
  }

  return {
    provider: normalizedProvider,
    model: normalizedModel,
  };
}

export function groupAgentModelOptions(options: AgentModelOption[] | undefined) {
  const grouped = new Map<string, AgentModelOption[]>();

  for (const option of options || []) {
    const provider = option.provider || 'Other';
    const items = grouped.get(provider) || [];
    items.push(option);
    grouped.set(provider, items);
  }

  return Array.from(grouped.entries())
    .map(([provider, items]) => ({
      provider,
      options: items.sort((a, b) => getAgentModelLabel(a).localeCompare(getAgentModelLabel(b))),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

export function ensureCopilotFallbackModelOption(
  options: AgentModelOption[] | undefined
): AgentModelOption[] {
  const list = options ? [...options] : [];
  const deduped: AgentModelOption[] = [];
  const seen = new Set<string>();

  for (const option of list) {
    const key = getAgentModelOptionKey(option);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(option);
  }

  return deduped;
}

function normalizeModelReference(
  provider: string | undefined | null,
  model: string | undefined | null,
  option?: AgentModelOption,
): { provider: string; model: string } {
  return {
    provider: (option?.provider || provider || '').toLowerCase(),
    model: (option?.model || option?.model_id || option?.config_model_id || model || '').toLowerCase(),
  };
}

function hasReasoningSupport(
  provider: string | undefined | null,
  model: string | undefined | null,
  modelInventory: ModelInfo[] | undefined,
): boolean | undefined {
  const normalizedProvider = (provider || '').trim().toLowerCase();
  const normalizedModel = (model || '').trim();
  if (!normalizedProvider || !normalizedModel || !modelInventory?.length) {
    return undefined;
  }

  const match = modelInventory.find((candidate) =>
    candidate.provider.toLowerCase() === normalizedProvider && candidate.id === normalizedModel,
  );

  return match?.reasoning;
}

export function getReasoningControlSpec(
  provider: string | undefined | null,
  model: string | undefined | null,
  option?: AgentModelOption,
  modelInventory?: ModelInfo[],
): ReasoningControlSpec {
  const ref = normalizeModelReference(provider, model, option);
  const reasoningSupport = hasReasoningSupport(ref.provider, ref.model, modelInventory);

  if (reasoningSupport === false) {
    return HIDDEN_REASONING_SPEC;
  }

  if (ref.provider === 'openai' || ref.provider === 'azure-openai') {
    return OPENAI_REASONING_SPEC;
  }

  if (ref.provider === 'anthropic') {
    return CLAUDE_REASONING_SPEC;
  }

  if (ref.provider === 'google' || ref.provider === 'vertex') {
    return GEMINI_REASONING_SPEC;
  }

  if (ref.provider === 'copilot') {
    if (ref.model.includes('claude')) {
      return {
        ...COPILOT_REASONING_SPEC,
        description: 'Copilot Claude models map this preset to Anthropic thinking controls heuristically.',
      };
    }

    if (ref.model.includes('gemini')) {
      return {
        ...COPILOT_REASONING_SPEC,
        description: 'Copilot Gemini models map this preset to Gemini-compatible thinking controls heuristically.',
      };
    }

    if (ref.model.startsWith('gpt-') || ref.model.includes('codex') || ref.model.startsWith('o')) {
      return {
        ...OPENAI_REASONING_SPEC,
        description: 'Copilot routes this model through an OpenAI-compatible reasoning surface.',
      };
    }

    return COPILOT_REASONING_SPEC;
  }

  return DEFAULT_REASONING_SPEC;
}
