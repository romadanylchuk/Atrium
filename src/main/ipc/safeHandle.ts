/**
 * safeHandle.ts — wraps ipcMain.handle with a try/catch envelope.
 *
 * Enforces the invariant: "no thrown strings cross the IPC bridge."
 * Any handler that throws (sync or async) is caught and converted to
 * Result.err(CommonErrorCode.INTERNAL, message).
 *
 * The `ipcMainLike` parameter is optional; when omitted the real ipcMain
 * from ipcModule.ts is used. Tests inject a fake ipcMainLike via this param.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Result } from '@shared/result';
import { err } from '@shared/result';
import { CommonErrorCode } from '@shared/errors';
import { ipcMain as defaultIpcMain } from './ipcModule';

// ---------------------------------------------------------------------------
// Minimal interface for the ipcMain surface used here — keeps tests simple
// ---------------------------------------------------------------------------

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
}

// ---------------------------------------------------------------------------
// safeHandle
// ---------------------------------------------------------------------------

/**
 * Register a channel handler that always returns a Result envelope.
 * Thrown errors (sync or async) are converted to Result.err(INTERNAL, …).
 *
 * @param channel  IPC channel string (use IPC.ns.key constants).
 * @param fn       Handler function — receives (event, ...args) and returns Promise<Result>.
 * @param ipcMainLike  Optional injectable ipcMain — defaults to the real Electron ipcMain.
 */
export function safeHandle<T, E>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<Result<T, E>>,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  ipcMainLike.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(CommonErrorCode.INTERNAL, message);
    }
  });
}
