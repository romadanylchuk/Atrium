/**
 * project.ts — IPC handlers for the project namespace.
 *
 * Channels registered:
 *   project:open      → openProject(path)
 *   project:switch    → openProject(path)  [Stage 03 will add watcher teardown + re-setup]
 *   project:getRecents → getRecents() wrapped in Result.ok
 *
 * All handlers go through safeHandle so thrown errors become Result.err(INTERNAL).
 */

import type { IpcMainInvokeEvent } from 'electron';
import nodePath from 'node:path';
import type { Result } from '@shared/result';
import { ok, err } from '@shared/result';
import { IPC } from '@shared/ipc';
import { ProjectErrorCode } from '@shared/errors';
import { openProject } from '@main/project';
import { getRecents } from '@main/storage';
import { WatcherManager } from '@main/fileSync';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';

export function registerProjectHandlers(
  watcherManager: WatcherManager,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  // project:open — open an Atrium project at the given absolute path
  safeHandle(
    IPC.project.open,
    async (_event: IpcMainInvokeEvent, path: unknown) => {
      if (typeof path !== 'string') {
        return err(ProjectErrorCode.PATH_NOT_FOUND, 'path must be a string');
      }
      const result = await openProject(path);
      if (result.ok) {
        await watcherManager.stop();
        const archDir = nodePath.join(path, '.ai-arch');
        const startResult = await watcherManager.start(archDir);
        if (!startResult.ok) {
          console.warn('[atrium:project] watcher start failed:', startResult.error.message);
        }
      }
      return result;
    },
    ipcMainLike,
  );

  // project:switch — stop prior subscription, start new one on success path.
  safeHandle(
    IPC.project.switch,
    async (_event: IpcMainInvokeEvent, path: unknown) => {
      if (typeof path !== 'string') {
        return err(ProjectErrorCode.PATH_NOT_FOUND, 'path must be a string');
      }
      const result = await openProject(path);
      if (result.ok) {
        await watcherManager.stop();
        const archDir = nodePath.join(path, '.ai-arch');
        const startResult = await watcherManager.start(archDir);
        if (!startResult.ok) {
          console.warn('[atrium:project] watcher start failed:', startResult.error.message);
        }
      }
      return result;
    },
    ipcMainLike,
  );

  // project:getRecents — returns the recent projects list wrapped in Result.ok
  safeHandle(
    IPC.project.getRecents,
    async (): Promise<Result<Awaited<ReturnType<typeof getRecents>>, ProjectErrorCode>> => {
      try {
        const recents = await getRecents();
        return ok(recents);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err(ProjectErrorCode.STORAGE_FAILED, message);
      }
    },
    ipcMainLike,
  );
}
