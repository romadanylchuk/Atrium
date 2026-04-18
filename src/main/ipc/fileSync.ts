/**
 * fileSync.ts — IPC handlers for the fileSync namespace.
 *
 * Invoke channels (renderer → main, returns Result):
 *   fileSync:startWatching → manager.start(dir)
 *   fileSync:stopWatching  → manager.stop()
 *
 * fileSync:onChanged is a main→renderer push channel (webContents.send).
 * WatcherManager sends it when @parcel/watcher fires and debounce settles.
 */

import { IPC } from '@shared/ipc';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { WatcherManager } from '@main/fileSync';

export function registerFileSyncHandlers(manager: WatcherManager, ipcMainLike: IpcMainLike = defaultIpcMain): void {
  safeHandle(
    IPC.fileSync.startWatching,
    (_, dir) => manager.start(dir as string),
    ipcMainLike,
  );

  safeHandle(
    IPC.fileSync.stopWatching,
    () => manager.stop(),
    ipcMainLike,
  );
}
