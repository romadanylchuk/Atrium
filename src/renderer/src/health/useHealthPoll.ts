import { useCallback, useEffect, useRef } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';

const POLL_INTERVAL_MS = 30_000;
const FAILURE_THRESHOLD = 3;

export function useHealthPoll(): void {
  const setClaude = useAtriumStore((s) => s._setClaude);
  const setPlugin = useAtriumStore((s) => s._setPlugin);
  const setRecheckHealth = useAtriumStore((s) => s._setRecheckHealth);
  const inFlightRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);

  // Phase A: definitive launch probe — claude then plugin sequentially. No hysteresis.
  // stable: all closed-over values are refs or Zustand actions
  async function runPhaseA(): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setClaude({ status: 'checking', info: null });
    setPlugin({ status: 'checking', info: null });
    try {
      const claudeResult = await window.atrium.health.checkClaude();
      if (claudeResult.ok) {
        consecutiveFailuresRef.current = 0;
        setClaude({ status: 'healthy', info: claudeResult.data });
        const pluginResult = await window.atrium.health.checkPlugin();
        if (pluginResult.ok) {
          setPlugin({ status: 'present', info: pluginResult.data });
        } else {
          const code = pluginResult.error.code;
          if (code === 'PLUGIN_NOT_FOUND') {
            setPlugin({ status: 'missing', info: null });
          } else if (code === 'PLUGIN_LIST_UNAVAILABLE') {
            setPlugin({ status: 'list-unavailable', info: null });
          } else {
            setPlugin({ status: 'unknown', info: null });
          }
        }
      } else {
        // 'unknown' distinguishes "skipped because claude failed" from 'checking' (still in flight)
        setClaude({ status: 'unreachable', info: null });
        setPlugin({ status: 'unknown', info: null });
      }
    } catch {
      setClaude({ status: 'unreachable', info: null });
      setPlugin({ status: 'unknown', info: null });
    } finally {
      inFlightRef.current = false;
    }
  }

  // Phase B: periodic claude-only poll with 3-failure hysteresis. Plugin is not re-probed.
  // stable: all closed-over values are refs or Zustand actions
  async function runPhaseBPoll(): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await window.atrium.health.checkClaude();
      if (result.ok) {
        consecutiveFailuresRef.current = 0;
        setClaude({ status: 'healthy', info: result.data });
      } else {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= FAILURE_THRESHOLD) {
          setClaude({ status: 'unreachable', info: null });
        }
      }
    } catch {
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= FAILURE_THRESHOLD) {
        setClaude({ status: 'unreachable', info: null });
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  // Stable reference published to the store so LaunchGate can invoke it without prop-drilling.
  // All closed-over values (refs, zustand actions) are stable across renders.
  const recheck = useCallback((): void => {
    void runPhaseA();
  }, []);

  useEffect(() => {
    setRecheckHealth(recheck);
    void runPhaseA();

    // interval fires at 30 s; Phase A always completes before the first tick
    const intervalId = setInterval(() => {
      void runPhaseBPoll();
    }, POLL_INTERVAL_MS);

    function handleFocus(): void {
      void runPhaseBPoll();
    }
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      setRecheckHealth(null);
    };
  }, []);
}
