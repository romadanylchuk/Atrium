/**
 * Tests for src/main/project/openProject.ts
 *
 * Uses __setUserDataDirForTests to redirect all config/storage I/O to a temp directory.
 * Reset in afterEach to avoid state leakage.
 *
 * Happy-path fixture: this repo's own root (process.cwd() during test run), which
 * contains a valid .ai-arch/ directory.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { __setUserDataDirForTests } from '@main/storage';
import * as storageModule from '@main/storage';
import { openProject, readAndAssembleProject } from '../openProject';
import { ProjectErrorCode } from '@shared/errors';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'atrium-proj-test-'));
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
// Helper: derive repo root from this file's location
// ---------------------------------------------------------------------------

// This file is at src/main/project/__tests__/openProject.test.ts
// Repo root is 4 levels up: __tests__ -> project -> main -> src -> repo root
const REPO_ROOT = nodePath.resolve(import.meta.dirname, '..', '..', '..', '..');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('openProject', () => {
  describe('happy path — repo self-fixture', () => {
    it('returns Result.ok with correct projectName and nodes', async () => {
      const result = await openProject(REPO_ROOT);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.projectName).toBe('Atrium');
      expect(result.data.nodes.length).toBeGreaterThan(0);
    });

    it('returns zero warnings (all idea files are present in repo)', async () => {
      const result = await openProject(REPO_ROOT);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.warnings).toHaveLength(0);
    });
  });

  describe('PATH_NOT_FOUND — non-existent path', () => {
    it('returns Result.err with PATH_NOT_FOUND', async () => {
      const nonExistent = nodePath.join(os.tmpdir(), `atrium-nope-${Date.now()}`);
      const result = await openProject(nonExistent);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ProjectErrorCode.PATH_NOT_FOUND);
    });
  });

  describe('NOT_AN_ARCH_PROJECT — directory with no .ai-arch/', () => {
    it('returns Result.err with NOT_AN_ARCH_PROJECT', async () => {
      // tmpDir exists but has no .ai-arch/index.json
      const result = await openProject(tmpDir);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ProjectErrorCode.NOT_AN_ARCH_PROJECT);
    });
  });

  describe('PARSE_FAILED — truncated index.json', () => {
    it('returns Result.err with PARSE_FAILED', async () => {
      const archDir = nodePath.join(tmpDir, '.ai-arch');
      fs.mkdirSync(archDir, { recursive: true });
      fs.writeFileSync(nodePath.join(archDir, 'index.json'), '{"project": "Broken', 'utf8');

      const result = await openProject(tmpDir);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ProjectErrorCode.PARSE_FAILED);
    });
  });

  describe('Partial — missing idea file', () => {
    it('returns Result.ok with MISSING_IDEA_FILE warning', async () => {
      const archDir = nodePath.join(tmpDir, '.ai-arch');
      const ideasDir = nodePath.join(archDir, 'ideas');
      fs.mkdirSync(ideasDir, { recursive: true });

      // index.json references ideas/ghost.md which does not exist
      const partialIndex = JSON.stringify({
        project: 'Ghost',
        created: '2026-01-01',
        last_updated: '2026-01-01',
        nodes: [
          {
            slug: 'ghost-node',
            name: 'Ghost Node',
            priority: 'core',
            maturity: 'raw-idea',
            file: 'ideas/ghost.md',
            summary: 'A missing idea file',
          },
        ],
        connections: [],
        sessions: [],
      });
      fs.writeFileSync(nodePath.join(archDir, 'index.json'), partialIndex, 'utf8');

      const result = await openProject(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const missingWarnings = result.data.warnings.filter((w) => w.code === 'MISSING_IDEA_FILE');
      expect(missingWarnings.length).toBeGreaterThan(0);
      expect(missingWarnings[0]?.file).toBe('ideas/ghost.md');
    });
  });

  describe('readAndAssembleProject parity', () => {
    it('produces the same ProjectState as openProject without bumpRecent side effect', async () => {
      const bumpSpy = vi.spyOn(storageModule, 'bumpRecent').mockResolvedValue(undefined);

      const [openResult, readResult] = await Promise.all([
        openProject(REPO_ROOT),
        readAndAssembleProject(REPO_ROOT),
      ]);

      expect(openResult.ok).toBe(true);
      expect(readResult.ok).toBe(true);
      if (!openResult.ok || !readResult.ok) return;

      expect(readResult.data).toEqual(openResult.data);
      // openProject calls bumpRecent; readAndAssembleProject does not
      expect(bumpSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('bumpRecent failure — does NOT fail the open', () => {
    it('returns Result.ok even when bumpRecent rejects', async () => {
      // Spy on bumpRecent to make it reject
      vi.spyOn(storageModule, 'bumpRecent').mockRejectedValue(new Error('disk full'));

      const result = await openProject(REPO_ROOT);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.projectName).toBe('Atrium');
    });
  });

  describe('READ_FAILED — unreadable index.json', () => {
    it('returns Result.err with READ_FAILED when index.json is a directory (cannot be read as file)', async () => {
      const archDir = nodePath.join(tmpDir, '.ai-arch');
      // Create index.json as a DIRECTORY so fs.stat passes but fs.readFile throws EISDIR
      fs.mkdirSync(nodePath.join(archDir, 'index.json'), { recursive: true });

      const result = await openProject(tmpDir);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ProjectErrorCode.READ_FAILED);
    });
  });
});
