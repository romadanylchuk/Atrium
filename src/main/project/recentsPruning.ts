/**
 * recentsPruning.ts — classifier for "poisoning" errors that should trigger
 * removal of a path from the recents list.
 *
 * Poisoning = the path can never be opened again without user intervention:
 *   ENOENT    — path deleted
 *   ENOTDIR   — parent path is not a directory
 *   EACCES    — permission denied (POSIX only; win32 EACCES is transient)
 *
 * Non-poisoning = transient or non-structural:
 *   EBUSY, EMFILE, layout/parse errors, win32 EACCES, anything non-errno
 */

/**
 * Returns true when `err` represents a permanent, structural failure that
 * means the project path should be removed from the recents list.
 *
 * The error is classified from the `message` string that `readAndAssembleProject`
 * encodes as `"${e.code}: ${msg}"` — so we look for known codes as a prefix.
 *
 * @param err       — the Result.err value (or any unknown thrown value)
 * @param platform  — injectable for tests; defaults to `process.platform`
 */
export function isRecentsPoisoningError(
  err: unknown,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const code = extractCode(err);
  if (code === null) return false;

  switch (code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return true;
    case 'EACCES':
      return platform !== 'win32';
    default:
      return false;
  }
}

function extractCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;

  // Direct NodeJS.ErrnoException — check .code
  if (typeof e['code'] === 'string') return e['code'];

  // Encoded in message as "CODE: …" (from readAndAssembleProject's err() call)
  if (typeof e['message'] === 'string') {
    const match = /^([A-Z_]+):/.exec(e['message']);
    if (match) return match[1] ?? null;
  }

  return null;
}
