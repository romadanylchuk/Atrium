import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '../../store/atriumStore';
import { Canvas } from '../Canvas';
import type { ProjectState } from '@shared/domain';

function makeProject(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    rootPath: '/tmp/proj',
    projectName: 'Test',
    projectHash: 'h1',
    context: { description: '', sections: {} },
    nodes: [],
    connections: [],
    sessions: [],
    warnings: [],
    ...overrides,
  };
}

// Mock window.atrium.layout
vi.stubGlobal('atrium', {
  layout: {
    load: vi.fn().mockResolvedValue({ ok: true, data: null }),
    save: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    saveSnapshot: vi.fn(),
  },
  fileSync: {
    onChanged: vi.fn().mockReturnValue(() => {}),
  },
  project: {
    getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    open: vi.fn(),
  },
});

describe('Canvas', () => {
  beforeEach(() => {
    // Reset store to empty state
    useAtriumStore.setState({
      canvas: { kind: 'empty' },
      project: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders CanvasEmptyState when canvas.kind === empty', () => {
    render(<Canvas />);
    expect(screen.getByText('No project open')).toBeTruthy();
  });

  it('renders CanvasErrorState when canvas.kind === error', () => {
    useAtriumStore.setState({ canvas: { kind: 'error', message: 'Something went wrong' } });
    render(<Canvas />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Clear and start fresh')).toBeTruthy();
  });

  it('clicking Clear and start fresh transitions store to empty', () => {
    useAtriumStore.setState({ canvas: { kind: 'error', message: 'x' } });
    render(<Canvas />);
    fireEvent.click(screen.getByText('Clear and start fresh'));
    expect(useAtriumStore.getState().canvas.kind).toBe('empty');
  });

  it('does not render overlays when canvas.kind === ready', () => {
    useAtriumStore.setState({ canvas: { kind: 'ready' } });
    render(<Canvas />);
    expect(screen.queryByText('No project open')).toBeNull();
    expect(screen.queryByText('Clear and start fresh')).toBeNull();
  });

  it('does not render overlays when canvas.kind === loading', () => {
    useAtriumStore.setState({ canvas: { kind: 'loading' } });
    render(<Canvas />);
    expect(screen.queryByText('No project open')).toBeNull();
    expect(screen.queryByText('Clear and start fresh')).toBeNull();
  });

  it('pane click clears selection and tooltip target', () => {
    useAtriumStore.setState({
      selectedNodes: new Set(['node-a']),
      tooltipTarget: 'node-a',
      activePanel: 'selection',
    });
    render(<Canvas />);
    // Simulate pane click via the ReactFlow wrapper div
    const pane = document.querySelector('.react-flow__pane');
    if (pane) {
      act(() => { fireEvent.click(pane); });
    }
    const s = useAtriumStore.getState();
    expect(s.selectedNodes.size).toBe(0);
    expect(s.tooltipTarget).toBeNull();
    expect(s.activePanel).toBe('project');
  });

  it('pane context-menu prevents default and clears selection', () => {
    useAtriumStore.setState({
      selectedNodes: new Set(['node-a']),
      activePanel: 'selection',
    });
    render(<Canvas />);
    const pane = document.querySelector('.react-flow__pane');
    if (pane) {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      act(() => { pane.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(true);
    }
    expect(useAtriumStore.getState().selectedNodes.size).toBe(0);
    expect(useAtriumStore.getState().activePanel).toBe('project');
  });

  it('Legend is not rendered when project has no nodes or connections', () => {
    useAtriumStore.setState({
      canvas: { kind: 'ready' },
      project: makeProject({ nodes: [], connections: [] }),
    });
    render(<Canvas />);
    expect(screen.queryByTestId('canvas-legend')).toBeNull();
  });

  it('Legend is not rendered when project is null', () => {
    useAtriumStore.setState({ canvas: { kind: 'empty' }, project: null });
    render(<Canvas />);
    expect(screen.queryByTestId('canvas-legend')).toBeNull();
  });

  it('CanvasControls renders four buttons with expected testids', () => {
    useAtriumStore.setState({ canvas: { kind: 'ready' } });
    render(<Canvas />);
    expect(screen.getByTestId('canvas-ctrl-zoom-in')).toBeTruthy();
    expect(screen.getByTestId('canvas-ctrl-zoom-out')).toBeTruthy();
    expect(screen.getByTestId('canvas-ctrl-fit')).toBeTruthy();
    expect(screen.getByTestId('canvas-ctrl-relayout')).toBeTruthy();
  });

  it('clicking canvas-ctrl-relayout increments relayoutRequestId', () => {
    useAtriumStore.setState({ canvas: { kind: 'ready' }, relayoutRequestId: 0 });
    render(<Canvas />);
    const before = useAtriumStore.getState().relayoutRequestId;
    fireEvent.click(screen.getByTestId('canvas-ctrl-relayout'));
    const after = useAtriumStore.getState().relayoutRequestId;
    expect(after).toBe(before + 1);
  });

  it('React Flow Background is rendered', () => {
    useAtriumStore.setState({ canvas: { kind: 'ready' } });
    render(<Canvas />);
    const bg = document.querySelector('.react-flow__background');
    expect(bg).toBeTruthy();
  });

  it('Legend is rendered when project has nodes', () => {
    useAtriumStore.setState({
      canvas: { kind: 'ready' },
      project: makeProject({
        nodes: [
          { slug: 'a', name: 'A', maturity: 'decided', priority: 'core', file: 'ideas/a.md', summary: '', description: '', sections: {} },
        ],
        connections: [
          { from: 'a', to: 'b', type: 'dependency' },
          { from: 'b', to: 'c', type: 'shared-concern' },
          { from: 'c', to: 'd', type: 'non-dependency' },
          { from: 'd', to: 'e', type: 'open-question' },
        ],
      }),
    });
    render(<Canvas />);
    const legend = screen.getByTestId('canvas-legend');
    expect(legend).toBeTruthy();
    expect(legend.textContent).toContain('dependency');
    expect(legend.textContent).toContain('shared-concern');
    expect(legend.textContent).toContain('non-dependency');
    expect(legend.textContent).toContain('open-question');
    // Canonical ordering within this test's 4 types (coupled-decision, non-contribution absent)
    const text = legend.textContent ?? '';
    expect(text.indexOf('dependency')).toBeLessThan(text.indexOf('shared-concern'));
    expect(text.indexOf('shared-concern')).toBeLessThan(text.indexOf('non-dependency'));
    expect(text.indexOf('non-dependency')).toBeLessThan(text.indexOf('open-question'));
  });
});
