# Fix Result: Phase 6 review issues
_Date: 2026-04-28_

## Status: VERIFIED

## Issue Addressed

Three items from `review-6-report.md`:

1. **Should Fix** — `useConsultationTerminal.ts:13-25`: Panel-close-during-spawn left `status` stuck at `'spawning'` permanently. The original cleanup only set `cancelled = true`, preventing `setActive`/`setExited` but never resetting the stuck state. On re-open the guard `status !== 'idle'` blocked a new spawn, leaving the panel at "Connecting…" indefinitely until a project switch.

2. **Suggestion** — `ConsultationPanel.tsx:76-86`: ResizeObserver fired IPC `terminal.resize` on every callback with no debounce. Added 150ms debounce matching `TerminalModal`'s `RESIZE_DEBOUNCE_MS` approach.

3. **Suggestion** — `ConsultationPanel.tsx:121`: Anonymous `onClick` wrapper replaced with the stable Zustand action reference directly.

## What Was Changed

- `src/renderer/src/consultation/hooks/useConsultationTerminal.ts`
  - Added `useRef` import; selected `id` and `clearConsultationTerminal` from store.
  - Added `statusRef` (updated each render) so the guard reads current status without putting `status` in effect deps. This is necessary to avoid an infinite loop: `setSpawning()` changes `status` → re-run → cleanup → `clearConsultationTerminal()` → `status='idle'` → re-run → loop.
  - Changed effect deps from `[..., status]` to `[..., id, clearConsultationTerminal]`. Using `id` (not `status`) means: the effect re-triggers when `clearConsultationTerminal()` resets `id` to null (Restart flow), but NOT when `setSpawning()` changes only `status`.
  - Added conditional `clearConsultationTerminal()` in cleanup, guarded by `statusRef.current === 'spawning'`. This resets the stuck state when the panel closes mid-spawn, without killing an already-active terminal on ordinary panel close.
  - Added `eslint-disable-next-line react-hooks/exhaustive-deps` comment with explanation for the intentional `status`/`statusRef` split.

- `src/renderer/src/consultation/ConsultationPanel.tsx`
  - Added `useCallback` to React imports.
  - Added `RESIZE_DEBOUNCE_MS = 150` constant (matches `TerminalModal`).
  - Added `resizeTimerRef` for the debounce timer handle.
  - Extracted `handleResize` as a `useCallback([id])` that debounces `fit()` + `terminal.resize()` by 150ms; ResizeObserver effect uses `handleResize` in deps.
  - Changed `onClick={() => clearConsultationTerminal()}` to `onClick={clearConsultationTerminal}`.

## Verification

- `npx tsc --noEmit` — clean, no errors
- `npx vitest run src/renderer/src/consultation` — 25 tests, all pass
- `npx vitest run` — 5 pre-existing failures in dead-code `src/main/consultation/` service tests and `src/main/fileSync/` timing tests (confirmed pre-existing by stash-check); all 907 other tests pass, no new failures
