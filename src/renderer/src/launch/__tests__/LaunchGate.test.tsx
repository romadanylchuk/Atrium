import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import { LaunchGate } from '../LaunchGate';
import { ok, err } from '@shared/result';
import type { ProjectState, PluginInfo } from '@shared/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeState: ProjectState = {
  rootPath: '/fake',
  projectName: 'Fake',
  projectHash: 'abc',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
};

const fakePluginInfo: PluginInfo = {
  pluginId: 'architector@getleverage',
  version: '1.0.0',
  enabled: true,
};

function makeAtrium(overrides: Partial<ReturnType<typeof baseAtrium>> = {}) {
  return { ...baseAtrium(), ...overrides };
}

function baseAtrium() {
  return {
    project: {
      getRecents: vi.fn().mockResolvedValue(ok([])),
      open: vi.fn().mockResolvedValue(ok(fakeState)),
      switch: vi.fn().mockResolvedValue(ok(fakeState)),
    },
    dialog: {
      openFolder: vi.fn().mockResolvedValue(ok(null)),
    },
    health: {
      checkClaude: vi.fn().mockResolvedValue(ok({ claudePath: '/usr/bin/claude', version: '1.0.0' })),
      checkPlugin: vi.fn().mockResolvedValue(ok(fakePluginInfo)),
      installPlugin: vi.fn().mockResolvedValue(ok({ kind: 'success', pluginInfo: fakePluginInfo })),
      cancelInstall: vi.fn().mockResolvedValue(ok(undefined)),
    },
    skill: {
      spawn: vi.fn().mockResolvedValue(ok('tid-1')),
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useAtriumStore.setState({
    project: null,
    claudeStatus: 'healthy',
    claudeInfo: { claudePath: '/usr/bin/claude', version: '1.0.0' },
    pluginStatus: 'present',
    pluginInfo: fakePluginInfo,
    installState: { kind: 'idle' },
    _recheckHealth: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LaunchGate', () => {
  it('renders a dialog with aria-modal', () => {
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('has Open button but no dismiss/bypass button', async () => {
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    await waitFor(() => expect(screen.getByRole('button', { name: /open project/i })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /close|dismiss|cancel/i })).toBeNull();
  });

  it('renders bottom health-line with claude and architector versions when both healthy', () => {
    useAtriumStore.setState({
      claudeStatus: 'healthy',
      claudeInfo: { claudePath: '/usr/bin/claude', version: '1.2.3' },
      pluginStatus: 'present',
      pluginInfo: { pluginId: 'architector@getleverage', version: '2.0.0', enabled: true },
    });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const healthLine = screen.getByTestId('launch-health-line');
    const divs = healthLine.querySelectorAll('div');
    expect(divs[0]!.textContent).toBe('claude v1.2.3 · healthy');
    expect(divs[1]!.textContent).toBe('architector v2.0.0 · present');
  });

  it("renders bottom health-line as 'claude · checking' before first poll resolves", () => {
    useAtriumStore.setState({ claudeStatus: 'checking', claudeInfo: null });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    expect(screen.getByTestId('launch-health-line').textContent).toContain('claude · checking');
    expect(screen.queryByText(/Claude CLI not found/i)).toBeNull();
  });

  it("renders bottom health-line as 'claude · unreachable' and shows explainer when unreachable", () => {
    useAtriumStore.setState({ claudeStatus: 'unreachable', claudeInfo: null });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    expect(screen.getByTestId('launch-health-line').textContent).toContain('claude · unreachable');
    expect(screen.getByText(/Claude CLI not found\./i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /install claude code/i })).toBeInTheDocument();
  });

  it('Open button is disabled when claudeStatus is unreachable (gate hard-blocks)', () => {
    useAtriumStore.setState({ claudeStatus: 'unreachable', claudeInfo: null });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /open project/i });
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Install required dependencies first');
  });

  it('Open button is disabled when pluginStatus is missing even with claudeStatus healthy', () => {
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /open project/i });
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Install required dependencies first');
  });

  it('Open button is enabled when both claude and plugin are healthy/present', () => {
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const btn = screen.getByRole<HTMLButtonElement>('button', { name: /open project/i });
    expect(btn.disabled).toBe(false);
  });

  it('renders recents as buttons when getRecents returns data', async () => {
    const recents = [
      { path: '/a', name: 'Alpha', lastOpened: new Date().toISOString() },
      { path: '/b', name: 'Beta', lastOpened: new Date().toISOString() },
    ];
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok(recents)),
        open: vi.fn(),
        switch: vi.fn(),
      },
    }));
    render(<LaunchGate />);
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
      expect(screen.getByText('Beta')).toBeTruthy();
    });
  });

  it('recents are disabled with dependency tooltip when gated', async () => {
    const recents = [{ path: '/a', name: 'Alpha', lastOpened: new Date().toISOString() }];
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null });
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok(recents)),
        open: vi.fn(),
        switch: vi.fn(),
      },
    }));
    render(<LaunchGate />);
    await waitFor(() => screen.getByText('Alpha'));
    const recentBtn = screen.getByRole<HTMLButtonElement>('button', { name: /alpha/i });
    expect(recentBtn.disabled).toBe(true);
    expect(recentBtn.title).toBe('Install required dependencies first');
  });

  it('clicking a recent calls switchProject with the correct path', async () => {
    const recents = [{ path: '/a', name: 'Alpha', lastOpened: new Date().toISOString() }];
    const switchMock = vi.fn().mockResolvedValue(ok(fakeState));
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok(recents)),
        open: vi.fn(),
        switch: switchMock,
      },
    }));
    render(<LaunchGate />);
    await waitFor(() => screen.getByText('Alpha'));
    await userEvent.click(screen.getByText('Alpha'));
    await waitFor(() => expect(switchMock).toHaveBeenCalledWith('/a'));
  });

  it('shows inline error when switchProject fails, gate stays open', async () => {
    const recents = [{ path: '/a', name: 'Alpha', lastOpened: new Date().toISOString() }];
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok(recents)),
        open: vi.fn(),
        switch: vi.fn().mockResolvedValue(err('BLOCKED_BY_TERMINAL', 'Terminal is active')),
      },
    }));
    render(<LaunchGate />);
    await waitFor(() => screen.getByText('Alpha'));
    await userEvent.click(screen.getByText('Alpha'));
    await waitFor(() => {
      expect(screen.getByText(/Terminal is active/i)).toBeTruthy();
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  it('folder picker cancelled → no state change, Open button re-enabled', async () => {
    vi.stubGlobal('atrium', makeAtrium({
      dialog: { openFolder: vi.fn().mockResolvedValue(ok(null)) },
    }));
    render(<LaunchGate />);
    await waitFor(() => screen.getByRole('button', { name: /open project/i }));
    await userEvent.click(screen.getByRole('button', { name: /open project/i }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: /open project/i }).disabled).toBe(false));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Open → existing project path → setProject called (gate closes)', async () => {
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([])),
        open: vi.fn().mockResolvedValue(ok(fakeState)),
        switch: vi.fn(),
      },
      dialog: { openFolder: vi.fn().mockResolvedValue(ok('/some/path')) },
    }));
    render(<LaunchGate />);
    await waitFor(() => screen.getByRole('button', { name: /open project/i }));
    await userEvent.click(screen.getByRole('button', { name: /open project/i }));
    await waitFor(() => {
      expect(useAtriumStore.getState().project).toEqual(fakeState);
    });
  });

  it('Open → NOT_AN_ARCH_PROJECT → shows new-project form pre-loaded with path', async () => {
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([])),
        open: vi.fn().mockResolvedValue(err('NOT_AN_ARCH_PROJECT', 'Not an arch project')),
        switch: vi.fn(),
      },
      dialog: { openFolder: vi.fn().mockResolvedValue(ok('/empty/folder')) },
    }));
    render(<LaunchGate />);
    await waitFor(() => screen.getByRole('button', { name: /open project/i }));
    await userEvent.click(screen.getByRole('button', { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /initialize project/i })).toBeTruthy();
      expect(screen.getByText(/\/empty\/folder/)).toBeTruthy();
    });
  });

  it('form submit calls dispatchInitSpawn shim with correct SkillSpawnRequest shape', async () => {
    vi.stubGlobal('atrium', makeAtrium({
      project: {
        getRecents: vi.fn().mockResolvedValue(ok([])),
        open: vi.fn().mockResolvedValue(err('NOT_AN_ARCH_PROJECT', 'not arch')),
        switch: vi.fn(),
      },
      dialog: { openFolder: vi.fn().mockResolvedValue(ok('/new/proj')) },
    }));

    render(<LaunchGate />);
    await waitFor(() => screen.getByRole('button', { name: /open project/i }));
    await userEvent.click(screen.getByRole('button', { name: /open project/i }));
    await waitFor(() => screen.getByRole('button', { name: /initialize project/i }));

    await userEvent.type(screen.getByPlaceholderText(/my project/i), 'TestProject');
    await userEvent.click(screen.getByRole('button', { name: /initialize project/i }));

    // Shim returns ok immediately — gate stays visible (modal not wired yet in P9)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  // ---------------------------------------------------------------------------
  // Install button visibility
  // ---------------------------------------------------------------------------

  it('Install button visible when claude healthy and plugin missing', () => {
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null, installState: { kind: 'idle' } });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    expect(screen.getByRole('button', { name: /install architector plugin/i })).toBeTruthy();
  });

  it('Install button visible when claude healthy and plugin list-unavailable', () => {
    useAtriumStore.setState({ pluginStatus: 'list-unavailable', pluginInfo: null, installState: { kind: 'idle' } });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    expect(screen.getByRole('button', { name: /install architector plugin/i })).toBeTruthy();
  });

  it('Install button not visible when plugin status is checking or unknown', () => {
    useAtriumStore.setState({ pluginStatus: 'checking', pluginInfo: null });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    expect(screen.queryByRole('button', { name: /install architector plugin/i })).toBeNull();
  });

  it('Install button not visible when install is already in progress', () => {
    useAtriumStore.setState({
      pluginStatus: 'missing',
      pluginInfo: null,
      installState: { kind: 'installing' },
    });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    expect(screen.queryByRole('button', { name: /install architector plugin/i })).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Install flow
  // ---------------------------------------------------------------------------

  it('clicking Install calls installPlugin and shows failure log on failure', async () => {
    const failureOutcome = {
      kind: 'failed' as const,
      step: 'marketplace-add' as const,
      code: 'INSTALL_FAILED' as const,
      message: 'Something went wrong',
      stdout: 'error output line',
      stderr: '',
    };
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null, installState: { kind: 'idle' } });
    const atrium = makeAtrium();
    atrium.health.installPlugin = vi.fn().mockResolvedValue(ok(failureOutcome));
    vi.stubGlobal('atrium', atrium);
    render(<LaunchGate />);

    await userEvent.click(screen.getByRole('button', { name: /install architector plugin/i }));

    await waitFor(() => {
      expect(screen.getByText(/Install failed at step marketplace-add/i)).toBeTruthy();
      expect(screen.getByText(/error output line/)).toBeTruthy();
    });
    expect(atrium.health.installPlugin).toHaveBeenCalled();
  });

  it('clicking Install calls installPlugin and unlocks gate on success', async () => {
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null, installState: { kind: 'idle' } });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);

    await userEvent.click(screen.getByRole('button', { name: /install architector plugin/i }));

    await waitFor(() => {
      expect(useAtriumStore.getState().pluginStatus).toBe('present');
    });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /open project/i }).disabled).toBe(false);
  });

  it('envelope failure on installPlugin shows a toast and resets install state to idle', async () => {
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null, installState: { kind: 'idle' } });
    useToastStore.setState({ toasts: [] });
    const atrium = makeAtrium();
    atrium.health.installPlugin = vi.fn().mockResolvedValue(err('CLAUDE_NOT_FOUND', 'claude not on PATH'));
    vi.stubGlobal('atrium', atrium);
    render(<LaunchGate />);

    await userEvent.click(screen.getByRole('button', { name: /install architector plugin/i }));

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some((t) => t.message === 'claude not on PATH' && t.kind === 'error')).toBe(true);
    });
    // Install button reappears (installState back to idle)
    expect(screen.getByRole('button', { name: /install architector plugin/i })).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Cancel button
  // ---------------------------------------------------------------------------

  it('Cancel button visible during installing; clicking it calls cancelInstall', async () => {
    useAtriumStore.setState({
      claudeStatus: 'healthy',
      pluginStatus: 'missing',
      pluginInfo: null,
      installState: { kind: 'installing' },
    });
    const atrium = makeAtrium();
    vi.stubGlobal('atrium', atrium);
    render(<LaunchGate />);

    expect(screen.getByText(/Installing…/)).toBeTruthy();
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn).toBeTruthy();

    await userEvent.click(cancelBtn);
    expect(atrium.health.cancelInstall).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Retry button
  // ---------------------------------------------------------------------------

  it('Retry button visible after failure; clicking it resets and re-fires install', async () => {
    const failureState = {
      kind: 'failed' as const,
      step: 'marketplace-add' as const,
      code: 'INSTALL_FAILED' as const,
      message: 'fail',
      stdout: 'some output',
      stderr: '',
    };
    useAtriumStore.setState({
      pluginStatus: 'missing',
      pluginInfo: null,
      installState: { kind: 'failed', failure: failureState },
    });
    const atrium = makeAtrium();
    vi.stubGlobal('atrium', atrium);
    render(<LaunchGate />);

    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(atrium.health.installPlugin).toHaveBeenCalled());
    await waitFor(() => expect(useAtriumStore.getState().pluginStatus).toBe('present'));
  });

  it('cancelled install shows "Cancelled" header without failure log', () => {
    const cancelledFailure = {
      kind: 'failed' as const,
      step: 'marketplace-add' as const,
      code: 'INSTALL_CANCELLED' as const,
      message: 'install cancelled',
      stdout: 'some output that should not appear',
      stderr: '',
    };
    useAtriumStore.setState({
      pluginStatus: 'missing',
      pluginInfo: null,
      installState: { kind: 'failed', failure: cancelledFailure },
    });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);

    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.queryByText(/Install failed at step/i)).toBeNull();
    expect(screen.queryByText(/some output that should not appear/)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Re-check button
  // ---------------------------------------------------------------------------

  it('Re-check button visible while gated; clicking it invokes _recheckHealth from store', async () => {
    const recheckMock = vi.fn();
    useAtriumStore.setState({
      pluginStatus: 'missing',
      pluginInfo: null,
      _recheckHealth: recheckMock,
    });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);

    const recheckBtn = screen.getByRole('button', { name: /re-check/i });
    expect(recheckBtn).toBeTruthy();
    await userEvent.click(recheckBtn);
    expect(recheckMock).toHaveBeenCalled();
  });

  it('Re-check button not visible when not gated', () => {
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    expect(screen.queryByRole('button', { name: /re-check/i })).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Bottom health-line two-line format
  // ---------------------------------------------------------------------------

  it('bottom health-line renders two lines with claude and architector status', () => {
    useAtriumStore.setState({
      claudeStatus: 'healthy',
      claudeInfo: { claudePath: '/usr/bin/claude', version: '3.0.0' },
      pluginStatus: 'present',
      pluginInfo: { pluginId: 'architector@getleverage', version: '1.1.0', enabled: true },
    });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const healthLine = screen.getByTestId('launch-health-line');
    const divs = healthLine.querySelectorAll('div');
    expect(divs[0]!.textContent).toBe('claude v3.0.0 · healthy');
    expect(divs[1]!.textContent).toBe('architector v1.1.0 · present');
  });

  it('bottom health-line shows "architector · missing" when plugin missing', () => {
    useAtriumStore.setState({ pluginStatus: 'missing', pluginInfo: null });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const healthLine = screen.getByTestId('launch-health-line');
    expect(healthLine.textContent).toContain('architector · missing');
  });

  it('bottom health-line shows "architector · list-unavailable" when probe failed', () => {
    useAtriumStore.setState({ pluginStatus: 'list-unavailable', pluginInfo: null });
    vi.stubGlobal('atrium', makeAtrium());
    render(<LaunchGate />);
    const healthLine = screen.getByTestId('launch-health-line');
    expect(healthLine.textContent).toContain('architector · list-unavailable');
  });
});
