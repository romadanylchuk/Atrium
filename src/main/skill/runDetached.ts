/**
 * runDetached — fire-and-forget `claude -p /architector:<skill>` runner.
 *
 * INVARIANT: this module must NEVER import TerminalManager or touch any
 * TerminalId / TerminalState.  The probe pty is fully independent of the
 * single-slot terminal.  See decision §2 in the feature plan.
 */
import { spawn as ptySpawn } from 'node-pty';
import type { IPty } from 'node-pty';
import { app } from 'electron';
import { ok, err } from '@shared/result.js';
import { SkillErrorCode } from '@shared/errors.js';
import type { Result } from '@shared/result.js';
import type { DetachedRunRequest, DetachedRunResult } from '@shared/skill/detached.js';
import { resolveClaudeBin } from '@main/terminal/resolveClaudeBin.js';

export async function runDetached(
  req: DetachedRunRequest,
): Promise<Result<DetachedRunResult, SkillErrorCode>> {
  let claudePath: string;

  const e2eBin = process.env['ATRIUM_E2E_CLAUDE_BIN'];
  if (e2eBin && process.env['NODE_ENV'] !== 'production' && !app.isPackaged) {
    claudePath = e2eBin;
  } else {
    try {
      claudePath = await resolveClaudeBin();
    } catch {
      return err(SkillErrorCode.RUN_FAILED, "'claude' not on PATH — check your installation");
    }
  }

  return new Promise((resolve) => {
    let buffer = '';

    let pty: IPty;
    try {
      pty = ptySpawn(claudePath, ['-p', `/architector:${req.skill}`], {
        cwd: req.cwd,
        env: process.env as Record<string, string>,
        cols: 120,
        rows: 30,
        name: 'xterm-256color',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      resolve(err(SkillErrorCode.RUN_FAILED, message));
      return;
    }

    pty.onData((data: string) => {
      buffer += data;
    });

    pty.onExit(({ exitCode }: { exitCode: number | undefined }) => {
      const clean = buffer
        .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .trim();

      if ((exitCode ?? 1) === 0) {
        resolve(ok({ exitCode: 0, stdout: clean }));
        return;
      }

      const lastLine = clean.split('\n').filter(Boolean).pop() ?? '';
      const message = lastLine || `claude -p exited with code ${exitCode ?? 1}`;
      resolve(err(SkillErrorCode.RUN_FAILED, message));
    });
  });
}
