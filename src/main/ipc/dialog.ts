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
import { IPC } from '@shared/ipc';
import { showOpenFolder } from '@main/project';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';

export function registerDialogHandlers(
  getWindow: () => BrowserWindow | null,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  // dialog:openFolder — shows native folder picker; cancelled → Result.ok(null)
  safeHandle(
    IPC.dialog.openFolder,
    async () => {
      return showOpenFolder(getWindow());
    },
    ipcMainLike,
  );
}
