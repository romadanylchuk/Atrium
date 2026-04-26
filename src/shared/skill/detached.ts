import type { SkillName } from './composeCommand.js';

export type DetachedSkillName = Extract<SkillName, 'audit' | 'status'>;

export interface DetachedRunRequest {
  skill: DetachedSkillName;
  cwd: string;
}

export interface DetachedRunResult {
  exitCode: number;
  stdout: string;
}
