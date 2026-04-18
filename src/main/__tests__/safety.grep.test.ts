/**
 * Negative safety grep tests — Phase 8
 *
 * These tests read TypeScript source files and assert structural properties
 * that cannot be caught by the type system alone:
 *
 *   1. Parser modules contain ZERO imports of 'electron'.
 *      The parser is deliberately Electron-free so it can run in plain Node.
 *
 *   2. No source file performs file-system WRITES to a path under '.ai-arch/'.
 *      The .ai-arch/ directory is read-only by architectural decree (CLAUDE.md).
 *
 * If either assertion fails, the test lists the offending file(s).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = nodePath.resolve(import.meta.dirname, '..', '..', '..');

/**
 * Recursively collect all .ts files under `dir`, excluding `__tests__` subdirs
 * and any path containing `node_modules`.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = nodePath.join(current, entry.name);
      if (entry.isDirectory()) {
        // Skip __tests__ directories and node_modules
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Test 1 — No Electron imports in the parser
// ---------------------------------------------------------------------------

describe('safety: parser is Electron-free', () => {
  it('no file under src/main/parser/ imports from "electron"', () => {
    const parserDir = nodePath.join(REPO_ROOT, 'src', 'main', 'parser');
    const files = collectTsFiles(parserDir);

    const ELECTRON_IMPORT_RE = /\bfrom\s+['"]electron['"]/;
    const ELECTRON_REQUIRE_RE = /\brequire\s*\(\s*['"]electron['"]\s*\)/;

    const offenders: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (ELECTRON_IMPORT_RE.test(content) || ELECTRON_REQUIRE_RE.test(content)) {
        offenders.push(nodePath.relative(REPO_ROOT, file));
      }
    }

    if (offenders.length > 0) {
      expect.fail(
        `Parser files must NOT import from 'electron'. Offenders:\n${offenders.map((f) => `  - ${f}`).join('\n')}`,
      );
    }

    expect(offenders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — No writes to .ai-arch/
// ---------------------------------------------------------------------------

describe('safety: no writes to .ai-arch/', () => {
  it('no source file performs a filesystem write targeting a .ai-arch/ path', () => {
    const srcDir = nodePath.join(REPO_ROOT, 'src');
    const files = collectTsFiles(srcDir);

    // We look for files that BOTH:
    //   a) contain the substring '.ai-arch' (literal)
    //   b) contain a write-API verb in close proximity
    //
    // The check is conservative: any file with '.ai-arch' AND a write verb
    // is flagged. Implementation files under src/main/project/ and
    // src/main/storage/ that read from .ai-arch/ should NOT appear because
    // the read ops use fs.readFile / fs.stat, which are not in the write list.

    const WRITE_VERBS_RE =
      /\b(writeFile|writeFileSync|appendFile|appendFileSync|writeFileAtomic|atomicWriteJson|rename(?:Sync)?|rm(?:Sync)?|unlink(?:Sync)?|mkdir(?:Sync)?)\s*[({]/;

    const offenders: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Only check files that mention .ai-arch at all
      if (!content.includes('.ai-arch')) continue;

      // Check if any write verb appears in the same file
      if (WRITE_VERBS_RE.test(content)) {
        // Narrow: check each line that contains .ai-arch for a write verb
        const lines = content.split('\n');
        const suspiciousLines: string[] = [];
        for (const line of lines) {
          if (line.includes('.ai-arch') && WRITE_VERBS_RE.test(line)) {
            suspiciousLines.push(line.trim());
          }
        }
        if (suspiciousLines.length > 0) {
          offenders.push(
            `${nodePath.relative(REPO_ROOT, file)}:\n${suspiciousLines.map((l) => `    ${l}`).join('\n')}`,
          );
        }
      }
    }

    if (offenders.length > 0) {
      expect.fail(
        `Source files must NOT write to .ai-arch/. Offenders:\n${offenders.map((f) => `  - ${f}`).join('\n')}`,
      );
    }

    expect(offenders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Shared skill files contain no Node/Electron imports
// ---------------------------------------------------------------------------

describe('safety: shared skill files are environment-free', () => {
  it('no file under src/shared/skill/ imports from electron, node:fs, node:path, fs, or path', () => {
    const skillDir = nodePath.join(REPO_ROOT, 'src', 'shared', 'skill');

    // Directory may not exist yet — skip gracefully
    if (!fs.existsSync(skillDir)) return;

    const files = collectTsFiles(skillDir);

    const FORBIDDEN_RE =
      /\bfrom\s+['"](?:electron|node:fs|node:path|fs|path)['"]/;

    const offenders: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (FORBIDDEN_RE.test(content)) {
        offenders.push(nodePath.relative(REPO_ROOT, file));
      }
    }

    if (offenders.length > 0) {
      expect.fail(
        `Shared skill files must NOT import from electron/fs/path. Offenders:\n${offenders.map((f) => `  - ${f}`).join('\n')}`,
      );
    }

    expect(offenders).toHaveLength(0);
  });
});
