import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { ProjectPanel } from '../ProjectPanel';
import { ok, err } from '@shared/result';
import type { ProjectState, HealthInfo, PluginInfo } from '@shared/domain';

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
    claudeStatus: 'checking',
    claudeInfo: null,
    pluginStatus: 'checking',
    pluginInfo: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProjectPanel', () => {
  it('renders PROJECT section header', () => {
    render(<ProjectPanel />);
    expect(screen.getByRole('heading', { level: 2, name: /PROJECT/i })).toBeDefined();
  });

  it('renders RECENT section header', () => {
    render(<ProjectPanel />);
    expect(screen.getByRole('heading', { level: 2, name: /RECENT/i })).toBeDefined();
  });

  it('shows current project name', () => {
    render(<ProjectPanel />);
    expect(screen.getByText('My App')).toBeDefined();
  });

  it('shows project path with word-break: break-all', () => {
    render(<ProjectPanel />);
    const pathEl = screen.getByText('/projects/my-app');
    expect(pathEl.style.wordBreak).toBe('break-all');
  });

  it('sidebar health line shows checking when claudeStatus is checking', () => {
    render(<ProjectPanel />);
    const container = screen.getByTestId('sidebar-health-line');
    const lines = container.querySelectorAll('div');
    expect(lines[0].textContent).toBe('claude · checking');
  });

  it('sidebar health line shows healthy with version', () => {
    const info: HealthInfo = { claudePath: '/usr/bin/claude', version: '1.2.3' };
    useAtriumStore.setState({ claudeStatus: 'healthy', claudeInfo: info });
    render(<ProjectPanel />);
    const container = screen.getByTestId('sidebar-health-line');
    const lines = container.querySelectorAll('div');
    expect(lines[0].textContent).toBe('claude v1.2.3 · healthy');
  });

  it('sidebar health line shows unreachable', () => {
    useAtriumStore.setState({ claudeStatus: 'unreachable', claudeInfo: null });
    render(<ProjectPanel />);
    const container = screen.getByTestId('sidebar-health-line');
    const lines = container.querySelectorAll('div');
    expect(lines[0].textContent).toBe('claude · unreachable');
  });

  it('loads recents on mount, filtering out current project', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([
          { path: '/projects/my-app', name: 'My App', lastOpened: fiveMinutesAgo },
          { path: '/projects/other', name: 'Other', lastOpened: fiveMinutesAgo },
        ])),
        open: vi.fn(),
        switch: vi.fn(),
      },
      dialog: { openFolder: vi.fn() },
    }));
    render(<ProjectPanel />);
    await waitFor(() => {
      expect(screen.queryByText('My App', { selector: 'span' })).toBeNull();
      expect(screen.getByText('Other')).toBeDefined();
    });
  });

  it('recent item shows formatted relative time', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([
          { path: '/projects/other', name: 'Other', lastOpened: fiveMinutesAgo },
        ])),
        open: vi.fn(),
        switch: vi.fn(),
      },
      dialog: { openFolder: vi.fn() },
    }));
    render(<ProjectPanel />);
    await waitFor(() => {
      expect(screen.getByText('5m ago')).toBeDefined();
    });
  });

  it('Open project… button calls openFolder then openOrNewProject flow', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Open project…' }));
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
    await user.click(screen.getByRole('button', { name: 'Open project…' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });

  it('clicking a recent calls switchProject', async () => {
    const user = userEvent.setup();
    const switchMock = vi.fn().mockResolvedValue(ok(fakeProject2));
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([
          { path: '/projects/other', name: 'Other', lastOpened: fiveMinutesAgo },
        ])),
        open: vi.fn(),
        switch: switchMock,
      },
      dialog: { openFolder: vi.fn() },
    }));
    render(<ProjectPanel />);
    await waitFor(() => screen.getByText('Other'));
    const otherBtn = screen.getByText('Other').closest('button');
    await user.click(otherBtn as HTMLButtonElement);
    await waitFor(() => {
      expect(switchMock).toHaveBeenCalledWith('/projects/other');
    });
  });

  it('Open button is disabled when terminal is active (canSwitch false)', () => {
    useAtriumStore.setState({
      terminal: { id: null, status: 'active', fullscreen: false },
    });
    render(<ProjectPanel />);
    const btn = screen.getByRole('button', { name: 'Open project…' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('plugin line shows checking when pluginStatus is checking', () => {
    render(<ProjectPanel />);
    const container = screen.getByTestId('sidebar-health-line');
    const lines = container.querySelectorAll('div');
    expect(lines[1].textContent).toBe('architector · checking');
  });

  it('plugin line shows present with version when pluginInfo is set', () => {
    const info: PluginInfo = { pluginId: 'architector@getleverage', version: '1.1.0', enabled: true };
    useAtriumStore.setState({ pluginStatus: 'present', pluginInfo: info });
    render(<ProjectPanel />);
    const container = screen.getByTestId('sidebar-health-line');
    const lines = container.querySelectorAll('div');
    expect(lines[1].textContent).toBe('architector v1.1.0 · present');
  });

  it('plugin line shows missing', () => {
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null });
    render(<ProjectPanel />);
    const container = screen.getByTestId('sidebar-health-line');
    const lines = container.querySelectorAll('div');
    expect(lines[1].textContent).toBe('architector · missing');
  });

  it('plugin line shows list-unavailable', () => {
    useAtriumStore.setState({ pluginStatus: 'list-unavailable', pluginInfo: null });
    render(<ProjectPanel />);
    const container = screen.getByTestId('sidebar-health-line');
    const lines = container.querySelectorAll('div');
    expect(lines[1].textContent).toBe('architector · list-unavailable');
  });

  it('plugin line shows unknown', () => {
    useAtriumStore.setState({ pluginStatus: 'unknown', pluginInfo: null });
    render(<ProjectPanel />);
    const lines = screen.getByTestId('sidebar-health-line').querySelectorAll('div');
    expect(lines[1].textContent).toBe('architector · unknown');
  });

  it('claude line shows healthy without version when claudeInfo is null', () => {
    useAtriumStore.setState({ claudeStatus: 'healthy', claudeInfo: null });
    render(<ProjectPanel />);
    const lines = screen.getByTestId('sidebar-health-line').querySelectorAll('div');
    expect(lines[0].textContent).toBe('claude · healthy');
  });

  it('plugin line shows present without version when pluginInfo is null', () => {
    useAtriumStore.setState({ pluginStatus: 'present', pluginInfo: null });
    render(<ProjectPanel />);
    const lines = screen.getByTestId('sidebar-health-line').querySelectorAll('div');
    expect(lines[1].textContent).toBe('architector · present');
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
    await user.click(screen.getByRole('button', { name: 'Open project…' }));
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
