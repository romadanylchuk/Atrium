/**
 * Tests for src/main/ipc/layout.ts
 *
 * Uses makeFullFakeIpcMain and a fresh temp userData dir.
 * Tests cover: load (NOT_FOUND, CORRUPT, SCHEMA_MISMATCH, IO_FAILED, happy path)
 * and save (happy path, IO_FAILED), plus saveSnapshot buffer writes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { __setUserDataDirForTests, getProjectsDir, getLayoutPath } from '@main/storage';
import { registerLayoutHandlers } from '../layout';
import { createLayoutSaveBufferForTests } from '../layoutSaveBuffer';
import { IPC } from '@shared/ipc';
import { LayoutErrorCode } from '@shared/errors';
import type { LayoutFileV1 } from '@shared/layout';
import { makeFullFakeIpcMain } from './helpers/makeFakeIpcMain';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'atrium-layout-ipc-test-'));
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
// Helpers
// ---------------------------------------------------------------------------

const TEST_HASH = 'aabbccdd';

function makeValidLayout(projectPath = '/test/project'): LayoutFileV1 {
  return { schemaVersion: 1, projectPath, nodePositions: { 'node-a': { x: 10, y: 20 } } };
}

function writeLayoutFile(hash: string, content: string): void {
  const projectDir = nodePath.join(getProjectsDir(), hash);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(getLayoutPath(hash), content, 'utf8');
}

// ---------------------------------------------------------------------------
// layout:load tests
// ---------------------------------------------------------------------------

describe('layout:load — NOT_FOUND (missing file)', () => {
  it('returns ok(null) when no layout file exists', async () => {
    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    const result = await fake.invokeChannel(IPC.layout.load, TEST_HASH);
    expect(result).toEqual({ ok: true, data: null });
  });
});

describe('layout:load — CORRUPT (invalid JSON)', () => {
  it('quarantines the file and returns err(CORRUPT)', async () => {
    writeLayoutFile(TEST_HASH, '{ BAD JSON');

    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    const result = await fake.invokeChannel(IPC.layout.load, TEST_HASH);
    expect(result).toMatchObject({ ok: false, error: { code: LayoutErrorCode.CORRUPT } });
    // File quarantined — original path gone
    expect(fs.existsSync(getLayoutPath(TEST_HASH))).toBe(false);
  });
});

describe('layout:load — SCHEMA_MISMATCH (schemaVersion: 2)', () => {
  it('returns err(SCHEMA_MISMATCH) and leaves file untouched', async () => {
    writeLayoutFile(TEST_HASH, JSON.stringify({ schemaVersion: 2, projectPath: '/x', nodePositions: {} }));

    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    const result = await fake.invokeChannel(IPC.layout.load, TEST_HASH);
    expect(result).toMatchObject({ ok: false, error: { code: LayoutErrorCode.SCHEMA_MISMATCH } });
    // File untouched — no quarantine
    expect(fs.existsSync(getLayoutPath(TEST_HASH))).toBe(true);
  });
});

describe('layout:load — IO_FAILED', () => {
  it('returns err(IO_FAILED) on a non-ENOENT read error', async () => {
    writeLayoutFile(TEST_HASH, '{}');
    vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );

    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    const result = await fake.invokeChannel(IPC.layout.load, TEST_HASH);
    expect(result).toMatchObject({ ok: false, error: { code: LayoutErrorCode.IO_FAILED } });
  });
});

describe('layout:load — happy path', () => {
  it('returns ok(layout) for a valid existing layout file', async () => {
    const layout = makeValidLayout();
    writeLayoutFile(TEST_HASH, JSON.stringify(layout));

    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    const result = await fake.invokeChannel(IPC.layout.load, TEST_HASH);
    expect(result).toEqual({ ok: true, data: layout });
  });
});

// ---------------------------------------------------------------------------
// layout:save tests
// ---------------------------------------------------------------------------

describe('layout:save — happy path', () => {
  it('writes layout and round-trips through load', async () => {
    const layout = makeValidLayout();

    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    const saveResult = await fake.invokeChannel(IPC.layout.save, TEST_HASH, layout);
    expect(saveResult).toEqual({ ok: true, data: undefined });

    const loadResult = await fake.invokeChannel(IPC.layout.load, TEST_HASH);
    expect(loadResult).toEqual({ ok: true, data: layout });
  });
});

describe('layout:save — IO_FAILED', () => {
  it('returns err(IO_FAILED) when mkdir fails', async () => {
    // Block userData at a file so mkdir cannot create the projects subdir
    const filePath = nodePath.join(tmpDir, 'blocking-file');
    fs.writeFileSync(filePath, 'block', 'utf8');
    __setUserDataDirForTests(filePath);

    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    const result = await fake.invokeChannel(IPC.layout.save, TEST_HASH, makeValidLayout());
    expect(result).toMatchObject({ ok: false, error: { code: LayoutErrorCode.IO_FAILED } });
  });
});

// ---------------------------------------------------------------------------
// layout:saveSnapshot tests
// ---------------------------------------------------------------------------

describe('layout:saveSnapshot — buffer write', () => {
  it('writes snapshot into the buffer via the on-channel', () => {
    const layout = makeValidLayout();
    const buffer = createLayoutSaveBufferForTests();
    const fake = makeFullFakeIpcMain();
    registerLayoutHandlers(fake, buffer);

    expect(buffer.hasSnapshot(TEST_HASH)).toBe(false);

    const handler = fake.onHandlers.get(IPC.layout.saveSnapshot)!;
    handler({} as never, TEST_HASH, layout);

    expect(buffer.hasSnapshot(TEST_HASH)).toBe(true);
    expect(buffer.takeAllSnapshots()).toEqual([[TEST_HASH, layout]]);
  });
});
