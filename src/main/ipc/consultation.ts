/**
 * consultation.ts — IPC handlers for the consultation namespace.
 *
 * Invoke channels (renderer → main, returns Result):
 *   consultation:loadThread  → service.loadThread(projectRoot)
 *   consultation:sendMessage → service.sendMessage(projectRoot, text)
 *   consultation:newSession  → service.newSession(projectRoot, model)
 *   consultation:cancel      → service.cancel(projectRoot, messageId)
 *
 * Push channels (main → renderer via webContents.send — nothing to register here):
 *   consultation:stream:chunk     — service emits per assistant-message full text (replace, not append)
 *   consultation:stream:complete  — service emits on successful completion
 *   consultation:stream:error     — service emits on mapped error
 */

import { IPC } from '@shared/ipc';
import type { ConsultationModel } from '@shared/consultation';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';
import type { ConsultationService } from '@main/consultation/consultationService';

export function registerConsultationHandlers(
  service: ConsultationService,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  safeHandle(
    IPC.consultation.loadThread,
    (_, projectRoot) => service.loadThread(projectRoot as string),
    ipcMainLike,
  );

  safeHandle(
    IPC.consultation.sendMessage,
    (_, projectRoot, message) =>
      service.sendMessage(projectRoot as string, message as string),
    ipcMainLike,
  );

  safeHandle(
    IPC.consultation.newSession,
    (_, projectRoot, model) =>
      service.newSession(projectRoot as string, model as ConsultationModel),
    ipcMainLike,
  );

  safeHandle(
    IPC.consultation.cancel,
    (_, projectRoot, messageId) =>
      service.cancel(projectRoot as string, messageId as string),
    ipcMainLike,
  );
}
