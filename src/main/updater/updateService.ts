/**
 * updateService.ts — checks GitHub Releases for a newer Atrium and applies it on request.
 *
 * Only started for packaged builds (see src/main/index.ts). Uses electron-updater, which
 * reads the latest*.yml metadata electron-builder publishes with every release. Drafts are
 * ignored by electron-updater, so a release becomes visible here once it is published.
 *
 * Flow: background check (no auto-download) → push `available` to the renderer → user picks
 * "Install and restart" → download with progress → quitAndInstall. Platforms that cannot
 * self-update (unsigned macOS, .deb installs) get a link to the release page instead.
 */

import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { UpdateStatus } from '@shared/update';

/** Must match `publish` in electron-builder.yml. */
export const RELEASES_URL = 'https://github.com/romadanylchuk/Atrium/releases';
export const FIRST_CHECK_DELAY_MS = 5_000;
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** The slice of electron-updater's AppUpdater this service uses; injectable for tests. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  on(event: 'update-available', cb: (info: { version: string }) => void): unknown;
  on(event: 'update-not-available', cb: () => void): unknown;
  on(event: 'download-progress', cb: (progress: { percent: number }) => void): unknown;
  on(event: 'update-downloaded', cb: (info: { version: string }) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdateServiceOptions {
  getWindow: () => BrowserWindow | null;
  currentVersion: string;
  platform: NodeJS.Platform;
  /** Set by the AppImage runtime; its absence on Linux means a .deb install. */
  appImagePath: string | undefined;
  loadUpdater: () => Promise<UpdaterLike>;
  openExternal: (url: string) => Promise<void>;
}

export function releaseUrlFor(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`;
}

/** Real electron-updater, imported lazily so dev runs and unit tests never load it. */
export async function loadElectronUpdater(): Promise<UpdaterLike> {
  // CJS package: depending on interop, exports land on the namespace or on `default`.
  const mod = (await import('electron-updater')) as unknown as {
    autoUpdater?: UpdaterLike;
    default?: { autoUpdater?: UpdaterLike };
  };
  const updater = mod.autoUpdater ?? mod.default?.autoUpdater;
  if (!updater) throw new Error('electron-updater: autoUpdater export not found');
  return updater;
}

export class UpdateService {
  private status: UpdateStatus = { kind: 'idle' };
  private updater: UpdaterLike | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private availableVersion: string | null = null;

  constructor(private readonly opts: UpdateServiceOptions) {}

  get canAutoInstall(): boolean {
    if (this.opts.platform === 'win32') return true;
    if (this.opts.platform === 'linux') return !!this.opts.appImagePath;
    return false; // macOS: Squirrel.Mac refuses unsigned updates
  }

  async start(): Promise<void> {
    const updater = await this.opts.loadUpdater();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.logger = console;

    updater.on('update-available', (info) => {
      this.availableVersion = info.version;
      this.setStatus({
        kind: 'available',
        version: info.version,
        currentVersion: this.opts.currentVersion,
        canAutoInstall: this.canAutoInstall,
        releaseUrl: releaseUrlFor(info.version),
      });
    });
    updater.on('download-progress', (progress) => {
      if (this.availableVersion === null) return;
      this.setStatus({ kind: 'downloading', version: this.availableVersion, percent: progress.percent });
    });
    updater.on('update-downloaded', (info) => {
      this.setStatus({ kind: 'downloaded', version: info.version });
      // Give the renderer a moment to show "Restarting…" before the window goes away.
      this.timers.push(setTimeout(() => updater.quitAndInstall(true, true), 1_000));
    });
    // Background check failures (offline, rate limits) are only logged; download failures
    // are surfaced through download() below.
    updater.on('error', (err) => console.warn('[atrium:update]', err.message));

    this.updater = updater;
    this.timers.push(setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS));
    this.timers.push(setInterval(() => void this.check(), CHECK_INTERVAL_MS));
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  async check(): Promise<void> {
    if (!this.updater) return;
    // Don't disturb a download in flight or an install about to happen.
    if (this.status.kind === 'downloading' || this.status.kind === 'downloaded') return;
    try {
      await this.updater.checkForUpdates();
    } catch (e) {
      console.warn('[atrium:update] check failed:', e instanceof Error ? e.message : e);
    }
  }

  async download(): Promise<void> {
    const status = this.status;
    if (!this.updater || status.kind !== 'available') return;
    if (!status.canAutoInstall) {
      await this.openReleasePage();
      return;
    }
    this.setStatus({ kind: 'downloading', version: status.version, percent: 0 });
    try {
      await this.updater.downloadUpdate();
    } catch (e) {
      this.setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
        releaseUrl: status.releaseUrl,
      });
    }
  }

  async openReleasePage(): Promise<void> {
    const s = this.status;
    const url = s.kind === 'available' ? s.releaseUrl : s.kind === 'error' && s.releaseUrl ? s.releaseUrl : RELEASES_URL;
    await this.opts.openExternal(url);
  }

  private setStatus(next: UpdateStatus): void {
    this.status = next;
    this.opts.getWindow()?.webContents.send(IPC.update.onStatus, next);
  }
}
