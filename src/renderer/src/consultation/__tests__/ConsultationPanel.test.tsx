import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import type { TerminalId } from '@shared/domain';

// Mock xterm — real xterm requires canvas and crashes in jsdom
vi.mock('xterm', () => {
  class Terminal {
    cols = 80;
    rows = 24;
    write = vi.fn();
    onData = vi.fn().mockReturnValue({ dispose: vi.fn() });
    open = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
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
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    },
    consultation: {
      spawnTerminal: vi.fn().mockResolvedValue({ ok: true, data: 'term-1' as TerminalId }),
    },
  });
}

beforeEach(() => {
  stubAtrium();
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
});
