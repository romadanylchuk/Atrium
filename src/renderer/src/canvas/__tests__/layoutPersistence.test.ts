import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { createLayoutPersistence } from '../layoutPersistence';

const mockSave = vi.fn();
const mockSaveSnapshot = vi.fn();

// Stub window.atrium before importing the module
vi.stubGlobal('atrium', {
  layout: {
    save: mockSave,
    saveSnapshot: mockSaveSnapshot,
  },
});


describe('createLayoutPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSave.mockClear();
    mockSaveSnapshot.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT call IPC after 499ms', () => {
    const p = createLayoutPersistence('hash1', '/test/project');
    p.saveNodes([{ id: 'a', position: { x: 10, y: 20 } }]);
    vi.advanceTimersByTime(499);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
    p.dispose();
  });

  it('calls layout:save and layout:saveSnapshot once at 500ms with correct node positions', () => {
    const p = createLayoutPersistence('hash1', '/test/project');
    p.saveNodes([{ id: 'a', position: { x: 10, y: 20 } }]);
    vi.advanceTimersByTime(500);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSaveSnapshot).toHaveBeenCalledTimes(1);
    const [hash, data] = mockSave.mock.calls[0] as [string, unknown];
    expect(hash).toBe('hash1');
    expect(data).toMatchObject({ nodePositions: { a: { x: 10, y: 20 } } });
    p.dispose();
  });

  it('coalesces multiple saveNodes calls within debounce window into one IPC call', () => {
    const p = createLayoutPersistence('hash1', '/test/project');
    p.saveNodes([{ id: 'a', position: { x: 1, y: 1 } }]);
    vi.advanceTimersByTime(100);
    p.saveNodes([{ id: 'a', position: { x: 2, y: 2 } }]);
    vi.advanceTimersByTime(100);
    p.saveNodes([{ id: 'a', position: { x: 3, y: 3 } }]);
    vi.advanceTimersByTime(500);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const [, data] = mockSave.mock.calls[0] as [string, { nodePositions: Record<string, { x: number; y: number }> }];
    expect(data.nodePositions['a']).toEqual({ x: 3, y: 3 });
    p.dispose();
  });

  it('fires viewport debounce at 1000ms', () => {
    const p = createLayoutPersistence('hash1', '/test/project');
    p.saveViewport({ x: 5, y: 10, zoom: 1.5 });
    vi.advanceTimersByTime(999);
    expect(mockSave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const [, data] = mockSave.mock.calls[0] as [string, { viewport?: unknown }];
    expect(data.viewport).toEqual({ x: 5, y: 10, zoom: 1.5 });
    p.dispose();
  });

  it('flush() fires IPC immediately and cancels pending timer', () => {
    const p = createLayoutPersistence('hash1', '/test/project');
    p.saveNodes([{ id: 'b', position: { x: 50, y: 60 } }]);
    vi.advanceTimersByTime(100);
    expect(mockSave).not.toHaveBeenCalled();
    p.flush();
    expect(mockSave).toHaveBeenCalledTimes(1);
    // No second call after the timer would have fired
    vi.advanceTimersByTime(500);
    expect(mockSave).toHaveBeenCalledTimes(1);
    p.dispose();
  });

  it('dispose() cancels pending work and no IPC fires after', () => {
    const p = createLayoutPersistence('hash1', '/test/project');
    p.saveNodes([{ id: 'c', position: { x: 0, y: 0 } }]);
    p.dispose();
    vi.advanceTimersByTime(1000);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });
});
