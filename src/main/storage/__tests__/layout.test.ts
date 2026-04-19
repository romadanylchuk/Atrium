/**
 * Tests for src/main/storage/layout.ts
 *
 * Uses __setUserDataDirForTests to redirect all layout I/O to a temp directory.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { __setUserDataDirForTests, getProjectsDir, getLayoutPath } from '../paths.js';
import { hashKeyOnly } from '../projectHash.js';
import { loadLayout, saveLayout, loadLayoutByHash, saveLayoutByHash } from '../layout.js';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'atrium-layout-test-'));
  __setUserDataDirForTests(tmpDir);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setUserDataDirForTests(null);
  vi.restoreAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadLayout — missing file', () => {
  it('returns default layout when no layout file exists', async () => {
    const projectPath = '/fake/project';
    const layout = await loadLayout(projectPath);
    expect(layout.schemaVersion).toBe(1);
    expect(layout.projectPath).toBe(projectPath);
    expect(layout.nodePositions).toEqual({});
    expect(layout.viewport).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('saveLayout — auto-mkdir', () => {
  it('creates projects/<hash>/ directory automatically', async () => {
    const projectPath = '/home/user/test-project';
    const hash = hashKeyOnly(projectPath);

    const layout = {
      schemaVersion: 1 as const,
      projectPath,
      nodePositions: {},
    };

    await saveLayout(projectPath, layout);

    const projectDir = nodePath.join(getProjectsDir(), hash);
    expect(fs.existsSync(projectDir)).toBe(true);
  });
});

describe('round-trip save/load', () => {
  it('preserves projectPath field through save and reload', async () => {
    const projectPath = '/home/user/my-great-project';
    const layout = {
      schemaVersion: 1 as const,
      projectPath,
      nodePositions: {
        'canvas-ui': { x: 100, y: 200 },
        'data-layer': { x: 300, y: 400 },
      },
      viewport: { x: -50, y: -50, zoom: 1.5 },
    };

    await saveLayout(projectPath, layout);
    const loaded = await loadLayout(projectPath);

    expect(loaded.projectPath).toBe(projectPath);
    expect(loaded.nodePositions['canvas-ui']).toEqual({ x: 100, y: 200 });
    expect(loaded.nodePositions['data-layer']).toEqual({ x: 300, y: 400 });
    expect(loaded.viewport).toEqual({ x: -50, y: -50, zoom: 1.5 });
  });

  it('round-trips empty nodePositions', async () => {
    const projectPath = '/projects/empty';
    const layout = { schemaVersion: 1 as const, projectPath, nodePositions: {} };

    await saveLayout(projectPath, layout);
    const loaded = await loadLayout(projectPath);

    expect(loaded.nodePositions).toEqual({});
    expect(loaded.projectPath).toBe(projectPath);
  });

  it('overwrites existing layout on second save', async () => {
    const projectPath = '/projects/overwrite-test';
    const layout1 = {
      schemaVersion: 1 as const,
      projectPath,
      nodePositions: { a: { x: 1, y: 2 } },
    };
    const layout2 = {
      schemaVersion: 1 as const,
      projectPath,
      nodePositions: { b: { x: 9, y: 8 } },
    };

    await saveLayout(projectPath, layout1);
    await saveLayout(projectPath, layout2);
    const loaded = await loadLayout(projectPath);

    expect(loaded.nodePositions['b']).toEqual({ x: 9, y: 8 });
    expect(loaded.nodePositions['a']).toBeUndefined();
  });
});

describe('loadLayout — corrupt file', () => {
  it('quarantines corrupt JSON and returns defaults', async () => {
    const projectPath = '/projects/corrupt-test';
    // First save a valid layout to create the directory.
    await saveLayout(projectPath, {
      schemaVersion: 1 as const,
      projectPath,
      nodePositions: {},
    });

    // Overwrite with corrupt JSON.
    const hash = hashKeyOnly(projectPath);
    const layoutPath = nodePath.join(getProjectsDir(), hash, 'layout.json');
    fs.writeFileSync(layoutPath, '{ BROKEN JSON', 'utf8');

    const result = await loadLayout(projectPath);
    expect(result.projectPath).toBe(projectPath);
    expect(result.nodePositions).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadLayoutByHash / saveLayoutByHash
// ---------------------------------------------------------------------------

const TEST_HASH = 'deadbeef';

describe('loadLayoutByHash — missing file', () => {
  it('returns ok(null) when no layout file exists', async () => {
    const result = await loadLayoutByHash(TEST_HASH);
    expect(result).toEqual({ ok: true, data: null });
  });
});

describe('loadLayoutByHash — corrupt JSON', () => {
  it('quarantines the file and returns err(CORRUPT)', async () => {
    const projectDir = nodePath.join(getProjectsDir(), TEST_HASH);
    fs.mkdirSync(projectDir, { recursive: true });
    const layoutPath = getLayoutPath(TEST_HASH);
    fs.writeFileSync(layoutPath, '{ BAD JSON', 'utf8');

    const result = await loadLayoutByHash(TEST_HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CORRUPT');
    }
    // Original file should be gone (quarantined).
    expect(fs.existsSync(layoutPath)).toBe(false);
  });
});

describe('loadLayoutByHash — invalid shape', () => {
  it('quarantines the file and returns err(CORRUPT) when shape is wrong', async () => {
    const projectDir = nodePath.join(getProjectsDir(), TEST_HASH);
    fs.mkdirSync(projectDir, { recursive: true });
    const layoutPath = getLayoutPath(TEST_HASH);
    fs.writeFileSync(layoutPath, JSON.stringify({ schemaVersion: 1, nodePositions: 'not-an-object' }), 'utf8');

    const result = await loadLayoutByHash(TEST_HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CORRUPT');
    }
    expect(fs.existsSync(layoutPath)).toBe(false);
  });
});

describe('loadLayoutByHash — schema mismatch', () => {
  it('returns err(SCHEMA_MISMATCH) and leaves file untouched', async () => {
    const projectDir = nodePath.join(getProjectsDir(), TEST_HASH);
    fs.mkdirSync(projectDir, { recursive: true });
    const layoutPath = getLayoutPath(TEST_HASH);
    const futureLayout = { schemaVersion: 2, projectPath: '/x', nodePositions: {} };
    fs.writeFileSync(layoutPath, JSON.stringify(futureLayout), 'utf8');

    const result = await loadLayoutByHash(TEST_HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_MISMATCH');
    }
    // File must remain untouched (no quarantine).
    expect(fs.existsSync(layoutPath)).toBe(true);
  });
});

describe('loadLayoutByHash — IO_FAILED', () => {
  it('returns err(IO_FAILED) on a non-ENOENT read error', async () => {
    // Create the layout directory + file first so readFile finds it, then
    // replace it with a spy that throws EACCES (non-ENOENT).
    const projectDir = nodePath.join(getProjectsDir(), TEST_HASH);
    fs.mkdirSync(projectDir, { recursive: true });
    const layoutPath = getLayoutPath(TEST_HASH);
    fs.writeFileSync(layoutPath, '{}', 'utf8');

    const readFileSpy = vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );

    const result = await loadLayoutByHash(TEST_HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('IO_FAILED');
    }
    readFileSpy.mockRestore();
  });
});

describe('saveLayoutByHash — happy path round-trip', () => {
  it('writes and reads back the layout via loadLayoutByHash', async () => {
    const data = {
      schemaVersion: 1 as const,
      projectPath: '/projects/roundtrip',
      nodePositions: { 'node-a': { x: 10, y: 20 } },
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    const saveResult = await saveLayoutByHash(TEST_HASH, data);
    expect(saveResult).toEqual({ ok: true, data: undefined });

    const loadResult = await loadLayoutByHash(TEST_HASH);
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.data).toEqual(data);
    }
  });
});

describe('saveLayoutByHash — IO_FAILED', () => {
  it('returns err(IO_FAILED) when the userData dir is a file (mkdir fails)', async () => {
    const filePath = nodePath.join(tmpDir, 'blocking-file');
    fs.writeFileSync(filePath, 'block', 'utf8');
    __setUserDataDirForTests(filePath);

    const data = {
      schemaVersion: 1 as const,
      projectPath: '/x',
      nodePositions: {},
    };
    const result = await saveLayoutByHash(TEST_HASH, data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('IO_FAILED');
    }
  });
});
