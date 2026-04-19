import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useAtriumStore } from '../atriumStore';
import type { ProjectState } from '@shared/domain';
import type { Result } from '@shared/result';

const makeProject = (): ProjectState => ({
  rootPath: '/tmp/proj',
  projectName: 'test',
  projectHash: 'abc123',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
});

function makeSwitchSpy(result: Result<ProjectState, string>): Mock {
  const spy = vi.fn().mockResolvedValue(result);
  vi.stubGlobal('atrium', { project: { switch: spy } });
  return spy;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useAtriumStore.setState({
    project: null,
    selectedNodes: new Set(),
    tooltipTarget: null,
    activePanel: 'project',
    terminal: { id: null, status: 'idle', fullscreen: false },
    canvas: { kind: 'empty' },
  });
});

// ---------------------------------------------------------------------------
// Guard — whitelist pass
// ---------------------------------------------------------------------------

describe('switchProject — guard passes (idle)', () => {
  it('calls IPC when terminal is idle', async () => {
    const spy = makeSwitchSpy({ ok: true, data: makeProject() });
    await useAtriumStore.getState().switchProject('/path/to/proj');
    expect(spy.mock.calls[0]).toEqual(['/path/to/proj']);
  });
});

describe('switchProject — guard passes (exited)', () => {
  it('calls IPC when terminal is exited', async () => {
    useAtriumStore.setState({ terminal: { id: null, status: 'exited', fullscreen: false } });
    const spy = makeSwitchSpy({ ok: true, data: makeProject() });
    await useAtriumStore.getState().switchProject('/path/to/proj');
    expect(spy.mock.calls[0]).toEqual(['/path/to/proj']);
  });
});

// ---------------------------------------------------------------------------
// Guard — whitelist block
// ---------------------------------------------------------------------------

const blockedStatuses = ['spawning', 'active', 'closing'] as const;

for (const status of blockedStatuses) {
  describe(`switchProject — guard blocks (${status})`, () => {
    it(`does NOT call IPC and returns err when terminal is ${status}`, async () => {
      useAtriumStore.setState({ terminal: { id: null, status, fullscreen: false } });
      const mockSwitch = vi.fn();
      vi.stubGlobal('atrium', { project: { switch: mockSwitch } });

      const result = await useAtriumStore.getState().switchProject('/path');
      expect(result.ok).toBe(false);
      expect(mockSwitch).not.toHaveBeenCalled();
      if (!result.ok) {
        expect(result.error.code).toBe('BLOCKED_BY_TERMINAL');
        expect(result.error.message).toContain(status);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Hypothetical 6th status — positive-whitelist safety property
// ---------------------------------------------------------------------------

describe('switchProject — hypothetical 6th status is blocked', () => {
  it('rejects any status not in the positive whitelist', async () => {
    // Inject a fake status that does not exist in the type
    useAtriumStore.setState({ terminal: { id: null, status: 'paused' as never, fullscreen: false } });
    const mockSwitch = vi.fn();
    vi.stubGlobal('atrium', { project: { switch: mockSwitch } });

    const result = await useAtriumStore.getState().switchProject('/path');
    expect(result.ok).toBe(false);
    expect(mockSwitch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Auto-dismiss: exited → closing → idle BEFORE IPC fires
// ---------------------------------------------------------------------------

describe('switchProject — auto-dismiss ordering', () => {
  it('drives exited → closing → idle before IPC switch promise resolves', async () => {
    useAtriumStore.setState({ terminal: { id: null, status: 'exited', fullscreen: false } });

    const statusLog: string[] = [];
    let ipcCalled = false;

    // Subscribe to all terminal status changes
    const unsub = useAtriumStore.subscribe((state) => {
      statusLog.push(state.terminal.status);
    });

    // IPC resolves after the auto-dismiss completes (microtask)
    const mockSwitch = vi.fn().mockImplementation(() => {
      ipcCalled = true;
      // Capture what statuses have been recorded BEFORE this resolves
      return Promise.resolve({ ok: true, data: makeProject() });
    });
    vi.stubGlobal('atrium', { project: { switch: mockSwitch } });

    // Record statuses before IPC fires using a wrapper
    const originalSwitch = mockSwitch as (...args: unknown[]) => Promise<unknown>;
    let statusBeforeIpc: string[] = [];
    vi.stubGlobal('atrium', {
      project: {
        switch: vi.fn().mockImplementation((...args: unknown[]) => {
          // At this point auto-dismiss should already be done
          statusBeforeIpc = [...statusLog];
          return originalSwitch(...args);
        }),
      },
    });

    await useAtriumStore.getState().switchProject('/path/to/proj');
    unsub();

    // The sequence exited → closing → idle should appear in statusBeforeIpc
    // (auto-dismiss fires two synchronous set() calls before the await)
    const closingIdx = statusBeforeIpc.indexOf('closing');
    const idleIdx = statusBeforeIpc.indexOf('idle');
    expect(closingIdx).toBeGreaterThanOrEqual(0);
    expect(idleIdx).toBeGreaterThan(closingIdx);
    expect(ipcCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('switchProject — success', () => {
  it('sets project, clears selection, resets terminal, sets canvas ready', async () => {
    useAtriumStore.setState({
      selectedNodes: new Set(['slug-a']),
      tooltipTarget: 'slug-a',
      activePanel: 'selection',
    });
    const p = makeProject();
    makeSwitchSpy({ ok: true, data: p });

    await useAtriumStore.getState().switchProject('/path/to/proj');

    const s = useAtriumStore.getState();
    expect(s.project).toBe(p);
    expect(s.selectedNodes.size).toBe(0);
    expect(s.tooltipTarget).toBeNull();
    expect(s.activePanel).toBe('project');
    expect(s.terminal.status).toBe('idle');
    expect(s.canvas).toEqual({ kind: 'ready' });
  });
});

// ---------------------------------------------------------------------------
// Failure path
// ---------------------------------------------------------------------------

describe('switchProject — failure', () => {
  it('sets canvas to error, does not mutate other slices', async () => {
    const p = makeProject();
    useAtriumStore.setState({
      project: p,
      selectedNodes: new Set(['slug-a']),
      tooltipTarget: 'slug-a',
    });
    makeSwitchSpy({ ok: false, error: { code: 'IO_ERROR', message: 'disk full' } });

    await useAtriumStore.getState().switchProject('/path/to/proj');

    const s = useAtriumStore.getState();
    expect(s.canvas).toEqual({ kind: 'error', message: 'disk full' });
    // Other slices untouched
    expect(s.project).toBe(p);
    expect(s.selectedNodes.has('slug-a')).toBe(true);
    expect(s.tooltipTarget).toBe('slug-a');
  });
});
