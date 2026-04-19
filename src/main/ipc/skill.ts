/**
 * skill.ts — IPC handler for the skill namespace.
 *
 * Invoke channel:
 *   skill:spawn  → resolves skillsDir, validates skill name, calls composeCommand,
 *                  spawns via TerminalManager
 *
 * The skillsPathFactory is injectable so tests don't need electron.app.
 */

import { IPC } from '@shared/ipc';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { TerminalManager } from '@main/terminal';
import { resolveSkillsPath } from '@main/skills';
import { composeCommand } from '@shared/skill/composeCommand';
import { err } from '@shared/result';
import { SkillErrorCode } from '@shared/errors';
import type { SkillSpawnRequest } from '@shared/skill/spawn';

const VALID_SKILLS = new Set<string>(['init', 'explore', 'decide', 'map', 'finalize', 'free']);

export function registerSkillHandlers(
  terminalManager: TerminalManager,
  skillsPathFactory: () => string = resolveSkillsPath,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  safeHandle(
    IPC.skill.spawn,
    // eslint-disable-next-line @typescript-eslint/require-await
    async (_event, rawReq) => {
      const req = rawReq as SkillSpawnRequest;

      if (!VALID_SKILLS.has(req.skill)) {
        return err(SkillErrorCode.INVALID_SKILL, `unknown skill: ${req.skill}`);
      }

      const skillsDir = skillsPathFactory();

      let args: string[];
      try {
        args = composeCommand({
          skill: req.skill,
          nodes: req.nodes,
          prompt: req.prompt,
          skillsDir,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err(SkillErrorCode.COMPOSE_FAILED, message);
      }

      const result = terminalManager.spawn(args, req.cwd);
      if (!result.ok) {
        return err(SkillErrorCode.SPAWN_FAILED, result.error.message);
      }
      return result;
    },
    ipcMainLike,
  );
}
