import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { IPC } from '@shared/ipc';
import type { UpdateStatus } from '@shared/update';
import {
  UpdateService,
  FIRST_CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  RELEASES_URL,
  type UpdaterLike,
} from '../updateService';

function makeFakeUpdater() {
  const emitter = new EventEmitter();
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: null as unknown,
    on: (event: string, cb: (...a: unknown[]) => void) => emitter.on(event, cb),
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue([]),
    quitAndInstall: vi.fn(),
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
  };
  return updater;
}

function setup(platform: NodeJS.Platform = 'win32', appImagePath?: string) {
  const updater = makeFakeUpdater();
  const send = vi.fn();
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const service = new UpdateService({
    getWindow: () => ({ webContents: { send } }) as never,
    currentVersion: '0.1.3',
    platform,
    appImagePath,
    loadUpdater: () => Promise.resolve(updater as unknown as UpdaterLike),
    openExternal,
  });
  const pushed = (): UpdateStatus[] =>
    send.mock.calls.filter((c) => c[0] === IPC.update.onStatus).map((c) => c[1] as UpdateStatus);
  return { updater, service, send, openExternal, pushed };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('UpdateService', () => {
  it('configures the updater for prompt-first updates', async () => {
    const { updater, service } = setup();
    await service.start();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    service.stop();
  });

  it('checks shortly after start and then periodically', async () => {
    const { updater, service } = setup();
    await service.start();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('pushes an available status with the release link', async () => {
    const { updater, service, pushed } = setup();
    await service.start();
    updater.emit('update-available', { version: '0.1.4' });
    const expected: UpdateStatus = {
      kind: 'available',
      version: '0.1.4',
      currentVersion: '0.1.3',
      canAutoInstall: true,
      releaseUrl: `${RELEASES_URL}/tag/v0.1.4`,
    };
    expect(pushed()).toEqual([expected]);
    expect(service.getStatus()).toEqual(expected);
    service.stop();
  });

  it.each([
    ['win32', undefined, true],
    ['linux', '/opt/Atrium.AppImage', true],
    ['linux', undefined, false], // .deb install
    ['darwin', undefined, false], // unsigned macOS build
  ] as const)('canAutoInstall on %s (appimage=%s) is %s', (platform, appImage, expected) => {
    expect(setup(platform, appImage).service.canAutoInstall).toBe(expected);
  });

  it('download → progress → downloaded → quitAndInstall', async () => {
    const { updater, service, pushed } = setup();
    await service.start();
    updater.emit('update-available', { version: '0.1.4' });
    await service.download();
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
    updater.emit('download-progress', { percent: 42 });
    updater.emit('update-downloaded', { version: '0.1.4' });
    expect(pushed().map((s) => s.kind)).toEqual(['available', 'downloading', 'downloading', 'downloaded']);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
    service.stop();
  });

  it('a failed download surfaces an error with the release link', async () => {
    const { updater, service } = setup();
    await service.start();
    updater.emit('update-available', { version: '0.1.4' });
    updater.downloadUpdate.mockRejectedValueOnce(new Error('net::ERR_FAILED'));
    await service.download();
    expect(service.getStatus()).toEqual({
      kind: 'error',
      message: 'net::ERR_FAILED',
      releaseUrl: `${RELEASES_URL}/tag/v0.1.4`,
    });
    service.stop();
  });

  it('where self-update is unsupported, "download" opens the release page', async () => {
    const { updater, service, openExternal } = setup('darwin');
    await service.start();
    updater.emit('update-available', { version: '0.1.4' });
    await service.download();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith(`${RELEASES_URL}/tag/v0.1.4`);
    service.stop();
  });

  it('download is a no-op when no update is available', async () => {
    const { updater, service } = setup();
    await service.start();
    await service.download();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    service.stop();
  });

  it('background check failures stay quiet', async () => {
    const { updater, service, pushed } = setup();
    await service.start();
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    await service.check();
    expect(pushed()).toEqual([]);
    expect(service.getStatus()).toEqual({ kind: 'idle' });
    service.stop();
  });

  it('skips checks while a download is in progress', async () => {
    const { updater, service } = setup();
    await service.start();
    updater.emit('update-available', { version: '0.1.4' });
    updater.downloadUpdate.mockReturnValueOnce(new Promise(() => {}));
    void service.download();
    await service.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    service.stop();
  });
});
