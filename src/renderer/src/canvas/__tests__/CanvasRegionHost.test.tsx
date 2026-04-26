import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import type { TerminalId } from '@shared/domain';
import type { ProjectState } from '@shared/domain';

vi.mock('@renderer/terminal/TerminalModal', () => ({
  TerminalModal: () => <div data-testid="terminal-modal" />,
}));

vi.mock('@renderer/toolbar/DetachedResultPopup', () => ({
  DetachedResultPopup: ({
    testid,
    output,
    onClose,
  }: {
    testid: string;
    output: string;
    onClose: () => void;
  }) => (
    <div data-testid={testid}>
      <span data-testid={`${testid}-output`}>{output}</span>
      <button data-testid={`${testid}-close`} type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('@renderer/toolbar/StatusPanel', () => ({
  StatusPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="status-panel">
      <button data-testid="status-panel-close" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('@renderer/toolbar/FinalizePanel', () => ({
  FinalizePanel: ({
    canContinue,
    onContinue,
    onClose,
  }: {
    canContinue: boolean;
    onContinue: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="finalize-panel">
      <button
        data-testid="finalize-panel-continue"
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
      >
        Continue
      </button>
      <button data-testid="finalize-panel-close" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

import { CanvasRegionHost } from '../CanvasRegionHost';

const spawnMock = vi.fn();

const fakeProject: ProjectState = {
  rootPath: '/proj',
  projectName: 'My Project',
  projectHash: 'h1',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
};

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockResolvedValue({ ok: true, data: 'term-1' as TerminalId });
  vi.stubGlobal('atrium', {
    skill: { spawn: spawnMock },
    terminal: { close: vi.fn().mockResolvedValue({ ok: true, data: undefined }) },
  });
  act(() => {
    useAtriumStore.setState({
      terminal: { id: null, status: 'idle', fullscreen: false },
      toolbarOverlay: null,
      project: fakeProject,
      selectedNodes: new Set(),
      detachedRuns: { audit: { kind: 'idle' }, status: { kind: 'idle' } },
    });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CanvasRegionHost', () => {
  it('renders nothing visible when terminal idle and overlay null', () => {
    render(<CanvasRegionHost />);
    expect(screen.queryByTestId('terminal-modal')).toBeNull();
    expect(screen.queryByTestId('status-panel')).toBeNull();
    expect(screen.queryByTestId('finalize-panel')).toBeNull();
  });

  it('renders TerminalModal when terminal is spawning', () => {
    act(() => {
      useAtriumStore.setState({
        terminal: { id: 'tid' as TerminalId, status: 'spawning', fullscreen: false },
      });
    });
    render(<CanvasRegionHost />);
    expect(screen.getByTestId('terminal-modal')).toBeDefined();
  });

  it('renders TerminalModal when terminal is active', () => {
    act(() => {
      useAtriumStore.setState({
        terminal: { id: 'tid' as TerminalId, status: 'active', fullscreen: false },
      });
    });
    render(<CanvasRegionHost />);
    expect(screen.getByTestId('terminal-modal')).toBeDefined();
  });

  it('renders TerminalModal when terminal is exited', () => {
    act(() => {
      useAtriumStore.setState({
        terminal: { id: 'tid' as TerminalId, status: 'exited', fullscreen: false },
      });
    });
    render(<CanvasRegionHost />);
    expect(screen.getByTestId('terminal-modal')).toBeDefined();
  });

  it('does not render TerminalModal when terminal is idle', () => {
    render(<CanvasRegionHost />);
    expect(screen.queryByTestId('terminal-modal')).toBeNull();
  });

  it('renders StatusPanel when toolbarOverlay is status', () => {
    act(() => {
      useAtriumStore.setState({ toolbarOverlay: 'status' });
    });
    render(
      <div data-region="canvas">
        <CanvasRegionHost />
      </div>,
    );
    const panel = screen.getByTestId('status-panel');
    expect(panel).toBeDefined();
    expect(panel.closest('[data-region="canvas"]')).toBeTruthy();
  });

  it('does not render StatusPanel when project is null', () => {
    act(() => {
      useAtriumStore.setState({ toolbarOverlay: 'status', project: null });
    });
    render(<CanvasRegionHost />);
    expect(screen.queryByTestId('status-panel')).toBeNull();
  });

  it('closing StatusPanel sets toolbarOverlay to null', () => {
    act(() => {
      useAtriumStore.setState({ toolbarOverlay: 'status' });
    });
    render(<CanvasRegionHost />);
    fireEvent.click(screen.getByTestId('status-panel-close'));
    expect(useAtriumStore.getState().toolbarOverlay).toBeNull();
  });

  it('renders FinalizePanel when toolbarOverlay is finalize', () => {
    act(() => {
      useAtriumStore.setState({ toolbarOverlay: 'finalize' });
    });
    render(
      <div data-region="canvas">
        <CanvasRegionHost />
      </div>,
    );
    const panel = screen.getByTestId('finalize-panel');
    expect(panel).toBeDefined();
    expect(panel.closest('[data-region="canvas"]')).toBeTruthy();
  });

  it('FinalizePanel Continue is disabled when terminal is active', () => {
    act(() => {
      useAtriumStore.setState({
        toolbarOverlay: 'finalize',
        terminal: { id: 'tid' as TerminalId, status: 'active', fullscreen: false },
      });
    });
    render(<CanvasRegionHost />);
    expect(screen.getByTestId('finalize-panel-continue').getAttribute('disabled')).not.toBeNull();
  });

  it('FinalizePanel Continue is enabled when terminal is idle', () => {
    act(() => {
      useAtriumStore.setState({ toolbarOverlay: 'finalize' });
    });
    render(<CanvasRegionHost />);
    expect(screen.getByTestId('finalize-panel-continue').getAttribute('disabled')).toBeNull();
  });

  it('FinalizePanel Continue calls spawn and closes overlay', async () => {
    act(() => {
      useAtriumStore.setState({ toolbarOverlay: 'finalize' });
    });
    render(<CanvasRegionHost />);
    fireEvent.click(screen.getByTestId('finalize-panel-continue'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock).toHaveBeenCalledWith(
      expect.objectContaining({ skill: 'finalize', cwd: '/proj' }),
    );
    expect(useAtriumStore.getState().toolbarOverlay).toBeNull();
  });

  it('closing FinalizePanel sets toolbarOverlay to null', () => {
    act(() => {
      useAtriumStore.setState({ toolbarOverlay: 'finalize' });
    });
    render(<CanvasRegionHost />);
    fireEvent.click(screen.getByTestId('finalize-panel-close'));
    expect(useAtriumStore.getState().toolbarOverlay).toBeNull();
  });

  it('TerminalModal is inside data-region canvas when rendered within it', () => {
    act(() => {
      useAtriumStore.setState({
        terminal: { id: 'tid' as TerminalId, status: 'spawning', fullscreen: false },
      });
    });
    render(
      <div data-region="canvas">
        <CanvasRegionHost />
      </div>,
    );
    const modal = screen.getByTestId('terminal-modal');
    expect(modal.closest('[data-region="canvas"]')).toBeTruthy();
  });

  it('renders audit-result-popup with output when audit run is done', () => {
    act(() => {
      useAtriumStore.setState({
        detachedRuns: {
          audit: { kind: 'done', output: 'hello audit', finishedAt: 0 },
          status: { kind: 'idle' },
        },
      });
    });
    render(
      <div data-region="canvas">
        <CanvasRegionHost />
      </div>,
    );
    const popup = screen.getByTestId('audit-result-popup');
    expect(popup).toBeDefined();
    expect(popup.closest('[data-region="canvas"]')).toBeTruthy();
    expect(screen.getByTestId('audit-result-popup-output').textContent).toBe('hello audit');
  });

  it('renders status-result-popup with output when status run is done', () => {
    act(() => {
      useAtriumStore.setState({
        detachedRuns: {
          audit: { kind: 'idle' },
          status: { kind: 'done', output: 'hello status', finishedAt: 0 },
        },
      });
    });
    render(
      <div data-region="canvas">
        <CanvasRegionHost />
      </div>,
    );
    const popup = screen.getByTestId('status-result-popup');
    expect(popup).toBeDefined();
    expect(popup.closest('[data-region="canvas"]')).toBeTruthy();
    expect(screen.getByTestId('status-result-popup-output').textContent).toBe('hello status');
  });

  it('renders both audit and status popups when both runs are done', () => {
    act(() => {
      useAtriumStore.setState({
        detachedRuns: {
          audit: { kind: 'done', output: 'audit out', finishedAt: 0 },
          status: { kind: 'done', output: 'status out', finishedAt: 0 },
        },
      });
    });
    render(<CanvasRegionHost />);
    expect(screen.getByTestId('audit-result-popup')).toBeDefined();
    expect(screen.getByTestId('status-result-popup')).toBeDefined();
  });

  it('closing audit popup transitions audit slice to idle', () => {
    act(() => {
      useAtriumStore.setState({
        detachedRuns: {
          audit: { kind: 'done', output: 'out', finishedAt: 0 },
          status: { kind: 'idle' },
        },
      });
    });
    render(<CanvasRegionHost />);
    fireEvent.click(screen.getByTestId('audit-result-popup-close'));
    expect(useAtriumStore.getState().detachedRuns.audit.kind).toBe('idle');
  });

  it('closing status popup transitions status slice to idle', () => {
    act(() => {
      useAtriumStore.setState({
        detachedRuns: {
          audit: { kind: 'idle' },
          status: { kind: 'done', output: 'out', finishedAt: 0 },
        },
      });
    });
    render(<CanvasRegionHost />);
    fireEvent.click(screen.getByTestId('status-result-popup-close'));
    expect(useAtriumStore.getState().detachedRuns.status.kind).toBe('idle');
  });

  it('does not render audit popup when audit run is idle', () => {
    render(<CanvasRegionHost />);
    expect(screen.queryByTestId('audit-result-popup')).toBeNull();
  });

  it('does not render status popup when status run is idle', () => {
    render(<CanvasRegionHost />);
    expect(screen.queryByTestId('status-result-popup')).toBeNull();
  });
});
