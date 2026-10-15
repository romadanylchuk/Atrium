import { app, shell } from 'electron';
import { IPC } from '@shared/ipc';
import { ok } from '@shared/result';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';

export function registerShellHandlers(
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  safeHandle(
    IPC.shell.openExternal,
    async (_event, url: unknown) => {
      if (typeof url === 'string' && url.startsWith('https://')) {
        await shell.openExternal(url);
      }
      return ok(undefined);
    },
    ipcMainLike,
  );
  safeHandle(
    IPC.shell.openLogsFolder,
    async () => {
      await shell.openPath(app.getPath('logs'));
      return ok(undefined);
    },
    ipcMainLike,
  );
}
