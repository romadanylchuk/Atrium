import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '../../store/atriumStore';
import { Canvas } from '../Canvas';

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
});
