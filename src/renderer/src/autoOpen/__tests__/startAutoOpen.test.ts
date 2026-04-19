import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectState } from '@shared/domain';
import { useAtriumStore } from '../../store/atriumStore';
import { resetAutoOpenForTests, startAutoOpen } from '../startAutoOpen';

const makeProject = (name = 'test-project'): ProjectState => ({
  rootPath: '/tmp/proj',
  projectName: name,
  projectHash: 'abc123',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
});

const makeRecent = (path: string) => ({
  path,
  name: path,
  lastOpened: new Date().toISOString(),
});

let mockGetRecents: ReturnType<typeof vi.fn>;
let mockOpen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetAutoOpenForTests();
  useAtriumStore.setState({
    project: null,
    selectedNodes: new Set(),
    tooltipTarget: null,
    activePanel: 'project',
    terminal: { id: null, status: 'idle', fullscreen: false },
    canvas: { kind: 'empty' },
  });
  mockGetRecents = vi.fn();
  mockOpen = vi.fn();
  vi.stubGlobal('atrium', {
    project: {
      getRecents: mockGetRecents,
      open: mockOpen,
    },
  });
});

describe('startAutoOpen', () => {
  it('(a) first recent succeeds — setProject called, canvas ready', async () => {
    const project = makeProject('proj-a');
    mockGetRecents.mockResolvedValue({ ok: true, data: [makeRecent('/path/a')] });
    mockOpen.mockResolvedValue({ ok: true, data: project });

    await startAutoOpen();

    expect(useAtriumStore.getState().project).toEqual(project);
    expect(useAtriumStore.getState().canvas).toEqual({ kind: 'ready' });
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('(b) first recent fails, second succeeds — setProject called with second data', async () => {
    const project = makeProject('proj-b');
    mockGetRecents.mockResolvedValue({
      ok: true,
      data: [makeRecent('/path/bad'), makeRecent('/path/good')],
    });
    mockOpen
      .mockResolvedValueOnce({ ok: false, error: { code: 'PATH_NOT_FOUND' as const, message: 'not found' } })
      .mockResolvedValueOnce({ ok: true, data: project });

    await startAutoOpen();

    expect(useAtriumStore.getState().project).toEqual(project);
    expect(useAtriumStore.getState().canvas).toEqual({ kind: 'ready' });
    expect(mockOpen).toHaveBeenCalledTimes(2);
  });

  it('(c) all recents fail — canvas error', async () => {
    mockGetRecents.mockResolvedValue({
      ok: true,
      data: [makeRecent('/path/a'), makeRecent('/path/b')],
    });
    mockOpen.mockResolvedValue({
      ok: false,
      error: { code: 'PATH_NOT_FOUND' as const, message: 'not found' },
    });

    await startAutoOpen();

    expect(useAtriumStore.getState().project).toBeNull();
    expect(useAtriumStore.getState().canvas).toEqual({
      kind: 'error',
      message: 'Could not open any recent project.',
    });
  });

  it('(d) empty recents — canvas empty', async () => {
    mockGetRecents.mockResolvedValue({ ok: true, data: [] });

    await startAutoOpen();

    expect(useAtriumStore.getState().project).toBeNull();
    expect(useAtriumStore.getState().canvas).toEqual({ kind: 'empty' });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('StrictMode idempotency — double call results in one getRecents call', async () => {
    mockGetRecents.mockResolvedValue({ ok: true, data: [] });

    // Simulate React StrictMode double-invoke (synchronous)
    const p1 = startAutoOpen();
    const p2 = startAutoOpen();
    await Promise.all([p1, p2]);

    expect(mockGetRecents).toHaveBeenCalledTimes(1);
  });
});
