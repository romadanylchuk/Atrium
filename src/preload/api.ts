/**
 * AtriumAPI — the contextBridge surface type.
 *
 * Import this module for its side-effect type augmentation, even though no
 * runtime symbols are used. Example (renderer-side):
 *
 *   import '@preload/api';
 *   // window.atrium is now typed as AtriumAPI
 *
 * No runtime imports — type-only. Safe to include in tsconfig.web.json.
 */
import type {
  Result,
  ProjectState,
  ProjectErrorCode,
  DialogErrorCode,
  FileSyncErrorCode,
  TerminalId,
  TerminalErrorCode,
  HealthInfo,
  HealthErrorCode,
  PluginInfo,
  InstallOutcome,
  RecentProject,
  LayoutFileV1,
  LayoutErrorCode,
  SkillErrorCode,
  ConsultationFile,
  ConsultationModel,
  ConsultationErrorCode,
} from '@shared/index';
import type { SkillSpawnRequest } from '@shared/skill/spawn';
import type { DetachedRunRequest, DetachedRunResult } from '@shared/skill/detached';

export type AtriumAPI = {
  project: {
    open(path: string): Promise<Result<ProjectState, ProjectErrorCode>>;
    switch(path: string): Promise<Result<ProjectState, ProjectErrorCode>>;
    getRecents(): Promise<Result<RecentProject[], ProjectErrorCode>>;
  };
  dialog: {
    openFolder(): Promise<Result<string | null, DialogErrorCode>>;
  };
  fileSync: {
    startWatching(dir: string): Promise<Result<void, FileSyncErrorCode>>;
    stopWatching(): Promise<Result<void, FileSyncErrorCode>>;
    onChanged(cb: (state: ProjectState) => void): () => void;
  };
  terminal: {
    spawn(args: string[], cwd: string): Promise<Result<TerminalId, TerminalErrorCode>>;
    kill(id: TerminalId): Promise<Result<void, TerminalErrorCode>>;
    close(id: TerminalId): Promise<Result<void, TerminalErrorCode>>;
    write(id: TerminalId, data: ArrayBuffer): void;
    resize(id: TerminalId, cols: number, rows: number): void;
    onData(id: TerminalId, cb: (data: ArrayBuffer) => void): () => void;
    onExit(id: TerminalId, cb: (code: number | null) => void): () => void;
    onError(id: TerminalId, cb: (err: { code: TerminalErrorCode; message: string }) => void): () => void;
  };
  health: {
    checkClaude(): Promise<Result<HealthInfo, HealthErrorCode>>;
    checkPlugin(): Promise<Result<PluginInfo, HealthErrorCode>>;
    installPlugin(): Promise<Result<InstallOutcome, HealthErrorCode>>;
    cancelInstall(): Promise<Result<void, HealthErrorCode>>;
  };
  layout: {
    load(projectHash: string): Promise<Result<LayoutFileV1 | null, LayoutErrorCode>>;
    save(projectHash: string, data: LayoutFileV1): Promise<Result<void, LayoutErrorCode>>;
    saveSnapshot(projectHash: string, data: LayoutFileV1): void;
  };
  skill: {
    spawn(req: SkillSpawnRequest): Promise<Result<TerminalId, SkillErrorCode>>;
    runDetached(req: DetachedRunRequest): Promise<Result<DetachedRunResult, SkillErrorCode>>;
  };
  consultation: {
    loadThread(projectRoot: string):
      Promise<Result<ConsultationFile | null, ConsultationErrorCode>>;
    sendMessage(projectRoot: string, message: string):
      Promise<Result<{ messageId: string }, ConsultationErrorCode>>;
    newSession(projectRoot: string, model: ConsultationModel):
      Promise<Result<{ sessionId: string; systemPromptVersion: number }, ConsultationErrorCode>>;
    cancel(projectRoot: string, messageId: string):
      Promise<Result<void, ConsultationErrorCode>>;
    onStreamChunk(messageId: string, cb: (fullText: string) => void): () => void;
    onStreamComplete(messageId: string, cb: (fullContent: string) => void): () => void;
    onStreamError(messageId: string,
      cb: (err: { code: ConsultationErrorCode; raw?: string }) => void): () => void;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
};

declare global {
  interface Window {
    atrium: AtriumAPI;
  }
}
