/**
 * Tests for src/main/ipc/project.ts
 *
 * Uses a fake IpcMainLike to capture handler registrations without
 * pulling in the real Electron runtime.
 *
 * Uses __setUserDataDirForTests to avoid touching real userData.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { __setUserDataDirForTests } from '@main/storage';
import { registerProjectHandlers } from '../project';
import { IPC } from '@shared/ipc';
import { ProjectErrorCode } from '@shared/errors';
import { makeSimpleFakeIpcMain } from './helpers/makeFakeIpcMain';

function makeFakeWatcher() {
  return {
    start: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    stop: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

// ---------------------------------------------------------------------------
// Repo root — 4 levels up from this file's location:
// __tests__ -> ipc -> main -> src -> repo root
// ---------------------------------------------------------------------------
const REPO_ROOT = nodePath.resolve(import.meta.dirname, '..', '..', '..', '..');

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'atrium-ipc-proj-test-'));
  __setUserDataDirForTests(tmpDir);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setUserDataDirForTests(null);
  vi.restoreAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerProjectHandlers', () => {
  describe('project:open', () => {
    it('returns Result.ok with nodes.length > 0 when pointed at repo root', async () => {
      const ipc = makeSimpleFakeIpcMain();
      registerProjectHandlers(makeFakeWatcher() as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.open, REPO_ROOT);
      expect(result).toMatchObject({ ok: true });
      const typedResult = result as { ok: true; data: { nodes: unknown[] } };
      expect(typedResult.data.nodes.length).toBeGreaterThan(0);
    });

    it('returns Result.err(NOT_AN_ARCH_PROJECT) when pointed at empty tmpdir', async () => {
      const ipc = makeSimpleFakeIpcMain();
      registerProjectHandlers(makeFakeWatcher() as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.open, tmpDir);
      expect(result).toMatchObject({
        ok: false,
        error: { code: ProjectErrorCode.NOT_AN_ARCH_PROJECT },
      });
    });

    it('returns Result.err(PATH_NOT_FOUND) when path does not exist', async () => {
      const ipc = makeSimpleFakeIpcMain();
      registerProjectHandlers(makeFakeWatcher() as never, ipc.fake);

      const nonExistent = nodePath.join(os.tmpdir(), `atrium-nope-ipc-${Date.now()}`);
      const result = await ipc.invoke(IPC.project.open, nonExistent);
      expect(result).toMatchObject({
        ok: false,
        error: { code: ProjectErrorCode.PATH_NOT_FOUND },
      });
    });

    it('returns Result.err(PATH_NOT_FOUND) when path argument is not a string', async () => {
      const ipc = makeSimpleFakeIpcMain();
      registerProjectHandlers(makeFakeWatcher() as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.open, 42);
      expect(result).toMatchObject({
        ok: false,
        error: { code: ProjectErrorCode.PATH_NOT_FOUND },
      });
    });
  });

  describe('project:switch', () => {
    it('behaves identically to project:open for Stage 02 (returns Result.ok for repo root)', async () => {
      const ipc = makeSimpleFakeIpcMain();
      registerProjectHandlers(makeFakeWatcher() as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.switch, REPO_ROOT);
      expect(result).toMatchObject({ ok: true });
    });

    it('returns Result.err(NOT_AN_ARCH_PROJECT) for empty dir, same as project:open', async () => {
      const ipc = makeSimpleFakeIpcMain();
      registerProjectHandlers(makeFakeWatcher() as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.switch, tmpDir);
      expect(result).toMatchObject({
        ok: false,
        error: { code: ProjectErrorCode.NOT_AN_ARCH_PROJECT },
      });
    });
  });

  describe('project:getRecents', () => {
    it('returns Result.ok([]) on fresh userData (no config file)', async () => {
      const ipc = makeSimpleFakeIpcMain();
      registerProjectHandlers(makeFakeWatcher() as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.getRecents);
      expect(result).toEqual({ ok: true, data: [] });
    });
  });

  describe('project:open — watcher lifecycle', () => {
    it('success: stop then start(<absPath>/.ai-arch) called in order', async () => {
      const ipc = makeSimpleFakeIpcMain();
      const watcher = makeFakeWatcher();
      registerProjectHandlers(watcher as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.open, REPO_ROOT);
      expect(result).toMatchObject({ ok: true });

      expect(watcher.stop).toHaveBeenCalledTimes(1);
      expect(watcher.start).toHaveBeenCalledTimes(1);
      expect(watcher.start).toHaveBeenCalledWith(nodePath.join(REPO_ROOT, '.ai-arch'));

      // stop must have been called before start
      const stopOrder = watcher.stop.mock.invocationCallOrder[0];
      const startOrder = watcher.start.mock.invocationCallOrder[0];
      expect(stopOrder).toBeLessThan(startOrder!);
    });

    it('failure (NOT_AN_ARCH_PROJECT): neither stop nor start called', async () => {
      const ipc = makeSimpleFakeIpcMain();
      const watcher = makeFakeWatcher();
      registerProjectHandlers(watcher as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.open, tmpDir);
      expect(result).toMatchObject({ ok: false, error: { code: ProjectErrorCode.NOT_AN_ARCH_PROJECT } });

      expect(watcher.stop).not.toHaveBeenCalled();
      expect(watcher.start).not.toHaveBeenCalled();
    });

    it('failure (PATH_NOT_FOUND): neither stop nor start called', async () => {
      const ipc = makeSimpleFakeIpcMain();
      const watcher = makeFakeWatcher();
      registerProjectHandlers(watcher as never, ipc.fake);

      const nonExistent = nodePath.join(os.tmpdir(), `atrium-nope-ipc-${Date.now()}`);
      const result = await ipc.invoke(IPC.project.open, nonExistent);
      expect(result).toMatchObject({ ok: false, error: { code: ProjectErrorCode.PATH_NOT_FOUND } });

      expect(watcher.stop).not.toHaveBeenCalled();
      expect(watcher.start).not.toHaveBeenCalled();
    });
  });

  describe('project:switch — watcher lifecycle', () => {
    it('success: stop then start(<absPath>/.ai-arch) called in order', async () => {
      const ipc = makeSimpleFakeIpcMain();
      const watcher = makeFakeWatcher();
      registerProjectHandlers(watcher as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.switch, REPO_ROOT);
      expect(result).toMatchObject({ ok: true });

      expect(watcher.stop).toHaveBeenCalledTimes(1);
      expect(watcher.start).toHaveBeenCalledTimes(1);
      expect(watcher.start).toHaveBeenCalledWith(nodePath.join(REPO_ROOT, '.ai-arch'));

      const stopOrder = watcher.stop.mock.invocationCallOrder[0];
      const startOrder = watcher.start.mock.invocationCallOrder[0];
      expect(stopOrder).toBeLessThan(startOrder!);
    });

    it('failure (NOT_AN_ARCH_PROJECT): neither stop nor start called', async () => {
      const ipc = makeSimpleFakeIpcMain();
      const watcher = makeFakeWatcher();
      registerProjectHandlers(watcher as never, ipc.fake);

      const result = await ipc.invoke(IPC.project.switch, tmpDir);
      expect(result).toMatchObject({ ok: false, error: { code: ProjectErrorCode.NOT_AN_ARCH_PROJECT } });

      expect(watcher.stop).not.toHaveBeenCalled();
      expect(watcher.start).not.toHaveBeenCalled();
    });

    it('failure (PATH_NOT_FOUND): neither stop nor start called', async () => {
      const ipc = makeSimpleFakeIpcMain();
      const watcher = makeFakeWatcher();
      registerProjectHandlers(watcher as never, ipc.fake);

      const nonExistent = nodePath.join(os.tmpdir(), `atrium-nope-ipc-${Date.now()}`);
      const result = await ipc.invoke(IPC.project.switch, nonExistent);
      expect(result).toMatchObject({ ok: false, error: { code: ProjectErrorCode.PATH_NOT_FOUND } });

      expect(watcher.stop).not.toHaveBeenCalled();
      expect(watcher.start).not.toHaveBeenCalled();
    });
  });
});
