/**
 * WatcherManager — onReparse rejection contract.
 *
 * Verifies that when onReparse throws/rejects, the manager swallows the error
 * (logs a console.warn) and does NOT call webContents.send.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { WatcherManager } from '../watcherManager';

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
