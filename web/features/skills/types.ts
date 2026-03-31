/**
 * Skills feature types
 */

export interface Skill {
  id: string;
  name: string;
  description?: string;
  operatorManaged?: boolean;
}

export interface SkillDetail extends Skill {
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  manifest?: string;
  instructions?: string;
  raw?: string;
}

export interface UpdateSkillInput {
  description?: string;
  instructions?: string;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  instructions: string;
}
