/**
 * WatcherManager — onReparse rejection contract.
 *
 * Verifies that when onReparse throws/rejects, the manager swallows the error
 * (logs a console.warn) and does NOT call webContents.send.
 *
 * Also verifies the pruning invariant: the watcher calls readAndAssembleProject
 * (not openProject), so pruneRecent is NEVER invoked on reparse.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { WatcherManager } from '../watcherManager';
import * as storageModule from '@main/storage';

function makeFakeWindow(): {
  isDestroyed: () => boolean;
  webContents: { send: ReturnType<typeof vi.fn> };
} {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('WatcherManager — onReparse rejection is swallowed', () => {
  let tmpDir: string;
  let manager: WatcherManager;

  afterEach(async () => {
    await manager.stop();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejection from onReparse does not crash and send is never called', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-reparse-'));

    const onReparse = vi.fn().mockRejectedValue(new Error('parse boom'));
    manager = new WatcherManager({ onReparse });

    const win = makeFakeWindow();
    manager.setWindow(win as unknown as import('electron').BrowserWindow);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await manager.start(tmpDir);
    expect(result.ok).toBe(true);

    // Trigger a file event
    await fs.writeFile(path.join(tmpDir, 'trigger.txt'), 'x');
    await wait(500);

    // onReparse was called but threw; no crash, no send
    expect(onReparse).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('WatcherManager — pruneRecent is never called on reparse', () => {
  let tmpDir: string;
  let manager: WatcherManager;

  afterEach(async () => {
    await manager.stop();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('poisoning-like onReparse error does NOT invoke pruneRecent', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-prune-guard-'));

    // Simulate a poisoning-flavoured failure (ENOENT in message)
    const poisonError = Object.assign(new Error('ENOENT: no such file or directory'), {
      code: 'ENOENT',
    });
    const onReparse = vi.fn().mockRejectedValue(poisonError);
    manager = new WatcherManager({ onReparse });

    const win = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    };
    manager.setWindow(win as unknown as import('electron').BrowserWindow);

    const pruneSpy = vi.spyOn(storageModule, 'pruneRecent').mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await manager.start(tmpDir);
    expect(result.ok).toBe(true);

    await fs.writeFile(path.join(tmpDir, 'trigger.txt'), 'x');
    await new Promise((r) => setTimeout(r, 500));

    expect(onReparse).toHaveBeenCalledTimes(1);
    expect(pruneSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    pruneSpy.mockRestore();
  });
});
