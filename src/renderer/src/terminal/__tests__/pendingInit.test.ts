import { beforeEach, describe, expect, it } from 'vitest';
import { useAtriumStore } from '../../store/atriumStore';
import type { PendingInit } from '../../store/atriumStore';

const makePending = (overrides?: Partial<PendingInit>): PendingInit => ({
  source: 'gate',
  cwd: '/tmp/my-project',
  terminalId: 'term-1' as never,
  ...overrides,
});

beforeEach(() => {
  useAtriumStore.setState({
    pendingInit: null,
    terminal: { id: null, status: 'idle', fullscreen: false },
  });
});

describe('setPendingInit', () => {
  it('stores the pending init record', () => {
    const pending = makePending();
    useAtriumStore.getState().setPendingInit(pending);
    expect(useAtriumStore.getState().pendingInit).toEqual(pending);
  });

  it('overwrites an existing pending init', () => {
    useAtriumStore.getState().setPendingInit(makePending({ source: 'gate' }));
    const next = makePending({ source: 'panel', cwd: '/other' });
    useAtriumStore.getState().setPendingInit(next);
    expect(useAtriumStore.getState().pendingInit).toEqual(next);
  });
});

describe('clearPendingInit', () => {
  it('sets pendingInit to null', () => {
    useAtriumStore.getState().setPendingInit(makePending());
    useAtriumStore.getState().clearPendingInit();
    expect(useAtriumStore.getState().pendingInit).toBeNull();
  });

  it('is a no-op when already null', () => {
    useAtriumStore.getState().clearPendingInit();
    expect(useAtriumStore.getState().pendingInit).toBeNull();
  });
});
