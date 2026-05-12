# Review Report: Phase 6
_Date: 2026-04-28_

## Status: HAS_ISSUES

## Must Fix

None.

## Should Fix

- **`src/renderer/src/consultation/hooks/useConsultationTerminal.ts:13-25`** — Panel-close-during-spawn leaves status stuck at `'spawning'` permanently.
  
  When the effect fires: `setSpawning()` runs synchronously, then the IPC call is dispatched. If the component unmounts or deps change before the promise resolves, cleanup sets `cancelled = true`, which correctly prevents `setActive`/`setExited` — but `setSpawning()` already fired. Status stays `'spawning'`. On re-open, the guard `status !== 'idle'` blocks a new spawn attempt, so the panel shows "Connecting…" indefinitely until the user switches projects (which calls `clearConsultationTerminal()`).

  The window is narrow but real: open panel → network or pty setup is slow → close panel before promise resolves → status stuck.

  → Select `clearConsultationTerminal` in the hook alongside the other actions. In the cleanup, call `clearConsultationTerminal()` when the cancellation flag is set (i.e., when the panel closed while a spawn was in-flight). This also handles the already-spawned-but-orphaned pty by killing it via the existing `clearConsultationTerminal` fire-and-forget path.

## Suggestions

- **`src/renderer/src/consultation/ConsultationPanel.tsx:76-86`** — ResizeObserver fires IPC `terminal.resize(id, cols, rows)` on every callback with no debounce. `TerminalModal` uses a 150ms debounce (`RESIZE_DEBOUNCE_MS`) to absorb rapid size changes during panel animations or window resizes. The consultation panel is in a static flex layout, so the risk is lower, but the IPC cost pattern is the same.
  → Add a `resizeTimerRef` and debounce the `fit()` + `resize()` call by 150ms, matching `TerminalModal`'s approach.

- **`src/renderer/src/consultation/ConsultationPanel.tsx:121`** — `onClick={() => clearConsultationTerminal()}` wraps a stable Zustand action in an anonymous closure, allocating a new function on each render. TerminalModal uses the same wrapper style (so this is consistent with the codebase), but it is slightly cleaner without the wrapper.
  → `onClick={clearConsultationTerminal}` — the action is stable (Zustand guarantees reference stability for actions).

## Summary

The phase 6 code is clean and well-structured. The xterm mount strategy (keyed on `id`), the `cancelled`-flag pattern, and the `ConsultationRegion` null guard are all correctly implemented and tested. The one behavioral issue worth fixing before shipping is the stuck-spawning state when the panel closes mid-flight — it is a rare race but the fix is a two-line addition to the cleanup. The debounce and onClick suggestions are polish items.
