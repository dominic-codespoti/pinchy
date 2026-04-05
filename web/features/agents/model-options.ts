import type { AgentModelOption } from '@/features/settings';

const MODEL_REF_KEYS = ['config_model_id', 'id', 'model', 'model_id', 'model_name', 'name'] as const;

export interface AgentModelSelection {
  provider: string;
  model: string;
  option?: AgentModelOption;
}

export function resolveAgentModelOption(
  value: string | undefined | null,
  options: AgentModelOption[] | undefined
): AgentModelOption | undefined {
  const normalized = value?.trim();
  if (!normalized || !options?.length) return undefined;

  return options.find((option) =>
    MODEL_REF_KEYS.some((key) => option[key] === normalized)
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

export function getAgentModelProviderLabel(
  value: string | undefined | null,
  options: AgentModelOption[] | undefined
): string {
  const option = resolveAgentModelOption(value, options);
  return option?.provider || (value?.trim() ? 'Unknown provider' : 'unknown provider');
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
  options: AgentModelOption[] | undefined
): AgentModelSelection {
  if (!options?.length) {
    return { provider: provider?.trim() || '', model: model?.trim() || '' };
  }

  const selected = resolveAgentModelOption(model, options);
  const resolvedProvider = selected?.provider || provider?.trim() || '';
  const providerOptions = resolvedProvider ? getAgentModelOptionsForProvider(resolvedProvider, options) : [];

  if (!selected && !resolvedProvider) {
    return { provider: '', model: '' };
  }

  const modelOption = selected && selected.provider === resolvedProvider ? selected : providerOptions[0];

  return {
    provider: modelOption?.provider || resolvedProvider || options[0]?.provider || '',
    model: modelOption?.config_model_id || options[0]?.config_model_id || '',
    option: modelOption,
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
