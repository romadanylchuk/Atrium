import { IPC } from '@shared/ipc';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { TerminalManager } from '@main/terminal';
import { composeCommand } from '@shared/skill/composeCommand';
import { err } from '@shared/result';
import { SkillErrorCode } from '@shared/errors';
import type { SkillSpawnRequest } from '@shared/skill/spawn';
import { runDetached } from '@main/skill/runDetached';
import type { DetachedRunRequest } from '@shared/skill/detached';

const VALID_SKILLS = new Set<string>(['init', 'explore', 'decide', 'map', 'finalize', 'free', 'new', 'triage', 'audit', 'status']);

export function registerSkillHandlers(
  terminalManager: TerminalManager,
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

      let args: string[];
      try {
        args = composeCommand({
          skill: req.skill,
          nodes: req.nodes,
          prompt: req.prompt,
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

  safeHandle(
    IPC.skill.runDetached,
    async (_event, rawReq) => {
      const req = rawReq as DetachedRunRequest;
      if (!VALID_SKILLS.has(req.skill)) {
        return err(SkillErrorCode.INVALID_SKILL, `unknown skill: ${req.skill}`);
      }
      return await runDetached(req);
    },
    ipcMainLike,
  );
}
