/**
 * terminal.ts — IPC handlers for the terminal namespace.
 *
 * Invoke channels (renderer → main, returns Result):
 *   terminal:spawn  → manager.spawn(args, cwd)
 *   terminal:kill   → manager.kill(id)
 *   terminal:close  → manager.closeAfterExit(id) (errors swallowed, always returns ok)
 *
 * Fire-and-forget channels (renderer → main, no response):
 *   terminal:write  → manager.write(id, data)
 *   terminal:resize → manager.resize(id, cols, rows)
 *
 * Push channels (main → renderer via webContents.send — nothing to register here):
 *   terminal:onData  — TerminalManager pushes ArrayBuffer chunks from node-pty
 *   terminal:onExit  — TerminalManager pushes exit code when pty process exits
 */

import { IPC } from '@shared/ipc';
import { ok } from '@shared/result';
import { TerminalErrorCode } from '@shared/errors';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import { TerminalManager } from '@main/terminal';
import type { TerminalId } from '@shared/domain';

// Minimal on-subscriber interface (subset of IpcMain)
export interface IpcMainOnLike {
  on(channel: string, listener: (...args: unknown[]) => void): void;
}

// Combined interface for handlers that need both handle and on
export interface IpcMainFullLike extends IpcMainLike, IpcMainOnLike {}

export function registerTerminalHandlers(
  manager: TerminalManager,
  ipcMainLike?: IpcMainFullLike,
  consultationManager?: TerminalManager,
): void {
  const ipc = ipcMainLike ?? defaultIpcMain;

  safeHandle(
    IPC.terminal.spawn,
    (_, args, cwd) => Promise.resolve(manager.spawn(args as string[], cwd as string)),
    ipc,
  );

  safeHandle(
    IPC.terminal.kill,
    (_, id) => {
      const r = manager.kill(id as TerminalId);
      if (!r.ok && r.error.code === TerminalErrorCode.INVALID_HANDLE && consultationManager) {
        return Promise.resolve(consultationManager.kill(id as TerminalId));
      }
      return Promise.resolve(r);
    },
    ipc,
  );

  safeHandle(
    IPC.terminal.close,
    (_, id) => {
      let result = manager.closeAfterExit(id as TerminalId);
      if (!result.ok && result.error.code === TerminalErrorCode.INVALID_HANDLE && consultationManager) {
        result = consultationManager.closeAfterExit(id as TerminalId);
      }
      if (!result.ok) {
        console.warn(
          `[atrium:terminal] close ignored: code=${result.error.code} message=${result.error.message}`,
        );
        return Promise.resolve(ok(undefined));
      }
      return Promise.resolve(result);
    },
    ipc,
  );

  ipc.on(IPC.terminal.write, (_, id, data) => {
    manager.write(id as TerminalId, data as ArrayBuffer);
    consultationManager?.write(id as TerminalId, data as ArrayBuffer);
  });

  ipc.on(IPC.terminal.resize, (_, id, cols, rows) => {
    manager.resize(id as TerminalId, cols as number, rows as number);
    consultationManager?.resize(id as TerminalId, cols as number, rows as number);
  });
}
