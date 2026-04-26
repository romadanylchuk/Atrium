/**
 * Standalone health-check probe for the `claude` CLI binary.
 *
 * INVARIANT: this module must NEVER import TerminalManager or touch any TerminalId /
 * TerminalState.  The probe pty is fully independent and is killed before the
 * function returns.  See "singleton-slot invariant" in the feature plan Phase 6.
 */
import { spawn as ptySpawn } from 'node-pty';
import { app } from 'electron';
import { ok, err } from '@shared/result.js';
import { HealthErrorCode } from '@shared/errors.js';
import type { Result } from '@shared/result.js';
import type { HealthInfo } from '@shared/domain.js';
import { resolveClaudeBin } from './resolveClaudeBin.js';

export const HEALTH_TIMEOUT_MS = 5_000;

export async function checkClaude(): Promise<Result<HealthInfo, typeof HealthErrorCode[keyof typeof HealthErrorCode]>> {
  let claudePath: string;

  // E2E override: use the injected binary path directly, skip PATH resolution.
  const e2eBin = process.env['ATRIUM_E2E_CLAUDE_BIN'];
  if (e2eBin && process.env['NODE_ENV'] !== 'production' && !app.isPackaged) {
    claudePath = e2eBin;
  } else {
    try {
      claudePath = await resolveClaudeBin();
    } catch {
      return err(HealthErrorCode.CLAUDE_NOT_FOUND, "'claude' not on PATH — check your installation");
    }
  }

  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;

    const pty = ptySpawn(claudePath, ['--version'], {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      cols: 120,
      rows: 30,
      name: 'xterm-256color',
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { pty.kill(); } catch { /* ignore */ }
      resolve(err(HealthErrorCode.HEALTH_TIMEOUT, `claude --version did not respond within ${HEALTH_TIMEOUT_MS}ms`));
    }, HEALTH_TIMEOUT_MS);

    pty.onData((data: string) => {
      buffer += data;
    });

    pty.onExit(({ exitCode }: { exitCode: number | undefined }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if ((exitCode ?? 1) !== 0) {
        resolve(err(HealthErrorCode.VERSION_UNPARSEABLE, `${buffer}, path: ${claudePath}`));
        return;
      }

      // Strip ANSI/VT100 escape sequences before parsing and returning.
      const clean = buffer.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').trim();

      if (!/\d+\.\d+\.\d+/.test(clean)) {
        resolve(err(HealthErrorCode.VERSION_UNPARSEABLE, `could not parse version; claude path: ${claudePath}`));
        return;
      }

      resolve(ok({ claudePath, version: clean }));
    });
  });
}
