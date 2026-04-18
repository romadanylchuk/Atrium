/**
 * App-wide configuration: recent projects list.
 *
 * Error handling (brief §D2, binding):
 *  1. File missing → return defaults, no warning.
 *  2. File unreadable (EACCES etc.) → warn once, return defaults.
 *  3. Corrupt JSON → quarantine to config.json.corrupt-<iso8601-utc> (colons
 *     replaced with dashes for Windows compat), warn once, return defaults.
 *     If quarantine rename itself fails → warn, do NOT overwrite corrupt file.
 *  4. schemaVersion === CURRENT → validate, return.
 *  5. schemaVersion < CURRENT → backup to config.json.v<old>.bak via atomic
 *     write BEFORE rewriting. Backup fail → warn, return defaults.
 *     Backup succeeds → run migration, atomic-write migrated, return.
 *  6. schemaVersion > CURRENT → warn, return in-memory defaults ONLY.
 *     Never overwrite the file (forward-compat).
 *  7. Non-number / missing schemaVersion → treat as corrupt (branch 3).
 *
 * One warn prefix: [atrium:config]
 */

import * as fs from 'node:fs';
import type { RecentProject } from '@shared/domain.js';
import { atomicWriteJson } from './atomicWrite.js';
import { getConfigPath } from './paths.js';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type AppConfigV1 = {
  schemaVersion: 1;
  recents: RecentProject[];
};

export const CURRENT_CONFIG_VERSION = 1 as const;

/** Maximum number of recent projects to retain. */
const MAX_RECENTS = 5;

/**
 * Migration registry: maps a *previous* schema version number to a function
 * that upgrades it to AppConfigV1.
 *
 * Empty for Stage 02 — CURRENT_CONFIG_VERSION is 1, there are no prior versions.
 * Shape is in place so Stage 03+ can append entries without structural change.
 */
const MIGRATIONS: Record<number, (prev: unknown) => AppConfigV1> = {};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function makeDefaults(): AppConfigV1 {
  return { schemaVersion: 1, recents: [] };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** ISO-8601 UTC timestamp with colons replaced by dashes (Windows-safe filename). */
function isoUtcNow(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

/**
 * Returns true if `v` looks like a valid AppConfigV1 shape.
 * Coerces bad recents entries rather than failing closed on them.
 */
function isValidConfig(v: unknown): v is AppConfigV1 {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj['schemaVersion'] !== CURRENT_CONFIG_VERSION) return false;
  if (!Array.isArray(obj['recents'])) return false;
  return true;
}

/** Coerce the recents array — drop entries that lack path/name/lastOpened. */
function coerceRecents(raw: unknown[]): RecentProject[] {
  return raw.filter((item): item is RecentProject => {
    if (typeof item !== 'object' || item === null) return false;
    const r = item as Record<string, unknown>;
    return (
      typeof r['path'] === 'string' &&
      typeof r['name'] === 'string' &&
      typeof r['lastOpened'] === 'string'
    );
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the app config from disk.
 *
 * Never throws — every failure path returns defaults.
 * Warnings are emitted via console.warn with prefix [atrium:config].
 */
export async function loadAppConfig(): Promise<AppConfigV1> {
  const configPath = getConfigPath();

  // 1. Try to read the file.
  let raw: string;
  try {
    raw = await fs.promises.readFile(configPath, 'utf8');
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      // File missing — silently return defaults (branch 1).
      return makeDefaults();
    }
    // Unreadable for other reason (branch 2).
    console.warn(`[atrium:config] Cannot read config: ${nodeErr.message}`);
    return makeDefaults();
  }

  // 2. Parse JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — quarantine (branch 3).
    const quarantinePath = `${configPath}.corrupt-${isoUtcNow()}`;
    try {
      await fs.promises.rename(configPath, quarantinePath);
      console.warn(
        `[atrium:config] Corrupt config.json quarantined to ${quarantinePath}. Starting fresh.`,
      );
    } catch (renameErr) {
      console.warn(
        `[atrium:config] Corrupt config.json could not be quarantined (${(renameErr as Error).message}). Starting fresh without overwriting.`,
      );
    }
    return makeDefaults();
  }

  // 3. Validate schemaVersion.
  if (typeof parsed !== 'object' || parsed === null) {
    // Not an object — treat as corrupt.
    const quarantinePath = `${configPath}.corrupt-${isoUtcNow()}`;
    try {
      await fs.promises.rename(configPath, quarantinePath);
      console.warn(`[atrium:config] config.json is not an object; quarantined. Starting fresh.`);
    } catch {
      console.warn(`[atrium:config] config.json is not an object; quarantine failed. Starting fresh.`);
    }
    return makeDefaults();
  }

  const obj = parsed as Record<string, unknown>;
  const version = obj['schemaVersion'];

  if (typeof version !== 'number' || !Number.isInteger(version)) {
    // Missing or non-integer schemaVersion — treat as corrupt (branch 7).
    const quarantinePath = `${configPath}.corrupt-${isoUtcNow()}`;
    try {
      await fs.promises.rename(configPath, quarantinePath);
      console.warn(`[atrium:config] config.json has invalid schemaVersion; quarantined. Starting fresh.`);
    } catch {
      console.warn(`[atrium:config] config.json has invalid schemaVersion; quarantine failed. Starting fresh.`);
    }
    return makeDefaults();
  }

  // 4. Current version (branch 4).
  if (version === CURRENT_CONFIG_VERSION) {
    if (!isValidConfig(parsed)) {
      // Passes version check but malformed body — treat as corrupt.
      const quarantinePath = `${configPath}.corrupt-${isoUtcNow()}`;
      try {
        await fs.promises.rename(configPath, quarantinePath);
        console.warn(`[atrium:config] config.json has current version but invalid shape; quarantined.`);
      } catch {
        console.warn(`[atrium:config] config.json invalid shape; quarantine failed. Starting fresh.`);
      }
      return makeDefaults();
    }
    const recents = Array.isArray(obj['recents']) ? coerceRecents(obj['recents'] as unknown[]) : [];
    return { schemaVersion: 1, recents };
  }

  // 5. Older version — back up and migrate (branch 5).
  if (version < CURRENT_CONFIG_VERSION) {
    const backupPath = `${configPath}.v${version}.bak`;
    try {
      await atomicWriteJson(backupPath, parsed);
    } catch (backupErr) {
      console.warn(
        `[atrium:config] Could not back up v${version} config to ${backupPath}: ${(backupErr as Error).message}. Returning defaults.`,
      );
      return makeDefaults();
    }

    // Run migration if one exists; otherwise treat it as a no-op (empty registry).
    const migrate = MIGRATIONS[version];
    let migrated: AppConfigV1;
    if (migrate != null) {
      migrated = migrate(parsed);
    } else {
      // No migration entry — produce defaults with current version.
      migrated = makeDefaults();
    }

    try {
      await atomicWriteJson(configPath, migrated);
    } catch (writeErr) {
      console.warn(
        `[atrium:config] Migration write failed: ${(writeErr as Error).message}. Returning migrated data without persisting.`,
      );
    }
    return migrated;
  }

  // 6. Future version — load defaults in memory, never overwrite (branch 6).
  console.warn(
    `[atrium:config] config.json has future schemaVersion ${version} (current: ${CURRENT_CONFIG_VERSION}). Loading defaults in memory; file is unchanged.`,
  );
  return makeDefaults();
}

/**
 * Atomically persist the given config to disk.
 */
export async function saveAppConfig(cfg: AppConfigV1): Promise<void> {
  await atomicWriteJson(getConfigPath(), cfg);
}

/**
 * Add or promote a recent project to the front of the recents list.
 *
 * @param projectPath — absolute path to the project root.
 * @param name        — human-readable project name.
 * @param now         — timestamp to use (injectable for tests).
 */
export async function bumpRecent(
  projectPath: string,
  name: string,
  now: Date = new Date(),
): Promise<void> {
  const cfg = await loadAppConfig();
  const lastOpened = now.toISOString();

  // Deduplicate by normalized path, then prepend the new entry.
  const deduped = cfg.recents.filter((r) => r.path !== projectPath);
  const updated: RecentProject[] = [
    { path: projectPath, name, lastOpened },
    ...deduped,
  ].slice(0, MAX_RECENTS);

  await saveAppConfig({ ...cfg, recents: updated });
}

/**
 * Return the current list of recent projects.
 */
export async function getRecents(): Promise<RecentProject[]> {
  const cfg = await loadAppConfig();
  return cfg.recents;
}
