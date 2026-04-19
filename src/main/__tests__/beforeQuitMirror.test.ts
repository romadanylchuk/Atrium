import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLayoutSaveBufferForTests } from '@main/ipc/layoutSaveBuffer';
import type { LayoutFileV1 } from '@shared/layout';

// ---------------------------------------------------------------------------
// Module mock for saveLayoutByHash
// ---------------------------------------------------------------------------

vi.mock('@main/storage/layout', () => ({
  saveLayoutByHash: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

import { saveLayoutByHash } from '@main/storage/layout';
import { flushLayoutBuffer } from '@main/ipc/flushLayoutBuffer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLayout(projectPath: string): LayoutFileV1 {
  return { schemaVersion: 1, projectPath, nodePositions: {} };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('flushLayoutBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls saveLayoutByHash for each snapshot in the buffer', async () => {
    const buffer = createLayoutSaveBufferForTests();
    const dataA = makeLayout('/proj/a');
    const dataB = makeLayout('/proj/b');
    buffer.setSnapshot('hash-a', dataA);
    buffer.setSnapshot('hash-b', dataB);

    await flushLayoutBuffer(buffer);

    expect(saveLayoutByHash).toHaveBeenCalledTimes(2);
    expect(saveLayoutByHash).toHaveBeenCalledWith('hash-a', dataA);
    expect(saveLayoutByHash).toHaveBeenCalledWith('hash-b', dataB);
  });

  it('clears all snapshots from buffer after draining', async () => {
    const buffer = createLayoutSaveBufferForTests();
    buffer.setSnapshot('hash-a', makeLayout('/proj/a'));
    buffer.setSnapshot('hash-b', makeLayout('/proj/b'));

    await flushLayoutBuffer(buffer);

    expect(buffer.hasSnapshot('hash-a')).toBe(false);
    expect(buffer.hasSnapshot('hash-b')).toBe(false);
  });

  it('does nothing when buffer is empty', async () => {
    const buffer = createLayoutSaveBufferForTests();
    await flushLayoutBuffer(buffer);
    expect(saveLayoutByHash).not.toHaveBeenCalled();
  });
});
