/**
 * terminal.ts — IPC handlers for the terminal namespace.
 *
 * Invoke channels (renderer → main, returns Result):
 *   terminal:spawn  → manager.spawn(args, cwd)
 *   terminal:kill   → manager.kill(id)
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

export function registerTerminalHandlers(manager: TerminalManager, ipcMainLike: IpcMainFullLike = defaultIpcMain): void {
  safeHandle(
    IPC.terminal.spawn,
    (_, args, cwd) => Promise.resolve(manager.spawn(args as string[], cwd as string)),
    ipcMainLike,
  );

  safeHandle(
    IPC.terminal.kill,
    (_, id) => Promise.resolve(manager.kill(id as TerminalId)),
    ipcMainLike,
  );

  ipcMainLike.on(IPC.terminal.write, (_, id, data) => manager.write(id as TerminalId, data as ArrayBuffer));

  ipcMainLike.on(IPC.terminal.resize, (_, id, cols, rows) =>
    manager.resize(id as TerminalId, cols as number, rows as number),
  );
}
