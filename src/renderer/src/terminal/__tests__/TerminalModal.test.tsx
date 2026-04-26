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
const attachCustomKeyEventHandlerMock = vi.fn();
const hasSelectionMock = vi.fn();
const getSelectionMock = vi.fn();
const clearSelectionMock = vi.fn();
const readTextMock = vi.fn().mockResolvedValue('');
const writeTextMock = vi.fn().mockResolvedValue(undefined);

vi.mock('xterm', () => {
  class Terminal {
    cols = 80;
    rows = 24;
    write = xtermWriteMock;
    onData = xtermOnDataMock;
    open = xtermOpenMock;
    dispose = xtermDisposeMock;
    loadAddon = vi.fn();
    attachCustomKeyEventHandler = attachCustomKeyEventHandlerMock;
    hasSelection = hasSelectionMock;
    getSelection = getSelectionMock;
    clearSelection = clearSelectionMock;
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
const closeMock = vi.fn().mockResolvedValue({ ok: true, data: undefined });
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
    close: closeMock,
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
  closeMock.mockClear();
  writeMock.mockClear();
  resizeMock.mockClear();
  projectOpenMock.mockClear();
  attachCustomKeyEventHandlerMock.mockReset();
  hasSelectionMock.mockReset();
  getSelectionMock.mockReset();
  clearSelectionMock.mockReset();
  readTextMock.mockReset().mockResolvedValue('');
  writeTextMock.mockReset().mockResolvedValue(undefined);
}

type FireKeyInit = Partial<Pick<KeyboardEvent, 'type' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'code' | 'key'>> & { preventDefault?: ReturnType<typeof vi.fn> };

function fireKey(keyInit?: FireKeyInit): boolean {
  const handler = attachCustomKeyEventHandlerMock.mock.calls[0]?.[0] as
    | ((e: Record<string, unknown>) => boolean)
    | undefined;
  if (!handler) throw new Error('attachCustomKeyEventHandler not called — did you render <TerminalModal />?');
  return handler({
    type: 'keydown',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    code: '',
    key: '',
    preventDefault: vi.fn(),
    ...keyInit,
  });
}

describe('TerminalModal', () => {
  beforeEach(() => {
    vi.stubGlobal('atrium', makeAtrium());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { readText: readTextMock, writeText: writeTextMock } });
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

  it('Close button triggers window.atrium.terminal.close(id)', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });
    });
    render(<TerminalModal />);
    act(() => {
      screen.getByLabelText('Close terminal').click();
    });
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledWith(TERM_ID);
  });

  it('Escape key triggers window.atrium.terminal.close(id)', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });
    });
    render(<TerminalModal />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledWith(TERM_ID);
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

  it('overlay element has position absolute (canvas-bounded)', () => {
    act(() => {
      useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'spawning', fullscreen: false } });
    });
    render(<TerminalModal />);
    const overlay = screen.getByTestId('terminal-modal');
    expect(overlay.style.position).toBe('absolute');
    expect(overlay.style.position).not.toBe('fixed');
  });

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

  // -------------------------------------------------------------------------
  // Clipboard key handler integration
  // -------------------------------------------------------------------------

  describe('clipboard key handler', () => {
    it('Ctrl+C with selection: copies text, clears selection, swallows key', () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      hasSelectionMock.mockReturnValue(true);
      getSelectionMock.mockReturnValue('hello');

      const preventDefaultSpy = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyC', preventDefault: preventDefaultSpy });

      expect(result).toBe(false);
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(writeTextMock).toHaveBeenCalledWith('hello');
      expect(clearSelectionMock).toHaveBeenCalled();
      expect(writeMock).not.toHaveBeenCalled();
    });

    it('Ctrl+C without selection: passes through (SIGINT preserved)', () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      hasSelectionMock.mockReturnValue(false);

      const preventDefaultSpy = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyC', preventDefault: preventDefaultSpy });

      expect(result).toBe(true);
      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(writeTextMock).not.toHaveBeenCalled();
      expect(writeMock).not.toHaveBeenCalled();
    });

    it('Ctrl+V active with clipboard text: pastes to pty', async () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      readTextMock.mockResolvedValue('abc');

      const preventDefaultSpy = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyV', preventDefault: preventDefaultSpy });

      expect(result).toBe(false);
      expect(preventDefaultSpy).toHaveBeenCalled();

      await waitFor(() => {
        expect(writeMock).toHaveBeenCalledOnce();
      });
      const [calledId, calledBuf] = writeMock.mock.calls[0] as [TerminalId, ArrayBuffer];
      expect(calledId).toBe(TERM_ID);
      expect(new TextDecoder().decode(calledBuf)).toBe('\x1b[200~abc\x1b[201~');
    });

    it('Ctrl+V with empty clipboard: swallows key, no pty write', async () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      readTextMock.mockResolvedValue('');

      const result = fireKey({ ctrlKey: true, code: 'KeyV' });
      expect(result).toBe(false);

      await act(async () => {
        await Promise.resolve();
      });

      expect(writeMock).not.toHaveBeenCalled();
    });

    it('Ctrl+V during spawning: swallows key, no clipboard read, no pty write', () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'spawning', fullscreen: false } });
      });
      render(<TerminalModal />);

      const result = fireKey({ ctrlKey: true, code: 'KeyV' });

      expect(result).toBe(false);
      expect(readTextMock).not.toHaveBeenCalled();
      expect(writeMock).not.toHaveBeenCalled();
    });

    it('Ctrl+V with rejected clipboard: swallows key, no pty write', async () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      readTextMock.mockRejectedValue(new Error('denied'));

      const result = fireKey({ ctrlKey: true, code: 'KeyV' });
      expect(result).toBe(false);

      await act(async () => {
        await Promise.resolve();
      });

      expect(writeMock).not.toHaveBeenCalled();
    });

    it('Ctrl+V: active→exited during clipboard read does not write to pty', async () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      let resolveClipboard!: (text: string) => void;
      readTextMock.mockReturnValue(
        new Promise<string>((res) => {
          resolveClipboard = res;
        }),
      );

      fireKey({ ctrlKey: true, code: 'KeyV' });

      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });
      });

      await act(async () => {
        resolveClipboard('abc');
        await Promise.resolve();
      });

      expect(writeMock).not.toHaveBeenCalled();
    });

    it('Ctrl+Shift+C without selection: swallows key, no clipboard write', () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      hasSelectionMock.mockReturnValue(false);

      const preventDefaultSpy = vi.fn();
      const result = fireKey({ ctrlKey: true, shiftKey: true, code: 'KeyC', preventDefault: preventDefaultSpy });

      expect(result).toBe(false);
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(writeTextMock).not.toHaveBeenCalled();
      expect(clearSelectionMock).not.toHaveBeenCalled();
    });

    it('Ctrl+Shift+V active: pastes to pty', async () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      readTextMock.mockResolvedValue('xyz');

      const result = fireKey({ ctrlKey: true, shiftKey: true, code: 'KeyV' });
      expect(result).toBe(false);

      await waitFor(() => {
        expect(writeMock).toHaveBeenCalledOnce();
      });
      const [, calledBuf] = writeMock.mock.calls[0] as [TerminalId, ArrayBuffer];
      expect(new TextDecoder().decode(calledBuf)).toBe('\x1b[200~xyz\x1b[201~');
    });

    it('Ctrl+V with multi-line CRLF clipboard: writes bracketed-paste envelope with normalized LF', async () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      readTextMock.mockResolvedValue('line1\r\nline2\r\nline3');

      const result = fireKey({ ctrlKey: true, code: 'KeyV' });
      expect(result).toBe(false);

      await waitFor(() => {
        expect(writeMock).toHaveBeenCalledOnce();
      });
      const [, calledBuf] = writeMock.mock.calls[0] as [TerminalId, ArrayBuffer];
      expect(new TextDecoder().decode(calledBuf)).toBe('\x1b[200~line1\nline2\nline3\x1b[201~');
    });

    it('keyup Ctrl+V: passes through, no clipboard I/O', () => {
      act(() => {
        useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'active', fullscreen: false } });
      });
      render(<TerminalModal />);

      const result = fireKey({ type: 'keyup', ctrlKey: true, code: 'KeyV' });

      expect(result).toBe(true);
      expect(readTextMock).not.toHaveBeenCalled();
      expect(writeMock).not.toHaveBeenCalled();
    });
  });
});
