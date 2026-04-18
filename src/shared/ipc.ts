/**
 * IPC channel name constants — single source of truth for both main and preload.
 *
 * Usage:
 *   import { IPC } from '@shared/ipc';
 *   ipcMain.handle(IPC.project.open, handler);
 *   ipcRenderer.invoke(IPC.project.open, path);
 *
 * No Electron, Node, or React imports — safe for @shared.
 */

export const IPC = {
  project: {
    open: 'project:open',
    switch: 'project:switch',
    getRecents: 'project:getRecents',
  },
  dialog: {
    openFolder: 'dialog:openFolder',
  },
  fileSync: {
    startWatching: 'fileSync:startWatching',
    stopWatching: 'fileSync:stopWatching',
    onChanged: 'fileSync:onChanged',
  },
  terminal: {
    spawn: 'terminal:spawn',
    kill: 'terminal:kill',
    write: 'terminal:write',
    resize: 'terminal:resize',
    onData: 'terminal:onData',
    onExit: 'terminal:onExit',
    onError: 'terminal:onError',
  },
  health: {
    checkClaude: 'health:checkClaude',
  },
} as const;
