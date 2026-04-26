/**
 * health.ts — IPC handlers for the health namespace.
 *
 * Invoke channels (renderer → main, returns Result):
 *   health:checkClaude    → checkClaude() from healthCheck module
 *   health:checkPlugin    → checkArchitectorPlugin(claudePath)
 *   health:installPlugin  → installArchitectorPlugin(claudePath, userData)
 *   health:cancelInstall  → getActiveInstallHandle()?.cancel()
 */

import { IPC } from '@shared/ipc';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { checkClaude } from '@main/terminal/healthCheck';
import { checkArchitectorPlugin } from '@main/terminal/pluginCheck';
import { installArchitectorPlugin, getActiveInstallHandle } from '@main/terminal/pluginInstall';
import { resolveClaudeBin } from '@main/terminal/resolveClaudeBin';
import { ok, err } from '@shared/result';
import { HealthErrorCode } from '@shared/errors';
import { app } from 'electron';

async function resolveClaudePathForHandler(): Promise<string> {
  const e2eBin = process.env['ATRIUM_E2E_CLAUDE_BIN'];
  if (e2eBin && process.env['NODE_ENV'] !== 'production' && !app.isPackaged) {
    return e2eBin;
  }
  return resolveClaudeBin();
}

export function registerHealthHandlers(ipcMainLike: IpcMainLike = defaultIpcMain): void {
  safeHandle(
    IPC.health.checkClaude,
    () => checkClaude(),
    ipcMainLike,
  );

  safeHandle(
    IPC.health.checkPlugin,
    async () => {
      let claudePath: string;
      try {
        claudePath = await resolveClaudePathForHandler();
      } catch {
        return err(HealthErrorCode.CLAUDE_NOT_FOUND, "'claude' not on PATH — check your installation");
      }
      return checkArchitectorPlugin(claudePath);
    },
    ipcMainLike,
  );

  safeHandle(
    IPC.health.installPlugin,
    async () => {
      let claudePath: string;
      try {
        claudePath = await resolveClaudePathForHandler();
      } catch {
        return err(HealthErrorCode.CLAUDE_NOT_FOUND, "'claude' not on PATH — check your installation");
      }
      if (getActiveInstallHandle() !== null) {
        return ok({
          kind: 'failed' as const,
          step: 'marketplace-add' as const,
          code: HealthErrorCode.INSTALL_FAILED,
          message: 'another install is in flight',
          stdout: '',
          stderr: '',
        });
      }
      const { promise } = installArchitectorPlugin(claudePath, app.getPath('userData'));
      return ok(await promise);
    },
    ipcMainLike,
  );

  safeHandle(
    IPC.health.cancelInstall,
    async () => {
      getActiveInstallHandle()?.cancel();
      return ok(undefined);
    },
    ipcMainLike,
  );
}
