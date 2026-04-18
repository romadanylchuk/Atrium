/**
 * health.ts — IPC handlers for the health namespace.
 *
 * Invoke channels (renderer → main, returns Result):
 *   health:checkClaude → checkClaude() from healthCheck module
 */

import { IPC } from '@shared/ipc';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { checkClaude } from '@main/terminal/healthCheck';

export function registerHealthHandlers(ipcMainLike: IpcMainLike = defaultIpcMain): void {
  safeHandle(
    IPC.health.checkClaude,
    () => checkClaude(),
    ipcMainLike,
  );
}
