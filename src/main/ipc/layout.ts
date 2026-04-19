/**
 * layout.ts — IPC handlers for the layout namespace.
 *
 * Invoke channels (renderer → main, returns Result):
 *   layout:load  → loadLayoutByHash(hash)
 *   layout:save  → saveLayoutByHash(hash, data)
 *
 * Fire-and-forget channel (renderer → main, no response):
 *   layout:saveSnapshot → buffer.setSnapshot(hash, data) for before-quit flush
 */

import { IPC } from '@shared/ipc';
import { err } from '@shared/result';
import { LayoutErrorCode } from '@shared/errors';
import type { LayoutFileV1 } from '@shared/layout';
import { loadLayoutByHash, saveLayoutByHash } from '@main/storage/layout';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { defaultBuffer, type LayoutSaveBuffer } from './layoutSaveBuffer';

export function registerLayoutHandlers(
  ipcMainLike: IpcMainLike = defaultIpcMain,
  buffer: LayoutSaveBuffer = defaultBuffer,
): void {
  safeHandle(
    IPC.layout.load,
    (_, hash) => {
      if (typeof hash !== 'string') {
        return Promise.resolve(err(LayoutErrorCode.IO_FAILED, 'hash must be a string'));
      }
      return loadLayoutByHash(hash);
    },
    ipcMainLike,
  );

  safeHandle(
    IPC.layout.save,
    (_, hash, data) => {
      if (typeof hash !== 'string') {
        return Promise.resolve(err(LayoutErrorCode.IO_FAILED, 'hash must be a string'));
      }
      return saveLayoutByHash(hash, data as LayoutFileV1);
    },
    ipcMainLike,
  );

  ipcMainLike.on(IPC.layout.saveSnapshot, (_, hash, data) => {
    if (typeof hash === 'string' && data != null) {
      buffer.setSnapshot(hash, data as LayoutFileV1);
    }
  });
}
