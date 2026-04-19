/**
 * dialog.ts — IPC handlers for the dialog namespace.
 *
 * Channels registered:
 *   dialog:openFolder → showOpenFolder(window)
 *
 * BrowserWindow is accepted via a getWindow() accessor, never imported globally.
 * Type-only import prevents pulling BrowserWindow as a value into the module.
 */

import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { IPC } from '@shared/ipc';
import { showOpenFolder } from '@main/project';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { ok } from '@shared/result';

export function registerDialogHandlers(
  getWindow: () => BrowserWindow | null,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  // dialog:openFolder — shows native folder picker; cancelled → Result.ok(null)
  safeHandle(
    IPC.dialog.openFolder,
    async () => {
      // E2E stub: bypass native dialog when the override env var is set.
      if (process.env['ATRIUM_E2E_FOLDER'] && process.env['NODE_ENV'] !== 'production' && !app.isPackaged) {
        return ok(process.env['ATRIUM_E2E_FOLDER']);
      }
      return showOpenFolder(getWindow());
    },
    ipcMainLike,
  );
}
