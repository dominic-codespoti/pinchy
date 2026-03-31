/**
 * Skills feature - vertical slice
 * 
 * Available skill modules for agents
 */

export { SkillsPage } from './components/skills-page';
export { CreateSkillDialog } from './components/create-skill-dialog';
export { EditSkillDialog } from './components/edit-skill-dialog';

// Types
export type {
  Skill,
  SkillDetail,
  UpdateSkillInput,
  CreateSkillInput,
} from './types';

// API
export {
  getSkills,
  getSkillDetail,
  updateSkill,
  createSkill,
  deleteSkill,
} from './api';

// Hooks
export {
  useSkills,
  useSkillDetail,
  useUpdateSkill,
  useCreateSkill,
  useDeleteSkill,
} from './hooks';
