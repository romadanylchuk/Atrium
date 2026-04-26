/**
 * Preload script — contextBridge surface.
 *
 * Exposes `window.atrium` to the renderer. All communication with the main
 * process goes through typed wrapper functions; `ipcRenderer` itself is never
 * exposed.
 *
 * IPC patterns:
 *   invoke  — request/response, returns Promise<Result<T,E>>
 *   send    — fire-and-forget (terminal.write, terminal.resize)
 *   on/off  — push from main; every `on*` returns an unsubscribe closure that
 *             calls `ipcRenderer.removeListener` with the EXACT same function
 *             reference that was passed to `ipcRenderer.on`.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { AtriumAPI } from '@preload/api';
import type { ProjectState, TerminalId, LayoutFileV1, ConsultationErrorCode } from '@shared/index';
import type { SkillSpawnRequest } from '@shared/skill/spawn';
import type { DetachedRunRequest } from '@shared/skill/detached';

// ---------------------------------------------------------------------------
// Helper — build an ipcRenderer listener that wraps a user callback.
// The returned `listener` reference must be used for BOTH .on() and
// .removeListener() — never wrap it again.
// ---------------------------------------------------------------------------
type IpcListener = Parameters<typeof ipcRenderer.on>[1];

function makeListener<Args extends unknown[]>(
  cb: (...args: Args) => void,
): IpcListener {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_event: Electron.IpcRendererEvent, ...payload: any[]) =>
    cb(...(payload as Args));
}

// ---------------------------------------------------------------------------
// API implementation
// ---------------------------------------------------------------------------

const api: AtriumAPI = {
  // -------------------------------------------------------------------------
  // project
  // -------------------------------------------------------------------------
  project: {
    open(path) {
      return ipcRenderer.invoke(IPC.project.open, path);
    },
    switch(path) {
      return ipcRenderer.invoke(IPC.project.switch, path);
    },
    getRecents() {
      return ipcRenderer.invoke(IPC.project.getRecents);
    },
  },

  // -------------------------------------------------------------------------
  // dialog
  // -------------------------------------------------------------------------
  dialog: {
    openFolder() {
      return ipcRenderer.invoke(IPC.dialog.openFolder);
    },
  },

  // -------------------------------------------------------------------------
  // fileSync
  // -------------------------------------------------------------------------
  fileSync: {
    startWatching(dir) {
      return ipcRenderer.invoke(IPC.fileSync.startWatching, dir);
    },
    stopWatching() {
      return ipcRenderer.invoke(IPC.fileSync.stopWatching);
    },
    onChanged(cb) {
      const listener = makeListener<[ProjectState]>(cb);
      ipcRenderer.on(IPC.fileSync.onChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC.fileSync.onChanged, listener);
      };
    },
  },

  // -------------------------------------------------------------------------
  // terminal
  // -------------------------------------------------------------------------
  terminal: {
    spawn(args, cwd) {
      return ipcRenderer.invoke(IPC.terminal.spawn, args, cwd);
    },
    kill(id) {
      return ipcRenderer.invoke(IPC.terminal.kill, id);
    },
    close(id) {
      return ipcRenderer.invoke(IPC.terminal.close, id);
    },
    write(id, data) {
      ipcRenderer.send(IPC.terminal.write, id, data);
    },
    resize(id, cols, rows) {
      ipcRenderer.send(IPC.terminal.resize, id, cols, rows);
    },
    onData(id, cb) {
      const listener = makeListener<[TerminalId, ArrayBuffer]>(
        (incomingId, data) => {
          if (incomingId === id) cb(data);
        },
      );
      ipcRenderer.on(IPC.terminal.onData, listener);
      return () => {
        ipcRenderer.removeListener(IPC.terminal.onData, listener);
      };
    },
    onExit(id, cb) {
      const listener = makeListener<[TerminalId, number | null]>(
        (incomingId, code) => {
          if (incomingId === id) cb(code);
        },
      );
      ipcRenderer.on(IPC.terminal.onExit, listener);
      return () => {
        ipcRenderer.removeListener(IPC.terminal.onExit, listener);
      };
    },
    onError(id, cb) {
      const listener = makeListener<[TerminalId, { code: string; message: string }]>(
        (incomingId, errPayload) => {
          if (incomingId === id) cb(errPayload as Parameters<typeof cb>[0]);
        },
      );
      ipcRenderer.on(IPC.terminal.onError, listener);
      return () => {
        ipcRenderer.removeListener(IPC.terminal.onError, listener);
      };
    },
  },

  // -------------------------------------------------------------------------
  // health
  // -------------------------------------------------------------------------
  health: {
    checkClaude() {
      return ipcRenderer.invoke(IPC.health.checkClaude);
    },
    checkPlugin() {
      return ipcRenderer.invoke(IPC.health.checkPlugin);
    },
    installPlugin() {
      return ipcRenderer.invoke(IPC.health.installPlugin);
    },
    cancelInstall() {
      return ipcRenderer.invoke(IPC.health.cancelInstall);
    },
  },

  // -------------------------------------------------------------------------
  // layout
  // -------------------------------------------------------------------------
  layout: {
    load(projectHash: string) {
      return ipcRenderer.invoke(IPC.layout.load, projectHash);
    },
    save(projectHash: string, data: LayoutFileV1) {
      return ipcRenderer.invoke(IPC.layout.save, projectHash, data);
    },
    saveSnapshot(projectHash: string, data: LayoutFileV1) {
      ipcRenderer.send(IPC.layout.saveSnapshot, projectHash, data);
    },
  },

  // -------------------------------------------------------------------------
  // skill
  // -------------------------------------------------------------------------
  skill: {
    spawn(req: SkillSpawnRequest) {
      return ipcRenderer.invoke(IPC.skill.spawn, req);
    },
    runDetached(req: DetachedRunRequest) {
      return ipcRenderer.invoke(IPC.skill.runDetached, req);
    },
  },

  // -------------------------------------------------------------------------
  // consultation
  // -------------------------------------------------------------------------
  consultation: {
    loadThread(projectRoot) {
      return ipcRenderer.invoke(IPC.consultation.loadThread, projectRoot);
    },
    sendMessage(projectRoot, message) {
      return ipcRenderer.invoke(IPC.consultation.sendMessage, projectRoot, message);
    },
    newSession(projectRoot, model) {
      return ipcRenderer.invoke(IPC.consultation.newSession, projectRoot, model);
    },
    cancel(projectRoot, messageId) {
      return ipcRenderer.invoke(IPC.consultation.cancel, projectRoot, messageId);
    },
    onStreamChunk(messageId, cb) {
      const listener = makeListener<[{ projectHash: string; messageId: string; fullText: string }]>(
        (payload) => {
          if (payload.messageId === messageId) cb(payload.fullText);
        },
      );
      ipcRenderer.on(IPC.consultation.streamChunk, listener);
      return () => {
        ipcRenderer.removeListener(IPC.consultation.streamChunk, listener);
      };
    },
    onStreamComplete(messageId, cb) {
      const listener = makeListener<[{ projectHash: string; messageId: string; fullContent: string }]>(
        (payload) => {
          if (payload.messageId === messageId) cb(payload.fullContent);
        },
      );
      ipcRenderer.on(IPC.consultation.streamComplete, listener);
      return () => {
        ipcRenderer.removeListener(IPC.consultation.streamComplete, listener);
      };
    },
    onStreamError(messageId, cb) {
      const listener = makeListener<[{ projectHash: string; messageId: string; code: ConsultationErrorCode; raw?: string }]>(
        (payload) => {
          if (payload.messageId !== messageId) return;
          cb(payload.raw !== undefined ? { code: payload.code, raw: payload.raw } : { code: payload.code });
        },
      );
      ipcRenderer.on(IPC.consultation.streamError, listener);
      return () => {
        ipcRenderer.removeListener(IPC.consultation.streamError, listener);
      };
    },
  },

  // -------------------------------------------------------------------------
  // shell
  // -------------------------------------------------------------------------
  shell: {
    openExternal(url) {
      return ipcRenderer.invoke(IPC.shell.openExternal, url);
    },
  },
};

contextBridge.exposeInMainWorld('atrium', api);
