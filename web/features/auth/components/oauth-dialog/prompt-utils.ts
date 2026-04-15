import type { AuthPrompt, AuthPromptCondition } from '@/features/settings/types';

/**
 * Check if a prompt's condition is satisfied based on current form values.
 * A prompt is visible if:
 * - It has no condition, OR
 * - All condition key-value pairs match the current form values
 */
export function isPromptVisible(
  prompt: AuthPrompt,
  formValues: Record<string, string>
): boolean {
  const condition = prompt.type === 'text' ? prompt.condition : prompt.condition;
  if (!condition) return true;

  for (const [key, expectedValue] of Object.entries(condition)) {
    const actualValue = formValues[key];
    if (actualValue !== expectedValue) {
      return false;
    }
  }
  return true;
}

/**
 * Filter prompts to only those that should be visible based on current form values.
 */
export function getVisiblePrompts(
  prompts: AuthPrompt[],
  formValues: Record<string, string>
): AuthPrompt[] {
  return prompts.filter((prompt) => isPromptVisible(prompt, formValues));
}

/**
 * Get the key for a prompt (works for both Text and Select prompts).
 */
export function getPromptKey(prompt: AuthPrompt): string {
  return prompt.key;
}

/**
 * Check if all visible prompts have values.
 */
export function areAllVisiblePromptsFilled(
  prompts: AuthPrompt[],
  formValues: Record<string, string>
): boolean {
  const visiblePrompts = getVisiblePrompts(prompts, formValues);
  return visiblePrompts.every((prompt) => {
    const value = formValues[getPromptKey(prompt)];
    return value && value.trim().length > 0;
  });
}
