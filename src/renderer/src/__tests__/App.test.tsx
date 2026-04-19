import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '../store/atriumStore';
import { resetAutoOpenForTests } from '../autoOpen/startAutoOpen';
import { App } from '../App';
import type { ProjectState } from '@shared/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validProjectStateWithOneNode: ProjectState = {
  rootPath: '/fake',
  projectName: 'Fake',
  projectHash: 'abc123',
  context: { description: '', sections: {} },
  nodes: [
    {
      slug: 'test-node',
      name: 'Test Node',
      maturity: 'decided',
      priority: 'core',
      file: 'ideas/test-node.md',
      summary: 'A test node',
      description: '',
      sections: {},
    },
  ],
  connections: [],
  sessions: [],
  warnings: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App', () => {
  beforeEach(() => {
    resetAutoOpenForTests();
    useAtriumStore.setState({ canvas: { kind: 'empty' }, project: null });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders LaunchGate when project === null', () => {
    vi.stubGlobal('atrium', {
      project: {
        getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        open: vi.fn(),
      },
      health: {
        checkClaude: vi.fn().mockResolvedValue({ ok: true, data: { claudePath: '/bin/claude', version: '1.0' } }),
      },
      layout: {
        load: vi.fn().mockResolvedValue({ ok: true, data: null }),
        save: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        saveSnapshot: vi.fn(),
      },
      fileSync: {
        onChanged: vi.fn().mockReturnValue(() => {}),
      },
    });

    render(<App />);
    // Gate should be present; canvas wrapper should not
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByTestId('main-shell')).toBeNull();
  });

  it('closes gate and shows MainShell when setProject is called', async () => {
    vi.stubGlobal('atrium', {
      project: {
        getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        open: vi.fn(),
      },
      health: {
        checkClaude: vi.fn().mockResolvedValue({ ok: true, data: { claudePath: '/bin/claude', version: '1.0' } }),
      },
      layout: {
        load: vi.fn().mockResolvedValue({ ok: true, data: null }),
        save: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        saveSnapshot: vi.fn(),
      },
      fileSync: {
        onChanged: vi.fn().mockReturnValue(() => {}),
      },
    });

    render(<App />);
    // Drive the gate close by calling setProject directly — no production affordance needed
    act(() => {
      useAtriumStore.getState().setProject(validProjectStateWithOneNode);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('main-shell')).toBeTruthy();
    });
  });

  it('renders MainShell (not gate) when project is pre-set in store', () => {
    vi.stubGlobal('atrium', {
      project: {
        getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        open: vi.fn(),
      },
      health: {
        checkClaude: vi.fn().mockResolvedValue({ ok: true, data: { claudePath: '/bin/claude', version: '1.0' } }),
      },
      layout: {
        load: vi.fn().mockResolvedValue({ ok: true, data: null }),
        save: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        saveSnapshot: vi.fn(),
      },
      fileSync: {
        onChanged: vi.fn().mockReturnValue(() => {}),
      },
    });

    useAtriumStore.setState({ project: validProjectStateWithOneNode, canvas: { kind: 'ready' } });

    render(<App />);
    expect(screen.getByTestId('main-shell')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders React Flow container after opening a recent project via auto-open', async () => {
    vi.stubGlobal('atrium', {
      project: {
        getRecents: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ path: '/fake', lastOpened: new Date().toISOString() }],
        }),
        open: vi.fn().mockResolvedValue({ ok: true, data: validProjectStateWithOneNode }),
      },
      health: {
        checkClaude: vi.fn().mockResolvedValue({ ok: true, data: { claudePath: '/bin/claude', version: '1.0' } }),
      },
      layout: {
        load: vi.fn().mockResolvedValue({ ok: true, data: null }),
        save: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        saveSnapshot: vi.fn(),
      },
      fileSync: {
        onChanged: vi.fn().mockImplementation((cb: (s: unknown) => void) => {
          void cb;
          return () => {};
        }),
      },
    });

    const { container } = render(<App />);
    await waitFor(() => {
      const rf = container.querySelector('.react-flow');
      const slugText = screen.queryByText('test-node') ?? screen.queryByText('Test Node');
      expect(rf ?? slugText).toBeTruthy();
    });
    // Gate should not be visible after auto-open succeeds
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('StrictMode double-mount does not duplicate auto-open (idempotent)', async () => {
    const openMock = vi.fn().mockResolvedValue({ ok: true, data: validProjectStateWithOneNode });
    vi.stubGlobal('atrium', {
      project: {
        getRecents: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ path: '/fake', lastOpened: new Date().toISOString() }],
        }),
        open: openMock,
      },
      health: {
        checkClaude: vi.fn().mockResolvedValue({ ok: true, data: { claudePath: '/bin/claude', version: '1.0' } }),
      },
      layout: {
        load: vi.fn().mockResolvedValue({ ok: true, data: null }),
        save: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        saveSnapshot: vi.fn(),
      },
      fileSync: {
        onChanged: vi.fn().mockReturnValue(() => {}),
      },
    });

    render(<App />);
    await waitFor(() => {
      expect(openMock).toHaveBeenCalledTimes(1);
    });
  });
});
