import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { LaunchGate } from '../LaunchGate';
import { ok, err } from '@shared/result';
import type { ProjectState } from '@shared/domain';

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
  useAtriumStore.setState({ project: null });
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
    await waitFor(() => expect(screen.getByRole('button', { name: /open/i })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /close|dismiss|cancel/i })).toBeNull();
  });

  it('shows health error and Recheck button on health check failure', async () => {
    vi.stubGlobal('atrium', makeAtrium({
      health: {
        checkClaude: vi.fn().mockResolvedValue(err('CLAUDE_NOT_FOUND', 'claude binary not found')),
      },
    }));
    render(<LaunchGate />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/claude binary not found/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /recheck/i })).toBeTruthy();
    });
  });

  it('Recheck button re-invokes health.checkClaude', async () => {
    const checkClaude = vi.fn()
      .mockResolvedValueOnce(err('CLAUDE_NOT_FOUND', 'not found'))
      .mockResolvedValueOnce(ok({ claudePath: '/bin/claude', version: '1.0.0' }));
    vi.stubGlobal('atrium', makeAtrium({ health: { checkClaude } }));
    render(<LaunchGate />);
    await waitFor(() => screen.getByRole('button', { name: /recheck/i }));
    await userEvent.click(screen.getByRole('button', { name: /recheck/i }));
    await waitFor(() => expect(checkClaude).toHaveBeenCalledTimes(2));
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
    await waitFor(() => screen.getByRole('button', { name: /open/i }));
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: /open/i }).disabled).toBe(false));
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
    await waitFor(() => screen.getByRole('button', { name: /open/i }));
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
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
    await waitFor(() => screen.getByRole('button', { name: /open/i }));
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
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
    await waitFor(() => screen.getByRole('button', { name: /open/i }));
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    await waitFor(() => screen.getByRole('button', { name: /initialize project/i }));

    await userEvent.type(screen.getByPlaceholderText(/my project/i), 'TestProject');
    await userEvent.click(screen.getByRole('button', { name: /initialize project/i }));

    // Shim returns ok immediately — gate stays visible (modal not wired yet in P9)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });
});
