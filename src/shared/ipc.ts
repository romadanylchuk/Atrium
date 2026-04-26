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
    close: 'terminal:close',
    write: 'terminal:write',
    resize: 'terminal:resize',
    onData: 'terminal:onData',
    onExit: 'terminal:onExit',
    onError: 'terminal:onError',
  },
  health: {
    checkClaude: 'health:checkClaude',
    checkPlugin: 'health:checkPlugin',
    installPlugin: 'health:installPlugin',
    cancelInstall: 'health:cancelInstall',
  },
  layout: {
    load: 'layout:load',
    save: 'layout:save',
    saveSnapshot: 'layout:saveSnapshot',
  },
  skill: {
    spawn: 'skill:spawn',
    runDetached: 'skill:runDetached',
  },
  consultation: {
    sendMessage: 'consultation:sendMessage',
    loadThread: 'consultation:loadThread',
    newSession: 'consultation:newSession',
    cancel: 'consultation:cancel',
    streamChunk: 'consultation:stream:chunk',
    streamComplete: 'consultation:stream:complete',
    streamError: 'consultation:stream:error',
  },
  shell: {
    openExternal: 'shell:openExternal',
  },
} as const;
