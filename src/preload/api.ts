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
  RecentProject,
} from '@shared/index';

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
    write(id: TerminalId, data: ArrayBuffer): void;
    resize(id: TerminalId, cols: number, rows: number): void;
    onData(id: TerminalId, cb: (data: ArrayBuffer) => void): () => void;
    onExit(id: TerminalId, cb: (code: number | null) => void): () => void;
    onError(id: TerminalId, cb: (err: { code: TerminalErrorCode; message: string }) => void): () => void;
  };
  health: {
    checkClaude(): Promise<Result<HealthInfo, HealthErrorCode>>;
  };
};

declare global {
  interface Window {
    atrium: AtriumAPI;
  }
}
