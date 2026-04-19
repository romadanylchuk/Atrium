import { app } from 'electron';
import path from 'node:path';

let cached: string | null = null;

export function resolveSkillsPath(): string {
  if (cached !== null) return cached;
  cached = app.isPackaged
    ? path.join(process.resourcesPath, 'skills')
    : path.join(app.getAppPath(), '.claude/skills');
  return cached;
}
