import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import type { TerminalId } from '@shared/domain';

// Mock xterm — real xterm requires canvas and crashes in jsdom
const xtermMocks = {
  attachCustomKeyEventHandler: vi.fn(),
  hasSelection: vi.fn(),
  getSelection: vi.fn(),
  clearSelection: vi.fn(),
};
const readTextMock = vi.fn().mockResolvedValue('');
const writeTextMock = vi.fn().mockResolvedValue(undefined);

vi.mock('xterm', () => {
  class Terminal {
    cols = 80;
    rows = 24;
    write = vi.fn();
    onData = vi.fn().mockReturnValue({ dispose: vi.fn() });
    open = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    attachCustomKeyEventHandler = xtermMocks.attachCustomKeyEventHandler;
    hasSelection = xtermMocks.hasSelection;
    getSelection = xtermMocks.getSelection;
    clearSelection = xtermMocks.clearSelection;
  }
  return { Terminal };
});

vi.mock('xterm-addon-fit', () => {
  class FitAddon {
    fit = vi.fn();
  }
  return { FitAddon };
});

vi.mock('xterm/css/xterm.css', () => ({}));

import { ConsultationPanel } from '../ConsultationPanel';

const TERM_ID = 'term-1' as TerminalId;

const writeMock = vi.fn();

function makeProject() {
  return {
    rootPath: '/p/a',
    projectName: 'A',
    projectHash: 'h-a',
    context: { description: '', sections: {} },
    nodes: [],
    connections: [],
    sessions: [],
    warnings: [],
  };
}

function stubAtrium() {
  vi.stubGlobal('atrium', {
    terminal: {
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
      write: writeMock,
      resize: vi.fn(),
      kill: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    },
    consultation: {
      spawnTerminal: vi.fn().mockResolvedValue({ ok: true, data: 'term-1' as TerminalId }),
    },
  });
}

type FireKeyInit = Partial<
  Pick<KeyboardEvent, 'type' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'code' | 'key'>
> & { preventDefault?: ReturnType<typeof vi.fn> };

function fireKey(keyInit?: FireKeyInit): boolean {
  const handler = xtermMocks.attachCustomKeyEventHandler.mock.calls[0]?.[0] as
    | ((e: Record<string, unknown>) => boolean)
    | undefined;
  if (!handler)
    throw new Error('attachCustomKeyEventHandler not called — did you render <ConsultationPanel />?');
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

beforeEach(() => {
  stubAtrium();
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { readText: readTextMock, writeText: writeTextMock },
  });
  Object.values(xtermMocks).forEach((fn) => fn.mockReset());
  xtermMocks.hasSelection.mockReturnValue(false);
  xtermMocks.getSelection.mockReturnValue('');
  readTextMock.mockReset().mockResolvedValue('');
  writeTextMock.mockReset().mockResolvedValue(undefined);
  writeMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ConsultationPanel', () => {
  it('renders xterm container when id is null and status is idle', () => {
    useAtriumStore.setState({
      project: null,
      consultation: { panel: { kind: 'open-pinned' }, pinState: false },
      consultationTerminal: { id: null, status: 'idle' },
    });
    render(<ConsultationPanel />);
    expect(screen.getByTestId('consultation-xterm-container')).toBeTruthy();
  });

  it('shows Connecting indicator when status is spawning', () => {
    useAtriumStore.setState({
      project: makeProject(),
      consultation: { panel: { kind: 'open-pinned' }, pinState: false },
      consultationTerminal: { id: null, status: 'spawning' },
    });
    render(<ConsultationPanel />);
    expect(screen.getByText('Connecting…')).toBeTruthy();
  });

  it('shows Restart button when status is exited', () => {
    useAtriumStore.setState({
      project: makeProject(),
      consultation: { panel: { kind: 'open-pinned' }, pinState: false },
      consultationTerminal: { id: 'term-x' as TerminalId, status: 'exited' },
    });
    render(<ConsultationPanel />);
    expect(screen.getByTestId('consultation-restart-button')).toBeTruthy();
  });

  describe('clipboard handler', () => {
    function mountActive() {
      useAtriumStore.setState({
        project: makeProject(),
        consultation: { panel: { kind: 'open-pinned' }, pinState: false },
        consultationTerminal: { id: TERM_ID, status: 'active' },
      });
      render(<ConsultationPanel />);
    }

    it('copy-selection on Ctrl+C with selection', () => {
      mountActive();
      xtermMocks.hasSelection.mockReturnValue(true);
      xtermMocks.getSelection.mockReturnValue('selected text');

      const preventDefault = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyC', preventDefault });

      expect(result).toBe(false);
      expect(preventDefault).toHaveBeenCalled();
      expect(writeTextMock).toHaveBeenCalledWith('selected text');
      expect(xtermMocks.clearSelection).toHaveBeenCalled();
    });

    it('passthrough Ctrl+C with no selection', () => {
      mountActive();
      xtermMocks.hasSelection.mockReturnValue(false);

      const preventDefault = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyC', preventDefault });

      expect(result).toBe(true);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(writeTextMock).not.toHaveBeenCalled();
    });

    it('swallow Ctrl+Shift+C with no selection', () => {
      mountActive();
      xtermMocks.hasSelection.mockReturnValue(false);

      const preventDefault = vi.fn();
      const result = fireKey({
        ctrlKey: true,
        shiftKey: true,
        code: 'KeyC',
        preventDefault,
      });

      expect(result).toBe(false);
      expect(preventDefault).toHaveBeenCalled();
      expect(writeTextMock).not.toHaveBeenCalled();
      expect(xtermMocks.clearSelection).not.toHaveBeenCalled();
    });

    it('paste on Ctrl+V when status active wraps and writes', async () => {
      mountActive();
      readTextMock.mockResolvedValue('line1\nline2');

      const preventDefault = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyV', preventDefault });

      expect(result).toBe(false);
      expect(preventDefault).toHaveBeenCalled();

      await waitFor(() => {
        expect(writeMock).toHaveBeenCalledOnce();
      });
      const [calledId, calledBuf] = writeMock.mock.calls[0] as [TerminalId, ArrayBuffer];
      expect(calledId).toBe(TERM_ID);
      const decoded = new TextDecoder().decode(calledBuf);
      expect(decoded.startsWith('\x1b[200~')).toBe(true);
      expect(decoded.endsWith('\x1b[201~')).toBe(true);
      expect(decoded).toContain('line1\nline2');
    });

    it('paste swallowed when status spawning', () => {
      // Panel only mounts xterm once id is non-null. Mount with active, then flip
      // status to 'spawning' while keeping the same id. The handler reads status
      // at event time so we exercise the spawning branch without remounting.
      mountActive();
      act(() => {
        useAtriumStore.setState({
          consultationTerminal: { id: TERM_ID, status: 'spawning' },
        });
      });

      const preventDefault = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyV', preventDefault });

      expect(result).toBe(false);
      expect(preventDefault).toHaveBeenCalled();
      expect(readTextMock).not.toHaveBeenCalled();
      expect(writeMock).not.toHaveBeenCalled();
    });

    it('paste swallowed when status exited', () => {
      mountActive();
      act(() => {
        useAtriumStore.setState({
          consultationTerminal: { id: TERM_ID, status: 'exited' },
        });
      });

      const preventDefault = vi.fn();
      const result = fireKey({ ctrlKey: true, code: 'KeyV', preventDefault });

      expect(result).toBe(false);
      expect(preventDefault).toHaveBeenCalled();
      expect(readTextMock).not.toHaveBeenCalled();
      expect(writeMock).not.toHaveBeenCalled();
    });

    it('paste short-circuit when id is null', async () => {
      mountActive();
      // After mount, flip id to null while keeping status active.
      act(() => {
        useAtriumStore.setState({
          consultationTerminal: { id: null, status: 'active' },
        });
      });
      readTextMock.mockResolvedValue('hello');

      fireKey({ ctrlKey: true, code: 'KeyV' });

      await act(async () => {
        await Promise.resolve();
      });

      expect(writeMock).not.toHaveBeenCalled();
    });

    it('paste short-circuit when status flips between read and write', async () => {
      mountActive();

      let resolveRead!: (text: string) => void;
      readTextMock.mockReturnValue(
        new Promise<string>((res) => {
          resolveRead = res;
        }),
      );

      fireKey({ ctrlKey: true, code: 'KeyV' });

      act(() => {
        useAtriumStore.setState({
          consultationTerminal: { id: TERM_ID, status: 'exited' },
        });
      });

      await act(async () => {
        resolveRead('abc');
        await Promise.resolve();
      });

      expect(writeMock).not.toHaveBeenCalled();
    });

    it('paste with empty clipboard drops silently', async () => {
      mountActive();
      readTextMock.mockResolvedValue('');

      fireKey({ ctrlKey: true, code: 'KeyV' });

      await act(async () => {
        await Promise.resolve();
      });

      expect(writeMock).not.toHaveBeenCalled();
    });
  });
});
