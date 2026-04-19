import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '../../store/atriumStore';
import type { TerminalId } from '@shared/domain';

// ---------------------------------------------------------------------------
// Mock xterm — real xterm requires canvas and crashes in jsdom
// ---------------------------------------------------------------------------

const xtermWriteMock = vi.fn();
const xtermOnDataMock = vi.fn().mockReturnValue({ dispose: vi.fn() });
const xtermOpenMock = vi.fn();
const xtermDisposeMock = vi.fn();
const fitMock = vi.fn();

vi.mock('xterm', () => {
  class Terminal {
    cols = 80;
    rows = 24;
    write = xtermWriteMock;
    onData = xtermOnDataMock;
    open = xtermOpenMock;
    dispose = xtermDisposeMock;
    loadAddon = vi.fn();
  }
  return { Terminal };
});

vi.mock('xterm-addon-fit', () => {
  class FitAddon {
    fit = fitMock;
  }
  return { FitAddon };
});

vi.mock('xterm/css/xterm.css', () => ({}));

// ---------------------------------------------------------------------------
// window.atrium stub
// ---------------------------------------------------------------------------

const onDataCbs: Map<TerminalId, (data: ArrayBuffer) => void> = new Map();
const onExitCbs: Map<TerminalId, (code: number | null) => void> = new Map();
const onErrorCbs: Map<TerminalId, (err: { code: string; message: string }) => void> = new Map();

const killMock = vi.fn().mockResolvedValue({ ok: true, data: undefined });
const writeMock = vi.fn();
const resizeMock = vi.fn();
const projectOpenMock = vi.fn();

const makeAtrium = () => ({
  terminal: {
    onData: vi.fn((id: TerminalId, cb: (data: ArrayBuffer) => void) => {
      onDataCbs.set(id, cb);
      return () => onDataCbs.delete(id);
    }),
    onExit: vi.fn((id: TerminalId, cb: (code: number | null) => void) => {
      onExitCbs.set(id, cb);
      return () => onExitCbs.delete(id);
    }),
    onError: vi.fn((id: TerminalId, cb: (e: { code: string; message: string }) => void) => {
      onErrorCbs.set(id, cb);
      return () => onErrorCbs.delete(id);
    }),
    kill: killMock,
    write: writeMock,
    resize: resizeMock,
  },
  project: {
    open: projectOpenMock,
  },
});

// ---------------------------------------------------------------------------
// Import after mocks (vi.mock is hoisted by vitest so static import is fine)
// ---------------------------------------------------------------------------

import { TerminalModal } from '../TerminalModal';

const TERM_ID = 'term-abc' as TerminalId;

function resetStore() {
  useAtriumStore.setState({
    terminal: { id: null, status: 'idle', fullscreen: false },
    pendingInit: null,
    project: null,
  });
  onDataCbs.clear();
  onExitCbs.clear();
  onErrorCbs.clear();
  xtermWriteMock.mockClear();
  xtermOpenMock.mockClear();
  xtermDisposeMock.mockClear();
  fitMock.mockClear();
  killMock.mockClear();
  writeMock.mockClear();
  resizeMock.mockClear();
  projectOpenMock.mockClear();
}

describe('TerminalModal', () => {
  beforeEach(() => {
    vi.stubGlobal('atrium', makeAtrium());
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Mount / unmount
  // -------------------------------------------------------------------------

  it('renders nothing when status is idle', () => {
    render(<TerminalModal />);
    expect(screen.queryByTestId('terminal-modal')).toBeNull();
  });

  it('mounts modal when status is spawning', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'spawning', fullscreen: false } });
    });
    render(<TerminalModal />);
    expect(screen.getByTestId('terminal-modal')).toBeTruthy();
  });

  it('unmounts modal when status transitions back to idle', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'spawning', fullscreen: false } });
    });
    const { rerender } = render(<TerminalModal />);
    expect(screen.getByTestId('terminal-modal')).toBeTruthy();

    act(() => {
      useAtriumStore.setState({ terminal: { id: null, status: 'idle', fullscreen: false } });
    });
    rerender(<TerminalModal />);
    expect(screen.queryByTestId('terminal-modal')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // onData → spawning→active transition
  // -------------------------------------------------------------------------

  it('transitions spawning→active on first onData', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'spawning', fullscreen: false } });
    });
    render(<TerminalModal />);

    act(() => {
      const cb = onDataCbs.get(TERM_ID);
      cb?.(new ArrayBuffer(4));
    });

    expect(useAtriumStore.getState().terminal.status).toBe('active');
  });

  it('does not double-fire active transition on second onData', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'spawning', fullscreen: false } });
    });
    render(<TerminalModal />);

    act(() => {
      const cb = onDataCbs.get(TERM_ID);
      cb?.(new ArrayBuffer(4));
      cb?.(new ArrayBuffer(4));
    });

    expect(useAtriumStore.getState().terminal.status).toBe('active');
  });

  // -------------------------------------------------------------------------
  // onExit — writes exit line, transitions to exited
  // -------------------------------------------------------------------------

  it('writes exit message and transitions to exited on onExit', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
    });
    render(<TerminalModal />);

    act(() => {
      onExitCbs.get(TERM_ID)?.(0);
    });

    expect(xtermWriteMock).toHaveBeenCalledWith(expect.stringContaining('process exited with code 0'));
    expect(useAtriumStore.getState().terminal.status).toBe('exited');
  });

  // -------------------------------------------------------------------------
  // onError — writes error line, transitions to exited
  // -------------------------------------------------------------------------

  it('writes error message and transitions to exited on onError', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
    });
    render(<TerminalModal />);

    act(() => {
      onErrorCbs.get(TERM_ID)?.({ code: 'SPAWN_FAILED', message: 'pty died' });
    });

    expect(xtermWriteMock).toHaveBeenCalledWith(expect.stringContaining('pty died'));
    expect(useAtriumStore.getState().terminal.status).toBe('exited');
  });

  // -------------------------------------------------------------------------
  // Kill button
  // -------------------------------------------------------------------------

  it('shows Kill button when status is active', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
    });
    render(<TerminalModal />);
    expect(screen.getByLabelText('Kill terminal')).toBeTruthy();
  });

  it('does not show Kill button when status is exited', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });
    });
    render(<TerminalModal />);
    expect(screen.queryByLabelText('Kill terminal')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Close button
  // -------------------------------------------------------------------------

  it('shows Close button when status is exited', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });
    });
    render(<TerminalModal />);
    expect(screen.getByLabelText('Close terminal')).toBeTruthy();
  });

  it('Close button triggers _autoDismissExited → idle', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });
    });
    render(<TerminalModal />);
    act(() => {
      screen.getByLabelText('Close terminal').click();
    });
    expect(useAtriumStore.getState().terminal.status).toBe('idle');
  });

  // -------------------------------------------------------------------------
  // Init-flow: success path
  // -------------------------------------------------------------------------

  it('calls project.open after exit when pendingInit is set, sets project on success', async () => {
    const fakeProject = {
      rootPath: '/proj',
      projectName: 'P',
      projectHash: 'h1',
      context: { description: '', sections: {} },
      nodes: [],
      connections: [],
      sessions: [],
      warnings: [],
    };
    projectOpenMock.mockResolvedValue({ ok: true, data: fakeProject });

    act(() => {
      useAtriumStore.setState({
        terminal: { id: TERM_ID, status: 'active', fullscreen: false },
        pendingInit: { source: 'gate', cwd: '/proj', terminalId: TERM_ID },
      });
    });
    render(<TerminalModal />);

    act(() => {
      onExitCbs.get(TERM_ID)?.(0);
    });

    await waitFor(() => {
      expect(projectOpenMock).toHaveBeenCalledWith('/proj');
      expect(useAtriumStore.getState().project).toEqual(fakeProject);
      expect(useAtriumStore.getState().pendingInit).toBeNull();
    });
  });

  it('clears pendingInit without setting project on NOT_AN_ARCH_PROJECT', async () => {
    projectOpenMock.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_AN_ARCH_PROJECT', message: 'not arch' },
    });

    act(() => {
      useAtriumStore.setState({
        terminal: { id: TERM_ID, status: 'active', fullscreen: false },
        pendingInit: { source: 'gate', cwd: '/proj', terminalId: TERM_ID },
        project: null,
      });
    });
    render(<TerminalModal />);

    act(() => {
      onExitCbs.get(TERM_ID)?.(0);
    });

    await waitFor(() => {
      expect(useAtriumStore.getState().pendingInit).toBeNull();
      expect(useAtriumStore.getState().project).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Fullscreen toggle works while active (previously a silent no-op via setTerminal)
  // -------------------------------------------------------------------------

  it('fullscreen toggle works while status is active', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
    });
    render(<TerminalModal />);
    act(() => {
      screen.getByLabelText('Toggle fullscreen').click();
    });
    expect(useAtriumStore.getState().terminal.fullscreen).toBe(true);
    expect(useAtriumStore.getState().terminal.status).toBe('active');
  });

  it('fullscreen toggle works while status is spawning', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'spawning', fullscreen: false } });
    });
    render(<TerminalModal />);
    act(() => {
      screen.getByLabelText('Toggle fullscreen').click();
    });
    expect(useAtriumStore.getState().terminal.fullscreen).toBe(true);
    expect(useAtriumStore.getState().terminal.status).toBe('spawning');
  });
});
