/**
 * Lockfile safety test — Phase 8 AC 11
 *
 * Asserts that native runtime dependencies and the rebuild tool are pinned
 * to exact versions (no ^ or ~ prefix) in package.json, preventing silent
 * drift between electron-rebuild runs.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';

const REPO_ROOT = nodePath.resolve(import.meta.dirname, '..', '..', '..');

const pkg = JSON.parse(fs.readFileSync(nodePath.join(REPO_ROOT, 'package.json'), 'utf-8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const EXACT_VERSION_RE = /^\d+\.\d+\.\d+$/;

describe('safety: native deps are pinned to exact versions', () => {
  const runtimeDeps: Array<[string, string | undefined]> = [
    ['node-pty', pkg.dependencies['node-pty']],
    ['@parcel/watcher', pkg.dependencies['@parcel/watcher']],
    ['fix-path', pkg.dependencies['fix-path']],
  ];

  for (const [name, version] of runtimeDeps) {
    it(`dependencies["${name}"] is an exact version`, () => {
      expect(version, `${name} must be pinned (no ^ or ~)`).toMatch(EXACT_VERSION_RE);
    });
  }

  it('devDependencies["@electron/rebuild"] is an exact version', () => {
    const version = pkg.devDependencies['@electron/rebuild'];
    expect(version, '@electron/rebuild must be pinned (no ^ or ~)').toMatch(EXACT_VERSION_RE);
  });
});
