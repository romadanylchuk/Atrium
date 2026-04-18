import { stat } from 'node:fs/promises';
import type { BrowserWindow } from 'electron';
import parcelWatcher from '@parcel/watcher';
import type ParcelWatcher from '@parcel/watcher';
import { IPC } from '@shared/ipc';
import { FileSyncErrorCode } from '@shared/errors';
import { type Result, ok, err } from '@shared/result';
import type { ProjectState } from '@shared/domain';
import { DEBOUNCE_MS } from './constants';

interface WatcherManagerOptions {
  onReparse: (dir: string) => Promise<ProjectState | null>;
}

export class WatcherManager {
  #subscription: ParcelWatcher.AsyncSubscription | null = null;
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #currentDir: string | null = null;
  #window: BrowserWindow | null = null;
  readonly #onReparse: (dir: string) => Promise<ProjectState | null>;

  constructor({ onReparse }: WatcherManagerOptions) {
    this.#onReparse = onReparse;
  }

  async start(dir: string): Promise<Result<void, FileSyncErrorCode>> {
    if (this.#subscription !== null) {
      await this.stop();
    }

    try {
      await stat(dir);
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return err(FileSyncErrorCode.NOT_FOUND, `directory not found: ${dir}`);
      }
      return err(FileSyncErrorCode.WATCHER_FAILED, e instanceof Error ? e.message : String(e));
    }

    try {
      const subscription = await parcelWatcher.subscribe(dir, () => {
        if (this.#debounceTimer !== null) clearTimeout(this.#debounceTimer);
        this.#debounceTimer = setTimeout(() => void this.#fire(), DEBOUNCE_MS);
      });
      this.#subscription = subscription;
      this.#currentDir = dir;
    } catch (e: unknown) {
      return err(FileSyncErrorCode.WATCHER_FAILED, e instanceof Error ? e.message : String(e));
    }

    return ok(undefined);
  }

  async #fire(): Promise<void> {
    if (this.#currentDir === null) return;
    let state: ProjectState | null = null;
    try {
      state = await this.#onReparse(this.#currentDir);
    } catch (e: unknown) {
      console.warn('[atrium:fileSync] onReparse rejected:', e instanceof Error ? e.message : String(e));
      return;
    }
    if (state !== null && this.#window !== null && !this.#window.isDestroyed()) {
      this.#window.webContents.send(IPC.fileSync.onChanged, state);
    }
  }

  async stop(): Promise<Result<void, FileSyncErrorCode>> {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    if (this.#subscription === null) {
      return ok(undefined);
    }
    try {
      await this.#subscription.unsubscribe();
    } catch (e: unknown) {
      this.#subscription = null;
      this.#currentDir = null;
      return err(FileSyncErrorCode.WATCHER_FAILED, e instanceof Error ? e.message : String(e));
    }
    this.#subscription = null;
    this.#currentDir = null;
    return ok(undefined);
  }

  setWindow(win: BrowserWindow | null): void {
    this.#window = win;
  }
}
