import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectState } from '@shared/domain';
import { useAtriumStore } from '../../store/atriumStore';
import { registerRendererListeners } from '../registerListeners';

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

beforeEach(() => {
  useAtriumStore.setState({
    project: null,
    selectedNodes: new Set(),
    tooltipTarget: null,
    activePanel: 'project',
    terminal: { id: null, status: 'idle', fullscreen: false },
    canvas: { kind: 'empty' },
  });
});

describe('registerRendererListeners', () => {
  it('routes fileSync.onChanged to store.setProject', () => {
    let capturedCb: ((state: ProjectState) => void) | undefined;
    const mockDisposer = vi.fn();

    vi.stubGlobal('atrium', {
      fileSync: {
        onChanged: vi.fn((cb: (state: ProjectState) => void) => {
          capturedCb = cb;
          return mockDisposer;
        }),
      },
    });

    registerRendererListeners(useAtriumStore);

    const project = makeProject('synced');
    capturedCb!(project);

    expect(useAtriumStore.getState().project).toEqual(project);
  });

  it('disposer stops further updates', () => {
    let capturedCb: ((state: ProjectState) => void) | undefined;
    let listenerActive = true;

    vi.stubGlobal('atrium', {
      fileSync: {
        onChanged: vi.fn((cb: (state: ProjectState) => void) => {
          capturedCb = cb;
          // disposer marks the listener inactive, mirroring real preload behavior
          return () => { listenerActive = false; };
        }),
      },
    });

    const dispose = registerRendererListeners(useAtriumStore);

    // First push updates the store
    const project1 = makeProject('first');
    capturedCb!(project1);
    expect(useAtriumStore.getState().project).toEqual(project1);

    // Dispose — marks listener inactive
    dispose();
    expect(listenerActive).toBe(false);

    // Second push after disposal: preload would gate on listenerActive; simulate that here
    const project2 = makeProject('second');
    if (listenerActive) capturedCb!(project2);

    // Store must remain unchanged from the first push
    expect(useAtriumStore.getState().project).toEqual(project1);
  });
});
