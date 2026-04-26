import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import type { TerminalId } from '@shared/domain';
import { MainShell } from '../MainShell';

vi.mock('@renderer/terminal/TerminalModal', () => ({
  TerminalModal: () => <div data-testid="terminal-modal" />,
}));

vi.mock('@renderer/toolbar/StatusPanel', () => ({
  StatusPanel: () => <div data-testid="status-panel" />,
}));

vi.mock('@renderer/toolbar/FinalizePanel', () => ({
  FinalizePanel: () => <div data-testid="finalize-panel" />,
}));

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
  consultation: {
    loadThread: vi.fn().mockResolvedValue({ ok: true, data: null }),
    sendMessage: vi.fn(),
    newSession: vi.fn(),
    cancel: vi.fn(),
    onStreamChunk: vi.fn().mockReturnValue(() => {}),
    onStreamComplete: vi.fn().mockReturnValue(() => {}),
    onStreamError: vi.fn().mockReturnValue(() => {}),
  },
});

describe('MainShell', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      useAtriumStore.setState({
        consultation: {
          panel: { kind: 'closed' },
          pinState: false,
          thread: null,
          pending: null,
          inFlight: null,
          lastError: null,
          selectedModel: 'sonnet',
        },
      });
    });
  });

  it('renders the side-panel placeholder', () => {
    const { container } = render(<MainShell />);
    const aside = container.querySelector('[data-region="side-panel"]');
    expect(aside).toBeTruthy();
  });

  it('renders the toolbar slot', () => {
    const { container } = render(<MainShell />);
    const toolbar = container.querySelector('[data-region="toolbar"]');
    expect(toolbar).toBeTruthy();
  });

  it('side panel aside has width 240px', () => {
    const { container } = render(<MainShell />);
    const aside = container.querySelector('[data-region="side-panel"]');
    expect(aside).toBeTruthy();
    expect((aside as HTMLElement).style.flex).toBe('0 0 240px');
  });

  it('renders the consultation edge tab when panel is closed', () => {
    const { container } = render(<MainShell />);
    const edge = container.querySelector('[data-region="consultation-edge"]');
    expect(edge).toBeTruthy();
    expect((edge as HTMLElement).style.flex).toBe('0 0 28px');
  });

  it('renders the consultation panel when panel is open and uses 400px flex basis', () => {
    act(() => {
      useAtriumStore.setState({
        consultation: {
          panel: { kind: 'open-pinned' },
          pinState: true,
          thread: null,
          pending: null,
          inFlight: null,
          lastError: null,
          selectedModel: 'sonnet',
        },
      });
    });

    const { container } = render(<MainShell />);
    const panel = container.querySelector('[data-region="consultation-panel"]');
    expect(panel).toBeTruthy();
    expect((panel as HTMLElement).style.flex).toBe('0 0 400px');
    expect(container.querySelector('[data-region="consultation-edge"]')).toBeNull();
  });

  it('canvas column has data-region="canvas" with position relative', () => {
    const { container } = render(<MainShell />);
    const canvas = container.querySelector('[data-region="canvas"]');
    expect(canvas).toBeTruthy();
    expect((canvas as HTMLElement).style.position).toBe('relative');
  });

  it('terminal-modal renders inside data-region="canvas" when terminal is spawning', () => {
    act(() => {
      useAtriumStore.setState({
        terminal: { id: 'tid' as TerminalId, status: 'spawning', fullscreen: false },
      });
    });
    render(<MainShell />);
    const modal = screen.getByTestId('terminal-modal');
    expect(modal).toBeTruthy();
    expect(modal.closest('[data-region="canvas"]')).toBeTruthy();
  });

  it('terminal-modal is not a direct child of main-shell', () => {
    act(() => {
      useAtriumStore.setState({
        terminal: { id: 'tid' as TerminalId, status: 'spawning', fullscreen: false },
      });
    });
    render(<MainShell />);
    const mainShell = screen.getByTestId('main-shell');
    const modal = screen.getByTestId('terminal-modal');
    expect(Array.from(mainShell.children).includes(modal)).toBe(false);
  });

  it('consultation region is a sibling positioned after the side-panel aside', () => {
    const { container } = render(<MainShell />);
    const aside = container.querySelector('[data-region="side-panel"]');
    const edge = container.querySelector('[data-region="consultation-edge"]');
    expect(aside).toBeTruthy();
    expect(edge).toBeTruthy();
    expect(aside?.parentElement).toBe(edge?.parentElement);

    const siblings = Array.from(aside?.parentElement?.children ?? []);
    const asideIdx = siblings.indexOf(aside as Element);
    const edgeIdx = siblings.indexOf(edge as Element);
    expect(edgeIdx).toBeGreaterThan(asideIdx);
  });
});
