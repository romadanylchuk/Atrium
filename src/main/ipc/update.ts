import { IPC } from '@shared/ipc';
import { ok } from '@shared/result';
import type { UpdateStatus } from '@shared/update';
import type { UpdateService } from '@main/updater/updateService';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';

const IDLE: UpdateStatus = { kind: 'idle' };

/** `updateService` is absent in dev builds; every handler then reports `idle` / does nothing. */
export function registerUpdateHandlers(
  updateService: UpdateService | undefined,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  safeHandle(
    IPC.update.getStatus,
    () => Promise.resolve(ok(updateService?.getStatus() ?? IDLE)),
    ipcMainLike,
  );
  safeHandle(
    IPC.update.download,
    async () => {
      await updateService?.download();
      return ok(undefined);
    },
    ipcMainLike,
  );
  safeHandle(
    IPC.update.openReleasePage,
    async () => {
      await updateService?.openReleasePage();
      return ok(undefined);
    },
    ipcMainLike,
  );
}
