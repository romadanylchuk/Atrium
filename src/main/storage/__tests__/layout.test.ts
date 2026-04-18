/**
 * Tests for src/main/storage/layout.ts
 *
 * Uses __setUserDataDirForTests to redirect all layout I/O to a temp directory.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { __setUserDataDirForTests, getProjectsDir } from '../paths.js';
import { hashKeyOnly } from '../projectHash.js';
import { loadLayout, saveLayout } from '../layout.js';

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
