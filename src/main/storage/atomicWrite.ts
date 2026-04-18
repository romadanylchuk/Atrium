/**
 * Atomic JSON write helper.
 *
 * Wraps write-file-atomic so all config/layout writes go through a single
 * implementation: .tmp → fsync → rename (including Windows semantics).
 */

import writeFileAtomic from 'write-file-atomic';

/**
 * Atomically write `value` as pretty-printed JSON to `filePath`.
 * Uses write-file-atomic's tmp→fsync→rename strategy.
 *
 * @param filePath — absolute path to the destination file.
 * @param value    — any JSON-serialisable value.
 */
export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  await writeFileAtomic(filePath, json, { encoding: 'utf8' });
}
