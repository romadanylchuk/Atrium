export type { SkillName } from './composeCommand.js';

export interface SkillSpawnRequest {
  skill: import('./composeCommand.js').SkillName;
  nodes?: string[];
  prompt?: string;
  cwd: string;
}
