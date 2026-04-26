import { useEffect, useRef, type RefObject } from 'react';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface UseAutoCloseTimerOpts {
  /** Disabled hook is fully inert: no listeners, no timer. */
  enabled: boolean;
  /** Time the panel stays open after the user clicks outside. Defaults to 10s. */
  timeoutMs?: number;
  /** Called once when the armed timer expires. */
  onExpire(): void;
}

/**
 * Auto-close state machine (plan §Phase 8 supplement §4):
 *
 *   idle  + outsideClick      → armed (set timer)
 *   armed + insideInteraction → idle  (clear timer)
 *   armed + outsideClick      → no-op (timer keeps original arm time)
 *   armed + timer expires     → idle  + onExpire()
 *   cleanup                   → clear timer
 */
export function useAutoCloseTimer(
  panelRef: RefObject<HTMLElement | null>,
  opts: UseAutoCloseTimerOpts,
): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!opts.enabled) return;

    let armedTimer: ReturnType<typeof setTimeout> | null = null;

    function clearArmed(): void {
      if (armedTimer !== null) {
        clearTimeout(armedTimer);
        armedTimer = null;
      }
    }

    function isInsidePanel(target: EventTarget | null): boolean {
      const node = panelRef.current;
      if (node === null || !(target instanceof Node)) return false;
      return node.contains(target);
    }

    function handleMouseDown(ev: MouseEvent): void {
      if (isInsidePanel(ev.target)) {
        clearArmed();
        return;
      }
      if (armedTimer === null) {
        const ms = optsRef.current.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        armedTimer = setTimeout(() => {
          armedTimer = null;
          optsRef.current.onExpire();
        }, ms);
      }
    }

    function handleInsideInteraction(ev: Event): void {
      if (isInsidePanel(ev.target)) clearArmed();
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleInsideInteraction, true);
    document.addEventListener('scroll', handleInsideInteraction, true);

    return () => {
      clearArmed();
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleInsideInteraction, true);
      document.removeEventListener('scroll', handleInsideInteraction, true);
    };
  }, [opts.enabled, panelRef]);
}
