/**
 * Project identity helpers — pure Node.js, zero Electron imports.
 *
 * Design decisions from brief §D1 (binding):
 *  - Slug = basename → lowercase → [a-z0-9-] only (collapse runs, trim edges)
 *           → cap 32 chars → fallback literal "project" if empty.
 *  - Hash = sha256(normalizedPath).slice(0, 8)  (8-char hex).
 *  - normalizedPath = path.resolve(abs) + toLowerCase() on win32 only.
 *  - Full 8-char hash is the lookup key; slug is cosmetic.
 *  - layout.json carries projectPath for orphan detection.
 */

import * as crypto from 'node:crypto';
import * as nodePath from 'node:path';

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Normalize an absolute path for hashing.
 *  - Always runs path.resolve to canonicalize.
 *  - On win32, lowercases the result (filesystem is case-insensitive).
 */
export function normalizePath(abs: string): string {
  const resolved = nodePath.resolve(abs);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Produce a URL-safe, cosmetic slug from a directory basename.
 *
 * Rules (brief §D1):
 *  1. Take the basename of the path (just the final segment).
 *  2. Lowercase.
 *  3. Replace any character NOT in [a-z0-9] with a hyphen.
 *  4. Collapse consecutive hyphens into one.
 *  5. Trim leading/trailing hyphens.
 *  6. Cap at 32 characters.
 *  7. If the result is empty, return the literal string "project".
 */
export function slugify(basename: string): string {
  const slug = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
    .replace(/-{2,}/g, '-') // collapse runs
    .replace(/^-+|-+$/g, '') // trim edges
    .slice(0, 32) // cap
    .replace(/^-+|-+$/g, ''); // re-trim after slice

  return slug.length > 0 ? slug : 'project';
}

/**
 * Compute the 8-char hex hash for a given absolute project path.
 * This is the *lookup key* — what goes into Map<hash, …> lookups.
 */
export function hashKeyOnly(abs: string): string {
  const norm = normalizePath(abs);
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 8);
}

/**
 * Compute the full project directory name: `<slug>-<8-char-hex>`.
 * Used as the on-disk directory name under userData/projects/.
 */
export function hashProjectPath(abs: string): string {
  const norm = normalizePath(abs);
  const basename = nodePath.basename(norm);
  const slug = slugify(basename);
  const hash = crypto.createHash('sha256').update(norm).digest('hex').slice(0, 8);
  return `${slug}-${hash}`;
}
