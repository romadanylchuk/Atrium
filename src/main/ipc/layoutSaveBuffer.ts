/**
 * layoutSaveBuffer.ts — main-side snapshot buffer for before-quit flushing.
 *
 * Stores the last-known-good layout snapshot per projectHash.
 * Flushed by the app.on('before-quit') handler in Phase 9.
 *
 * No Electron imports — pure data. Injectable in tests.
 */

import type { LayoutFileV1 } from '@shared/layout';

export interface LayoutSaveBuffer {
  setSnapshot(hash: string, data: LayoutFileV1): void;
  takeAllSnapshots(): Array<[string, LayoutFileV1]>;
  clearSnapshot(hash: string): void;
  hasSnapshot(hash: string): boolean;
}

function createLayoutSaveBuffer(): LayoutSaveBuffer {
  const store = new Map<string, LayoutFileV1>();

  return {
    setSnapshot(hash, data) {
      store.set(hash, data);
    },
    takeAllSnapshots() {
      const entries = Array.from(store.entries());
      store.clear();
      return entries;
    },
    clearSnapshot(hash) {
      store.delete(hash);
    },
    hasSnapshot(hash) {
      return store.has(hash);
    },
  };
}

export const defaultBuffer: LayoutSaveBuffer = createLayoutSaveBuffer();

/** Creates a fresh isolated buffer instance for use in tests. */
export { createLayoutSaveBuffer as createLayoutSaveBufferForTests };
