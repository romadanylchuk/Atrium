import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useHealthPoll } from '../useHealthPoll';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { ok, err } from '@shared/result';

const DEFAULT_PLUGIN_INFO = { pluginId: 'architector@getleverage' as const, version: '1.0.0', enabled: true };

function makeAtrium(
  checkClaude: ReturnType<typeof vi.fn>,
  checkPlugin: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(ok(DEFAULT_PLUGIN_INFO)),
) {
  return {
    health: { checkClaude, checkPlugin, installPlugin: vi.fn(), cancelInstall: vi.fn() },
    project: {},
    terminal: {},
    layout: {},
    skill: {},
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  useAtriumStore.setState({
    claudeStatus: 'checking',
    claudeInfo: null,
    pluginStatus: 'checking',
    pluginInfo: null,
    _recheckHealth: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Helper: flush two sequential async operations (claude probe + plugin probe in Phase A)
async function flushPhaseA(): Promise<void> {
  await act(async () => {
    await Promise.resolve(); // resolve checkClaude
    await Promise.resolve(); // resolve checkPlugin
  });
}

describe('useHealthPoll', () => {
  describe('Phase A (launch probe)', () => {
    it('sets claudeStatus healthy with claudeInfo when checkClaude returns ok', async () => {
      const claudeInfo = { claudePath: '/usr/bin/claude', version: '1.2.3' };
      const checkClaude = vi.fn().mockResolvedValue(ok(claudeInfo));
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());
      await flushPhaseA();

      const state = useAtriumStore.getState();
      expect(state.claudeStatus).toBe('healthy');
      expect(state.claudeInfo).toEqual(claudeInfo);
    });

    it('sets pluginStatus present with pluginInfo when both probes succeed', async () => {
      const checkClaude = vi.fn().mockResolvedValue(ok({ claudePath: '/usr/bin/claude', version: '1.0' }));
      const checkPlugin = vi.fn().mockResolvedValue(ok(DEFAULT_PLUGIN_INFO));
      vi.stubGlobal('atrium', makeAtrium(checkClaude, checkPlugin));

      renderHook(() => useHealthPoll());
      await flushPhaseA();

      const state = useAtriumStore.getState();
      expect(state.pluginStatus).toBe('present');
      expect(state.pluginInfo).toEqual(DEFAULT_PLUGIN_INFO);
      expect(checkPlugin).toHaveBeenCalledTimes(1);
    });

    it('sets claudeStatus unreachable immediately on single claude failure (no hysteresis at launch)', async () => {
      const checkClaude = vi.fn().mockResolvedValue(err('CLAUDE_NOT_FOUND', 'not found'));
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());
      await act(async () => { await Promise.resolve(); });

      expect(useAtriumStore.getState().claudeStatus).toBe('unreachable');
    });

    it('sets pluginStatus unknown when claude fails and skips plugin probe', async () => {
      const checkClaude = vi.fn().mockResolvedValue(err('CLAUDE_NOT_FOUND', 'not found'));
      const checkPlugin = vi.fn();
      vi.stubGlobal('atrium', makeAtrium(checkClaude, checkPlugin));

      renderHook(() => useHealthPoll());
      await act(async () => { await Promise.resolve(); });

      expect(useAtriumStore.getState().pluginStatus).toBe('unknown');
      expect(checkPlugin).not.toHaveBeenCalled();
    });

    it('maps PLUGIN_NOT_FOUND → pluginStatus missing', async () => {
      const checkClaude = vi.fn().mockResolvedValue(ok({ claudePath: '/usr/bin/claude', version: '1.0' }));
      const checkPlugin = vi.fn().mockResolvedValue(err('PLUGIN_NOT_FOUND', 'not found'));
      vi.stubGlobal('atrium', makeAtrium(checkClaude, checkPlugin));

      renderHook(() => useHealthPoll());
      await flushPhaseA();

      expect(useAtriumStore.getState().pluginStatus).toBe('missing');
    });

    it('maps PLUGIN_LIST_UNAVAILABLE → pluginStatus list-unavailable', async () => {
      const checkClaude = vi.fn().mockResolvedValue(ok({ claudePath: '/usr/bin/claude', version: '1.0' }));
      const checkPlugin = vi.fn().mockResolvedValue(err('PLUGIN_LIST_UNAVAILABLE', 'unavailable'));
      vi.stubGlobal('atrium', makeAtrium(checkClaude, checkPlugin));

      renderHook(() => useHealthPoll());
      await flushPhaseA();

      expect(useAtriumStore.getState().pluginStatus).toBe('list-unavailable');
    });

    it('maps PLUGIN_PROBE_TIMEOUT (other error) → pluginStatus unknown', async () => {
      const checkClaude = vi.fn().mockResolvedValue(ok({ claudePath: '/usr/bin/claude', version: '1.0' }));
      const checkPlugin = vi.fn().mockResolvedValue(err('PLUGIN_PROBE_TIMEOUT', 'timeout'));
      vi.stubGlobal('atrium', makeAtrium(checkClaude, checkPlugin));

      renderHook(() => useHealthPoll());
      await flushPhaseA();

      expect(useAtriumStore.getState().pluginStatus).toBe('unknown');
    });
  });

  describe('Phase B (periodic claude-only poll)', () => {
    it('does not flip to unreachable after two consecutive Phase B failures', async () => {
      const claudeInfo = { claudePath: '/usr/bin/claude', version: '1.0' };
      const checkClaude = vi.fn()
        .mockResolvedValueOnce(ok(claudeInfo)) // Phase A
        .mockResolvedValueOnce(err('CLAUDE_NOT_FOUND', 'not found')) // Phase B tick 1
        .mockResolvedValueOnce(err('CLAUDE_NOT_FOUND', 'not found')) // Phase B tick 2
        .mockResolvedValue(ok(claudeInfo)); // Phase B tick 3 (success)
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());

      // Phase A completes
      await flushPhaseA();
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');

      // Phase B failure 1
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');

      // Phase B failure 2
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');

      // Phase B success — counter resets
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');
    });

    it('flips back to healthy after Phase B tick succeeds following Phase A failure', async () => {
      const claudeInfo = { claudePath: '/usr/bin/claude', version: '1.0' };
      const checkClaude = vi.fn()
        .mockResolvedValueOnce(err('CLAUDE_NOT_FOUND', 'not found')) // Phase A fails
        .mockResolvedValue(ok(claudeInfo)); // Phase B succeeds
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());

      // Phase A completes with failure → unreachable
      await act(async () => { await Promise.resolve(); });
      expect(useAtriumStore.getState().claudeStatus).toBe('unreachable');

      // Phase B tick 1 succeeds → back to healthy
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');
    });

    it('flips to unreachable after three consecutive Phase B failures', async () => {
      const claudeInfo = { claudePath: '/usr/bin/claude', version: '1.0' };
      const checkClaude = vi.fn()
        .mockResolvedValueOnce(ok(claudeInfo)) // Phase A
        .mockResolvedValue(err('CLAUDE_NOT_FOUND', 'not found')); // Phase B failures
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());

      // Phase A completes
      await flushPhaseA();
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');

      // Phase B failure 1
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');

      // Phase B failure 2
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');

      // Phase B failure 3 → unreachable
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(useAtriumStore.getState().claudeStatus).toBe('unreachable');
    });
  });

  describe('recheck callback', () => {
    it('registers _recheckHealth on mount and clears it on unmount', async () => {
      const checkClaude = vi.fn().mockResolvedValue(ok({ claudePath: '/usr/bin/claude', version: '1.0' }));
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      const { unmount } = renderHook(() => useHealthPoll());
      await act(async () => { await Promise.resolve(); });

      expect(useAtriumStore.getState()._recheckHealth).toBeTypeOf('function');

      unmount();

      expect(useAtriumStore.getState()._recheckHealth).toBeNull();
    });

    it('recheck while probe is in-flight is swallowed: checkClaude called exactly once', async () => {
      let resolveFirst!: (v: unknown) => void;
      const pendingPromise = new Promise((r) => { resolveFirst = r; });
      const checkClaude = vi.fn().mockReturnValue(pendingPromise);
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());

      // Allow Phase A to start (in-flight, not resolved)
      await act(async () => { await Promise.resolve(); });

      const recheck = useAtriumStore.getState()._recheckHealth!;
      act(() => { recheck(); });

      // checkClaude must still have been called exactly once
      expect(checkClaude).toHaveBeenCalledTimes(1);

      // Cleanup
      resolveFirst(ok({ claudePath: '/bin/claude', version: '1.0' }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    });

    it('calling _recheckHealth re-runs Phase A, re-probing both claude and plugin', async () => {
      const claudeInfo = { claudePath: '/usr/bin/claude', version: '1.0' };
      const checkPlugin = vi.fn().mockResolvedValue(ok(DEFAULT_PLUGIN_INFO));
      const checkClaude = vi.fn().mockResolvedValue(ok(claudeInfo));
      vi.stubGlobal('atrium', makeAtrium(checkClaude, checkPlugin));

      renderHook(() => useHealthPoll());

      // Wait for Phase A to complete
      await flushPhaseA();
      expect(checkClaude).toHaveBeenCalledTimes(1);
      expect(checkPlugin).toHaveBeenCalledTimes(1);

      const recheck = useAtriumStore.getState()._recheckHealth!;
      expect(recheck).not.toBeNull();

      // Recheck re-runs Phase A
      await act(async () => {
        recheck();
        await Promise.resolve(); // flush checkClaude
        await Promise.resolve(); // flush checkPlugin
      });

      expect(checkClaude).toHaveBeenCalledTimes(2);
      expect(checkPlugin).toHaveBeenCalledTimes(2);
      expect(useAtriumStore.getState().claudeStatus).toBe('healthy');
      expect(useAtriumStore.getState().pluginStatus).toBe('present');
    });
  });

  describe('in-flight guard and focus events (Phase B)', () => {
    it('single in-flight guard: second probe skipped when first is pending', async () => {
      let resolveFirst!: (v: unknown) => void;
      const pendingPromise = new Promise((r) => { resolveFirst = r; });
      const checkClaude = vi.fn().mockReturnValue(pendingPromise);
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());

      // Allow the initial probe to start (Phase A in-flight)
      await act(async () => { await Promise.resolve(); });

      // Advance 30s — should NOT fire second probe while first is in-flight
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      await act(async () => { await Promise.resolve(); });

      expect(checkClaude).toHaveBeenCalledTimes(1);

      // Cleanup: resolve the pending promise
      resolveFirst(ok({ claudePath: '/bin/claude', version: '1.0' }));
      await act(async () => {
        await Promise.resolve(); // checkClaude resolves → Phase A calls checkPlugin
        await Promise.resolve(); // checkPlugin resolves → Phase A complete
      });
    });

    it('focus event triggers an immediate Phase B probe', async () => {
      const claudeInfo = { claudePath: '/usr/bin/claude', version: '2.0' };
      const checkClaude = vi.fn().mockResolvedValue(ok(claudeInfo));
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());

      // Wait for Phase A to complete fully (both claude + plugin)
      await flushPhaseA();
      expect(checkClaude).toHaveBeenCalledTimes(1);

      // Simulate focus → triggers Phase B poll
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await Promise.resolve();
      });

      expect(checkClaude).toHaveBeenCalledTimes(2);
    });

    it('focus event does nothing when a probe is already in-flight', async () => {
      let resolveFirst!: (v: unknown) => void;
      const pendingPromise = new Promise((r) => { resolveFirst = r; });
      const checkClaude = vi.fn().mockReturnValue(pendingPromise);
      vi.stubGlobal('atrium', makeAtrium(checkClaude));

      renderHook(() => useHealthPoll());

      // Initial probe is in-flight (not resolved)
      await act(async () => { await Promise.resolve(); });

      // Focus while in-flight
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await Promise.resolve();
      });

      expect(checkClaude).toHaveBeenCalledTimes(1);

      // Cleanup
      resolveFirst(ok({ claudePath: '/bin/claude', version: '1.0' }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    });
  });
});
