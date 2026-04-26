import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useRef, type RefObject } from 'react';
import { useAutoCloseTimer } from '../hooks/useAutoCloseTimer';

interface MountResult {
  panel: HTMLDivElement;
  onExpire: ReturnType<typeof vi.fn>;
  unmount: () => void;
}

interface MountOpts {
  enabled?: boolean;
  timeoutMs?: number;
}

function mountWithPanel(opts: MountOpts = {}): MountResult {
  const enabled = opts.enabled ?? true;
  const timeoutMs = opts.timeoutMs;
  const panel = document.createElement('div');
  document.body.appendChild(panel);
  const onExpire = vi.fn();

  const { unmount } = renderHook(() => {
    const ref = useRef<HTMLElement | null>(panel);
    useAutoCloseTimer(ref, { enabled, timeoutMs, onExpire });
  });

  return {
    panel,
    onExpire,
    unmount: () => {
      unmount();
      panel.remove();
    },
  };
}

function clickOutside(): void {
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

function clickInside(panel: HTMLElement): void {
  panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAutoCloseTimer', () => {
  it('arms on outside click and fires onExpire after 10s', () => {
    const { onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside();
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('inside-interaction (mousedown on panel) cancels the armed timer', () => {
    const { panel, onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
      clickInside(panel);
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(onExpire).not.toHaveBeenCalled();
    unmount();
  });

  it('second outside-click while armed is a no-op (timer keeps original arm time)', () => {
    const { onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(5_000); // total 10s from first click → expire
    });
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10_000); // would have been second-click expiry; must NOT re-fire
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('re-arms after an inside-interaction cancel and a fresh outside-click', () => {
    const { panel, onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside(); // t=0 arm
    });
    act(() => {
      vi.advanceTimersByTime(3_000); // t=3
      clickInside(panel); // cancel
    });
    act(() => {
      vi.advanceTimersByTime(5_000); // t=8
      clickOutside(); // re-arm at t=8 → expires t=18
    });
    act(() => {
      vi.advanceTimersByTime(9_000); // t=17
    });
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000); // t=18 → expire
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('cleanup clears the armed timer on unmount', () => {
    const { onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside();
    });
    unmount();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onExpire).not.toHaveBeenCalled();
  });

  it('disabled: outside-click does not arm a timer', () => {
    const { onExpire, unmount } = mountWithPanel({ enabled: false });

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onExpire).not.toHaveBeenCalled();
    unmount();
  });

  it('respects custom timeoutMs', () => {
    const { onExpire, unmount } = mountWithPanel({ timeoutMs: 2_000 });

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('panel keydown clears the armed timer', () => {
    const { panel, onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(onExpire).not.toHaveBeenCalled();
    unmount();
  });

  it('keydown outside the panel does NOT cancel the armed timer', () => {
    const { onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('panel scroll clears the armed timer', () => {
    const { panel, onExpire, unmount } = mountWithPanel();

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
      panel.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(onExpire).not.toHaveBeenCalled();
    unmount();
  });

  it('still cancels via inside-keydown when panelRef.current starts null and is attached after mount', () => {
    // Reproduces the race described in the Phase 8 review: previously, the
    // effect captured panelRef.current at setup time, so a panel that mounted
    // later was never wired up — only document `mousedown` cancelled the timer.
    const onExpire = vi.fn();
    const ref: RefObject<HTMLElement | null> = { current: null };

    const { unmount } = renderHook(() => {
      useAutoCloseTimer(ref, { enabled: true, onExpire });
    });

    // Panel mounts after the hook.
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    ref.current = panel;

    act(() => {
      clickOutside();
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(onExpire).not.toHaveBeenCalled();
    unmount();
    panel.remove();
  });
});
