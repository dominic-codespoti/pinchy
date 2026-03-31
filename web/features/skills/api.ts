/**
 * Skills feature API functions
 */

import { fetchApi } from '@/shared/api/client';
import { Skill, SkillDetail, UpdateSkillInput, CreateSkillInput } from './types';

export async function getSkills(): Promise<Skill[]> {
  const response = await fetchApi<{
    skills: { id: string; description?: string; operator_managed?: boolean }[];
  }>('/api/skills');
  return response.skills.map((s) => ({
    id: s.id,
    name: s.id,
    description: s.description,
    operatorManaged: s.operator_managed ?? false,
  }));
}

export async function getSkillDetail(name: string): Promise<SkillDetail> {
  const response = await fetchApi<{
    id: string;
    description?: string;
    operator_managed?: boolean;
    license?: string;
    compatibility?: string;
    metadata?: Record<string, unknown>;
    manifest?: string;
    instructions?: string;
    raw?: string;
    reference_files?: string[];
    allowed_tools?: string;
  }>(`/api/skills/${encodeURIComponent(name)}`);

  return {
    id: response.id,
    name: response.id,
    description: response.description,
    operatorManaged: response.operator_managed ?? false,
    license: response.license,
    compatibility: response.compatibility,
    metadata: response.metadata as Record<string, string> | undefined,
    manifest: response.manifest,
    instructions: response.instructions,
    raw: response.raw,
    referenceFiles: response.reference_files,
    allowedTools: response.allowed_tools,
  };
}

export async function updateSkill(
  skillName: string,
  updates: UpdateSkillInput
): Promise<{ id: string; updated: boolean }> {
  return fetchApi<{ id: string; updated: boolean }>(
    `/api/skills/${encodeURIComponent(skillName)}`,
    {
      method: 'PUT',
      body: JSON.stringify(updates),
    }
  );
}

export async function createSkill(
  name: string,
  description: string,
  instructions: string
): Promise<{ id: string; created: boolean }> {
  return fetchApi<{ id: string; created: boolean }>('/api/skills', {
    method: 'POST',
    body: JSON.stringify({ name, description, instructions }),
  });
}

export async function deleteSkill(
  skillName: string
): Promise<{ status: string; name: string }> {
  return fetchApi<{ status: string; name: string }>(
    `/api/skills/${encodeURIComponent(skillName)}`,
    {
      method: 'DELETE',
    }
  );
}
