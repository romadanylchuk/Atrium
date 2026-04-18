/**
 * Storage path helpers.
 *
 * All functions are lazy — they never call app.getPath at module import time.
 * Electron throws if app.getPath is called before app is ready.
 *
 * Tests inject an override via __setUserDataDirForTests and must reset it in afterEach.
 */

import * as nodePath from 'node:path';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Test seam
// ---------------------------------------------------------------------------

let _overrideDir: string | null = null;

/**
 * Override the userData directory for tests.
 * Call with null to reset (do this in afterEach).
 */
export function __setUserDataDirForTests(dir: string | null): void {
  _overrideDir = dir;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Returns the Electron userData directory (or test override).
 * Called per-operation — never cached at import time.
 */
export function getUserDataDir(): string {
  if (_overrideDir !== null) return _overrideDir;
  return app.getPath('userData');
}

// ---------------------------------------------------------------------------
// Derived paths
// ---------------------------------------------------------------------------

/** Path to the app-wide config file. */
export function getConfigPath(): string {
  return nodePath.join(getUserDataDir(), 'config.json');
}

/** Path to the directory that holds all per-project subdirs. */
export function getProjectsDir(): string {
  return nodePath.join(getUserDataDir(), 'projects');
}

/**
 * Path to the per-project directory identified by its 8-char hash key.
 * The hash key is produced by `hashKeyOnly(absPath)`.
 */
export function getProjectDir(hash: string): string {
  return nodePath.join(getProjectsDir(), hash);
}

/**
 * Path to the layout file for a project.
 * @param hash — 8-char hex key from `hashKeyOnly`.
 */
export function getLayoutPath(hash: string): string {
  return nodePath.join(getProjectDir(hash), 'layout.json');
}

/**
 * Path to the meta file for a project.
 * Reserved — not written in Stage 02 (brief §D1).
 * @param hash — 8-char hex key from `hashKeyOnly`.
 */
export function getMetaPath(hash: string): string {
  return nodePath.join(getProjectDir(hash), 'meta.json');
}
