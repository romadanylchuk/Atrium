/**
 * Per-project layout persistence.
 *
 * Stores node positions and viewport so the canvas state survives restarts.
 * The `projectPath` field is the orphan-detection anchor (brief §D1).
 *
 * Follows the same fail-closed/atomic/quarantine pattern as appConfig.ts.
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { atomicWriteJson } from './atomicWrite.js';
import { getLayoutPath, getProjectDir } from './paths.js';
import { hashKeyOnly } from './projectHash.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodePosition = { x: number; y: number };

export type Viewport = { x: number; y: number; zoom: number };

export type LayoutFileV1 = {
  schemaVersion: 1;
  /** Absolute path to the project root — used for orphan detection. */
  projectPath: string;
  /** Map from node slug to canvas position. */
  nodePositions: Record<string, NodePosition>;
  /** Optional saved viewport (pan + zoom). */
  viewport?: Viewport;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CURRENT_LAYOUT_VERSION = 1 as const;

/** ISO-8601 UTC timestamp with colons replaced by dashes (Windows-safe filename). */
function isoUtcNow(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

function makeDefaultLayout(projectAbsPath: string): LayoutFileV1 {
  return { schemaVersion: 1, projectPath: projectAbsPath, nodePositions: {} };
}

function isValidLayout(v: unknown): v is LayoutFileV1 {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj['schemaVersion'] === CURRENT_LAYOUT_VERSION &&
    typeof obj['projectPath'] === 'string' &&
    typeof obj['nodePositions'] === 'object' &&
    obj['nodePositions'] !== null
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the layout file for a project.
 *
 * @param projectAbsPath — absolute path to the project root directory.
 */
export async function loadLayout(projectAbsPath: string): Promise<LayoutFileV1> {
  const hash = hashKeyOnly(projectAbsPath);
  const layoutPath = getLayoutPath(hash);

  let raw: string;
  try {
    raw = await fs.promises.readFile(layoutPath, 'utf8');
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return makeDefaultLayout(projectAbsPath);
    }
    console.warn(`[atrium:config] Cannot read layout file: ${nodeErr.message}`);
    return makeDefaultLayout(projectAbsPath);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — quarantine.
    const quarantinePath = `${layoutPath}.corrupt-${isoUtcNow()}`;
    try {
      await fs.promises.rename(layoutPath, quarantinePath);
      console.warn(`[atrium:config] Corrupt layout.json quarantined to ${quarantinePath}. Starting fresh.`);
    } catch (renameErr) {
      console.warn(
        `[atrium:config] Corrupt layout.json could not be quarantined (${(renameErr as Error).message}). Starting fresh.`,
      );
    }
    return makeDefaultLayout(projectAbsPath);
  }

  if (!isValidLayout(parsed)) {
    const quarantinePath = `${layoutPath}.corrupt-${isoUtcNow()}`;
    try {
      await fs.promises.rename(layoutPath, quarantinePath);
      console.warn(`[atrium:config] Invalid layout.json quarantined. Starting fresh.`);
    } catch {
      console.warn(`[atrium:config] Invalid layout.json; quarantine failed. Starting fresh.`);
    }
    return makeDefaultLayout(projectAbsPath);
  }

  return parsed;
}

/**
 * Atomically persist the layout for a project.
 * Creates the project directory (`userData/projects/<hash>/`) if it doesn't exist.
 *
 * @param projectAbsPath — absolute path to the project root directory.
 * @param data           — layout data to persist.
 */
export async function saveLayout(projectAbsPath: string, data: LayoutFileV1): Promise<void> {
  const hash = hashKeyOnly(projectAbsPath);
  const projectDir = getProjectDir(hash);
  await fs.promises.mkdir(projectDir, { recursive: true });
  const layoutPath = getLayoutPath(hash);
  await atomicWriteJson(layoutPath, data);
}

/**
 * Returns the path used to store the layout file for a given project.
 * Exported for tests / diagnostics.
 */
export function layoutPathFor(projectAbsPath: string): string {
  const hash = hashKeyOnly(projectAbsPath);
  return nodePath.join(getProjectDir(hash), 'layout.json');
}
