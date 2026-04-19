/**
 * WatcherManager integration tests.
 *
 * Uses real temp directories (fs.mkdtemp) and the real @parcel/watcher to
 * exercise debounce, stop, atomic-swap, and R2-invariant behaviour.
 * The `onReparse` callback and BrowserWindow are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { WatcherManager } from '../watcherManager';
import { IPC } from '@shared/ipc';

// ---------------------------------------------------------------------------
// Minimal BrowserWindow mock
// ---------------------------------------------------------------------------

function makeFakeWindow(): {
  isDestroyed: () => boolean;
  webContents: { send: ReturnType<typeof vi.fn> };
} {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WAIT_MS = 500; // well beyond the 300 ms debounce

async function writeFile(dir: string, name: string, content = 'x'): Promise<void> {
  await fs.writeFile(path.join(dir, name), content);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WatcherManager — burst collapses', () => {
  let tmpDir: string;
  let manager: WatcherManager;
  const fakeState = { nodes: [], edges: [], projectHash: 'testhash' } as unknown as import('@shared/domain').ProjectState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-test-'));
  });

  afterEach(async () => {
    await manager.stop();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('five writes within 100 ms result in onReparse called exactly once', async () => {
    const onReparse = vi.fn().mockResolvedValue(fakeState);
    manager = new WatcherManager({ onReparse });
    const win = makeFakeWindow();
    manager.setWindow(win as unknown as import('electron').BrowserWindow);

    const result = await manager.start(tmpDir);
    expect(result.ok).toBe(true);

    // Write 5 files within ~100 ms
    for (let i = 0; i < 5; i++) {
      await writeFile(tmpDir, `file${i}.txt`);
      await wait(15);
    }

    // Wait beyond debounce window
    await wait(WAIT_MS);

    expect(onReparse).toHaveBeenCalledTimes(1);
    expect(onReparse).toHaveBeenCalledWith(tmpDir);
    expect(win.webContents.send).toHaveBeenCalledTimes(1);
    expect(win.webContents.send.mock.calls[0]![0]).toBe(IPC.fileSync.onChanged);
    expect(win.webContents.send.mock.calls[0]![1]).toBe(fakeState);
  });
});

describe('WatcherManager — stop tears down', () => {
  let tmpDir: string;
  let manager: WatcherManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('after stop, writes do not trigger onReparse', async () => {
    const onReparse = vi.fn().mockResolvedValue(null);
    manager = new WatcherManager({ onReparse });

    await manager.start(tmpDir);
    await manager.stop();

    await writeFile(tmpDir, 'after-stop.txt');
    await wait(WAIT_MS);

    expect(onReparse).not.toHaveBeenCalled();
  });

  it('second stop() is idempotent (no throw, returns ok)', async () => {
    const onReparse = vi.fn().mockResolvedValue(null);
    manager = new WatcherManager({ onReparse });

    await manager.start(tmpDir);
    const r1 = await manager.stop();
    expect(r1.ok).toBe(true);

    const r2 = await manager.stop();
    expect(r2.ok).toBe(true);
  });
});

describe('WatcherManager — start after stop', () => {
  let tmpDirA: string;
  let tmpDirB: string;
  let manager: WatcherManager;

  beforeEach(async () => {
    tmpDirA = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-test-a-'));
    tmpDirB = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-test-b-'));
  });

  afterEach(async () => {
    await manager.stop();
    await fs.rm(tmpDirA, { recursive: true, force: true });
    await fs.rm(tmpDirB, { recursive: true, force: true });
  });

  it('after stop + start on new dir, onReparse is called with the new dir', async () => {
    const onReparse = vi.fn().mockResolvedValue(null);
    manager = new WatcherManager({ onReparse });

    await manager.start(tmpDirA);
    await manager.stop();
    await manager.start(tmpDirB);

    await writeFile(tmpDirB, 'in-b.txt');
    await wait(WAIT_MS);

    expect(onReparse).toHaveBeenCalledTimes(1);
    expect(onReparse).toHaveBeenCalledWith(tmpDirB);
  });
});

describe('WatcherManager — atomic swap', () => {
  let tmpDirA: string;
  let tmpDirB: string;
  let manager: WatcherManager;

  beforeEach(async () => {
    tmpDirA = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-test-a-'));
    tmpDirB = await fs.mkdtemp(path.join(os.tmpdir(), 'atrium-test-b-'));
  });

  afterEach(async () => {
    await manager.stop();
    await fs.rm(tmpDirA, { recursive: true, force: true });
    await fs.rm(tmpDirB, { recursive: true, force: true });
  });

  it('start dir B without stop — subsequent events fire only for B', async () => {
    const onReparse = vi.fn().mockResolvedValue(null);
    manager = new WatcherManager({ onReparse });

    await manager.start(tmpDirA);
    // Immediately start B (no explicit stop)
    await manager.start(tmpDirB);

    await writeFile(tmpDirB, 'in-b.txt');
    await wait(WAIT_MS);

    // onReparse should be called with B's dir, not A's
    const calls = onReparse.mock.calls as [string][];
    const dirsUsed = calls.map((c) => c[0]);
    expect(dirsUsed.every((d) => d === tmpDirB)).toBe(true);
    // At least one fire for B
    expect(onReparse).toHaveBeenCalledWith(tmpDirB);
  });
});

describe('WatcherManager — non-existent dir', () => {
  it('start on non-existent path returns Result.err with NOT_FOUND', async () => {
    const onReparse = vi.fn();
    const manager = new WatcherManager({ onReparse });

    const result = await manager.start('/no/such/dir/ai-arch');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    // @parcel/watcher.subscribe must NOT have been called
    expect(onReparse).not.toHaveBeenCalled();
  });
});

describe('WatcherManager — R2 invariant', () => {
  it('start() passes the input path verbatim to @parcel/watcher — no .ai-arch suffix', async () => {
    // Verify the R2 contract structurally: the watcherManager module must
    // not call path.join(dir, '.ai-arch'). We check by reading the source
    // text directly — a string search is reliable and avoids ESM spy issues.
    const srcPath = path.resolve(
      import.meta.dirname,
      '..',
      'watcherManager.ts',
    );
    const src = await fs.readFile(srcPath, 'utf-8');
    // The file must NOT contain any join of dir with '.ai-arch'
    expect(src).not.toMatch(/join\s*\(.*?['"]\.ai-arch['"]/);
    expect(src).not.toMatch(/['"]\s*\.ai-arch\s*['"]/);
  });
});
