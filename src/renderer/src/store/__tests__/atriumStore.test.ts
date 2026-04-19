import { beforeEach, describe, expect, it } from 'vitest';
import { useAtriumStore } from '../atriumStore';
import type { ProjectState } from '@shared/domain';

// Minimal ProjectState fixture
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

// ---------------------------------------------------------------------------
// Project actions
// ---------------------------------------------------------------------------

describe('setProject', () => {
  it('replaces project and transitions canvas to ready', () => {
    const p = makeProject();
    useAtriumStore.getState().setProject(p);
    const s = useAtriumStore.getState();
    expect(s.project).toBe(p);
    expect(s.canvas).toEqual({ kind: 'ready' });
  });
});

describe('clearProject', () => {
  it('resets project / UI slices and transitions canvas to empty', () => {
    useAtriumStore.getState().setProject(makeProject());
    useAtriumStore.getState().selectNode('node-a');
    useAtriumStore.setState({ tooltipTarget: 'node-a', activePanel: 'selection' });
    useAtriumStore.getState().clearProject();
    const s = useAtriumStore.getState();
    expect(s.project).toBeNull();
    expect(s.selectedNodes.size).toBe(0);
    expect(s.tooltipTarget).toBeNull();
    expect(s.activePanel).toBe('project');
    expect(s.canvas).toEqual({ kind: 'empty' });
  });
});

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

describe('setCanvasError', () => {
  it('sets canvas to error with the given message', () => {
    useAtriumStore.getState().setCanvasError('oops');
    expect(useAtriumStore.getState().canvas).toEqual({ kind: 'error', message: 'oops' });
  });
});

describe('setCanvasLoading', () => {
  it('sets canvas to loading', () => {
    useAtriumStore.getState().setCanvasLoading();
    expect(useAtriumStore.getState().canvas).toEqual({ kind: 'loading' });
  });
});

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

describe('selectNode / deselectNode / clearSelection', () => {
  it('selectNode adds slug', () => {
    useAtriumStore.getState().selectNode('slug-a');
    expect(useAtriumStore.getState().selectedNodes.has('slug-a')).toBe(true);
  });

  it('deselectNode removes slug', () => {
    useAtriumStore.getState().selectNode('slug-a');
    useAtriumStore.getState().deselectNode('slug-a');
    expect(useAtriumStore.getState().selectedNodes.has('slug-a')).toBe(false);
  });

  it('clearSelection empties the set', () => {
    useAtriumStore.getState().selectNode('slug-a');
    useAtriumStore.getState().selectNode('slug-b');
    useAtriumStore.getState().clearSelection();
    expect(useAtriumStore.getState().selectedNodes.size).toBe(0);
  });

  it('deselectNode on non-existent slug is a no-op', () => {
    useAtriumStore.getState().deselectNode('ghost');
    expect(useAtriumStore.getState().selectedNodes.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toggleSelectedNode / setTooltipTarget
// ---------------------------------------------------------------------------

describe('toggleSelectedNode', () => {
  it('adds slug on first call and flips activePanel to selection', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    const s = useAtriumStore.getState();
    expect(s.selectedNodes.has('node-a')).toBe(true);
    expect(s.activePanel).toBe('selection');
  });

  it('removes slug on second call and flips activePanel back to project', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    useAtriumStore.getState().toggleSelectedNode('node-a');
    const s = useAtriumStore.getState();
    expect(s.selectedNodes.has('node-a')).toBe(false);
    expect(s.activePanel).toBe('project');
  });

  it('keeps activePanel as selection when other nodes remain after removal', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    useAtriumStore.getState().toggleSelectedNode('node-b');
    useAtriumStore.getState().toggleSelectedNode('node-a');
    const s = useAtriumStore.getState();
    expect(s.selectedNodes.has('node-b')).toBe(true);
    expect(s.activePanel).toBe('selection');
  });

  it('stays consistent across 10 rapid toggles (even = removed, odd = added)', () => {
    for (let i = 0; i < 10; i++) {
      useAtriumStore.getState().toggleSelectedNode('node-a');
    }
    expect(useAtriumStore.getState().selectedNodes.has('node-a')).toBe(false);
    expect(useAtriumStore.getState().activePanel).toBe('project');
  });
});

describe('setTooltipTarget', () => {
  it('sets target on first call', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    expect(useAtriumStore.getState().tooltipTarget).toBe('node-a');
  });

  it('toggles to null when called with the same slug', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    useAtriumStore.getState().setTooltipTarget('node-a');
    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
  });

  it('replaces target when called with a different slug', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    useAtriumStore.getState().setTooltipTarget('node-b');
    expect(useAtriumStore.getState().tooltipTarget).toBe('node-b');
  });

  it('accepts null directly to clear target', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    useAtriumStore.getState().setTooltipTarget(null);
    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
  });
});

describe('clearSelection', () => {
  it('resets activePanel to project', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    expect(useAtriumStore.getState().activePanel).toBe('selection');
    useAtriumStore.getState().clearSelection();
    expect(useAtriumStore.getState().activePanel).toBe('project');
    expect(useAtriumStore.getState().selectedNodes.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Terminal state machine
// ---------------------------------------------------------------------------

describe('setTerminal — legal transitions', () => {
  const legalCases: [string, string][] = [
    ['idle', 'spawning'],
    ['spawning', 'active'],
    ['spawning', 'exited'],
    ['active', 'exited'],
    ['exited', 'closing'],
    ['closing', 'idle'],
  ];

  for (const [from, to] of legalCases) {
    it(`${from} → ${to} is allowed`, () => {
      useAtriumStore.setState({ terminal: { id: null, status: from as never, fullscreen: false } });
      const result = useAtriumStore.getState().setTerminal({ status: to as never });
      expect(result.ok).toBe(true);
      expect(useAtriumStore.getState().terminal.status).toBe(to);
    });
  }
});

describe('setTerminal — illegal transitions', () => {
  const illegalCases: [string, string][] = [
    ['idle', 'active'],
    ['idle', 'exited'],
    ['idle', 'closing'],
    ['idle', 'idle'],
    ['spawning', 'idle'],
    ['spawning', 'closing'],
    ['active', 'idle'],
    ['active', 'spawning'],
    ['active', 'closing'],
    ['exited', 'idle'],
    ['exited', 'spawning'],
    ['exited', 'active'],
    ['closing', 'spawning'],
    ['closing', 'active'],
    ['closing', 'exited'],
  ];

  for (const [from, to] of illegalCases) {
    it(`${from} → ${to} is rejected`, () => {
      useAtriumStore.setState({ terminal: { id: null, status: from as never, fullscreen: false } });
      const result = useAtriumStore.getState().setTerminal({ status: to as never });
      expect(result.ok).toBe(false);
      // State must not change
      expect(useAtriumStore.getState().terminal.status).toBe(from);
    });
  }
});
