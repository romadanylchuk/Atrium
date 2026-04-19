import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { ProjectPanel } from '../ProjectPanel';
import { ok, err } from '@shared/result';
import type { ProjectState } from '@shared/domain';

const fakeProject: ProjectState = {
  rootPath: '/projects/my-app',
  projectName: 'My App',
  projectHash: 'abc',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
};

const fakeProject2: ProjectState = {
  rootPath: '/projects/other',
  projectName: 'Other',
  projectHash: 'def',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
};

function makeAtrium(overrides = {}) {
  return {
    project: {
      getRecents: vi.fn().mockResolvedValue(ok([])),
      open: vi.fn().mockResolvedValue(ok(fakeProject)),
      switch: vi.fn().mockResolvedValue(ok(fakeProject2)),
    },
    dialog: {
      openFolder: vi.fn().mockResolvedValue(ok(null)),
    },
    skill: {
      spawn: vi.fn().mockResolvedValue(ok('tid-1')),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('atrium', makeAtrium());
  useAtriumStore.setState({
    project: fakeProject,
    terminal: { id: null, status: 'idle', fullscreen: false },
    selectedNodes: new Set(),
    pendingInit: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProjectPanel', () => {
  it('shows current project name as header', () => {
    render(<ProjectPanel />);
    expect(screen.getByRole('heading', { name: 'My App' })).toBeDefined();
  });

  it('loads recents on mount, filtering out current project', async () => {
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([
          { path: '/projects/my-app', name: 'My App' },
          { path: '/projects/other', name: 'Other' },
        ])),
        open: vi.fn(),
        switch: vi.fn(),
      },
      dialog: { openFolder: vi.fn() },
    }));
    render(<ProjectPanel />);
    await waitFor(() => {
      expect(screen.queryByText('My App', { selector: 'button' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Other' })).toBeDefined();
    });
  });

  it('Open button calls openFolder then openOrNewProject flow', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([])),
        open: vi.fn().mockResolvedValue(ok(fakeProject2)),
        switch: vi.fn(),
      },
      dialog: {
        openFolder: vi.fn().mockResolvedValue(ok('/projects/other')),
      },
    }));
    render(<ProjectPanel />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect(useAtriumStore.getState().project?.rootPath).toBe('/projects/other');
    });
  });

  it('shows inline error when open fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([])),
        open: vi.fn().mockResolvedValue(err('IO_ERROR', 'Disk failure')),
        switch: vi.fn(),
      },
      dialog: {
        openFolder: vi.fn().mockResolvedValue(ok('/projects/bad')),
      },
    }));
    render(<ProjectPanel />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });

  it('clicking a recent calls switchProject', async () => {
    const user = userEvent.setup();
    const switchMock = vi.fn().mockResolvedValue(ok(fakeProject2));
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([
          { path: '/projects/other', name: 'Other' },
        ])),
        open: vi.fn(),
        switch: switchMock,
      },
      dialog: { openFolder: vi.fn() },
    }));
    render(<ProjectPanel />);
    await waitFor(() => screen.getByRole('button', { name: 'Other' }));
    await user.click(screen.getByRole('button', { name: 'Other' }));
    await waitFor(() => {
      expect(switchMock).toHaveBeenCalledWith('/projects/other');
    });
  });

  it('Open button is disabled when terminal is active (canSwitch false)', () => {
    useAtriumStore.setState({
      terminal: { id: null, status: 'active', fullscreen: false },
    });
    render(<ProjectPanel />);
    const btn = screen.getByRole('button', { name: 'Open' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('new-project submit calls dispatchInitSpawn with source=panel and sets pendingInit accordingly', async () => {
    const user = userEvent.setup();
    const spawnMock = vi.fn().mockResolvedValue({ ok: true, data: 'tid-panel' });
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        open: vi.fn().mockResolvedValue({ ok: false, error: { code: 'NOT_AN_ARCH_PROJECT' } }),
        switch: vi.fn(),
      },
      dialog: {
        openFolder: vi.fn().mockResolvedValue({ ok: true, data: '/new-proj' }),
      },
      skill: { spawn: spawnMock },
    }));

    render(<ProjectPanel />);

    // Trigger the Open flow → NOT_AN_ARCH_PROJECT → new-project form
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => screen.getByRole('button', { name: 'Initialize Project' }));

    // Submit the form (fields are optional; just submit with defaults)
    await user.click(screen.getByRole('button', { name: 'Initialize Project' }));

    await waitFor(() => {
      const pending = useAtriumStore.getState().pendingInit;
      expect(pending).not.toBeNull();
      expect(pending?.source).toBe('panel');
      expect(pending?.cwd).toBe('/new-proj');
    });
  });
});
