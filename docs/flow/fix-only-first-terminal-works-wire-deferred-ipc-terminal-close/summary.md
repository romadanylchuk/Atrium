# Feature Summary: Fix "only first terminal works" — wire deferred IPC.terminal.close
_Archived: 2026-04-22_
_Status: DONE_

## Goal

After the first terminal session ended (via Kill or natural exit) and the user dismissed the modal, every subsequent spawn failed with the toast `Skill failed: terminal not idle — already active or transitioning`. The renderer's Close path reset only the renderer store; the main-process `TerminalManager` stayed stuck in `exited` forever because the IPC channel that would drive `closeAfterExit(id)` was never wired up. This feature landed that deferred channel so the main-side state machine actually returns to `idle` when the user dismisses an exited modal, unblocking the second (and every subsequent) terminal spawn.

## What Was Built

### Shared / preload surface
- `src/shared/ipc.ts` — added `close: 'terminal:close'` to `IPC.terminal`, inserted after `kill`.
- `src/preload/api.ts` — added `close(id: TerminalId): Promise<Result<void, TerminalErrorCode>>` to the `terminal` method group of `AtriumAPI`.
- `src/preload/index.ts` — implemented the wrapper: `close(id) { return ipcRenderer.invoke(IPC.terminal.close, id); }`.

### Main-process handler
- `src/main/ipc/terminal.ts` — imported `ok` from `@shared/result`; registered `safeHandle(IPC.terminal.close, …)` after the existing `kill` registration. Handler calls `manager.closeAfterExit(id)`; on `ok` returns the result unchanged; on `err` emits one `console.warn` line (with `code` and `message`) and returns `ok(undefined)` so every failure is swallowed from the renderer's perspective. Added a one-line header note under "Invoke channels".
- `src/main/ipc/__tests__/register.test.ts` — Phase 1 temporarily excluded `IPC.terminal.close` via `PUSH_ONLY_CHANNELS`; Phase 2 removed that exclusion, added `closeAfterExit` to `fakeTerminalManager`, and appended `IPC.terminal.close` to the `invokeChannels` list in the `invoke channels are in handleMap` test.

### Renderer store
- `src/renderer/src/store/atriumStore.ts` — replaced `_autoDismissExited` body: capture `currentId` from `get().terminal.id` before any `set()`, perform `set({ terminal: { …, status: 'closing' } })`, fire `void window.atrium.terminal.close(currentId)` between the two `set()` calls (guarded by `currentId !== null`), then `set({ terminal: defaultTerminalSlice() })` resets the slice to `idle`. Two-`set()` ordering preserved so the existing `switchProject — auto-dismiss ordering` test stays green. `LEGAL_TERMINAL_TRANSITIONS` untouched.

### Tests
- `src/main/ipc/__tests__/wiredHandlers.test.ts` — 3 new cases under `terminal wired handlers`: close dispatches to `manager.closeAfterExit` and returns ok; close swallows `KILL_FAILED` and returns ok; close swallows `INVALID_HANDLE` and returns ok. Added `closeAfterExit: vi.fn()` to the other manager stubs (spawn/kill/write/resize) so the existing suite still type-checks.
- `src/renderer/src/store/__tests__/atriumStore.test.ts` — new `describe('_autoDismissExited — IPC wiring', ...)` block with 3 cases: close called with id on exited-with-id dismiss; close not called on null-id dismiss; ordering proof that close fires between the `closing` set and the `idle` set (subscribed log asserts `callCount === 0` at the `closing` snapshot and `>= 1` at the `idle` snapshot). Imports extended to include `afterEach` and `vi`.
- `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx` — extended `makeAtrium()` to include `close: closeMock`; added `closeMock.mockClear()` to `resetStore()` so the module-level mock does not leak across tests; added 2 new `it` cases: Close button triggers `terminal.close(id)`; Escape key triggers `terminal.close(id)` via a `new KeyboardEvent('keydown', { key: 'Escape' })` dispatch on `window` inside `act(...)`.
- `e2e/scenario3-terminal.spec.ts` — extended the existing scenario (no new spec file) with a second-spawn regression section after the first kill/close/modal-gone block: reset `window.__e2e_terminalOutput` to `''`, click Explore again, assert modal visible, poll the output global for `HELLO_ATRIUM`, then kill and close the second terminal and assert modal gone.

## Phases Completed

| Phase | Name | Key Outcome |
|-------|------|-------------|
| 1     | Shared channel + preload bridge | `IPC.terminal.close` constant, `AtriumAPI.terminal.close` typing, preload wrapper. No behavior change yet. |
| 2     | Main-process handler | `safeHandle(IPC.terminal.close, …)` drives `manager.closeAfterExit(id)`; errors swallowed with `console.warn`, always returns `ok(undefined)`. 3 new wired-handler tests. |
| 3     | Renderer store wiring | `_autoDismissExited()` now fires `terminal.close(id)` between its two `set()` calls (null-id guarded). End-to-end bug fixed at this point. |
| 4a    | Renderer store tests | 3 new cases in `atriumStore.test.ts` (`_autoDismissExited — IPC wiring`). |
| 4b    | Renderer modal tests | 2 new cases in `TerminalModal.test.tsx` (Close button + Escape fire the IPC). |
| 4c    | E2E regression | Second-spawn section added to `scenario3-terminal.spec.ts`; scenario count unchanged. |

## Edge Cases Handled

1. **Main already `idle` when close IPC arrives** — `closeAfterExit` rejects with `KILL_FAILED / 'terminal not in exited state'`; main handler swallows and emits `console.warn`; renderer `void`s the promise. No user-visible toast. Locked in by `wiredHandlers.test.ts > terminal:close swallows KILL_FAILED from closeAfterExit and returns ok`.
2. **Unknown / stale terminal id** — `closeAfterExit` returns `INVALID_HANDLE`; same swallow path. Locked in by `terminal:close swallows INVALID_HANDLE and returns ok`.
3. **Window destroyed between exit and close IPC** — `closeAfterExit` only touches `#pty?.kill()` inside try/catch and state transitions; no `webContents.send` path; no crash.
4. **Close IPC arrives while main is still `active` (race)** — `closeAfterExit` rejects with `KILL_FAILED`; handler swallows; renderer already `void`s. Race avoided by construction: `_autoDismissExited` is only invoked from `exited`-state UI (Close button, Escape, init-flow completion, `switchProject`) after `onExit` has fired.
5. **Renderer transition guard** — `LEGAL_TERMINAL_TRANSITIONS` at `atriumStore.ts` still permits `exited → closing → idle`; unchanged. Confirmed by the pre-existing `switchProject.test.ts` auto-dismiss-ordering test staying green.
6. **Test coverage bullet from brief** — covered at main-handler, renderer-store, renderer-modal, and E2E layers. (An additional manager-level "spawn-after-close" unit test was intentionally not added — the scenario 3 E2E regression section exercises the same end-to-end invariant. See Notes.)

## Deviations From Original Plan

None reported by any phase result.

One small structural observation worth recording: Phase 1 needed a temporary edit to `src/main/ipc/__tests__/register.test.ts` to add `IPC.terminal.close` to `PUSH_ONLY_CHANNELS`. The register test enumerates all `IPC.*` channel constants and asserts each has a handler; without the temporary exclusion, adding the constant in Phase 1 without the handler would have broken that existing test. Phase 2 removed the exclusion when the handler landed. Not a deviation from the plan's intent, but not explicitly listed in the plan's Phase-1 file-touched set either.

## Fixes Applied

None — no `/flow:implement fix "…"` runs occurred during this cycle.

## Out of Scope (Not Implemented)

- Kill → exited → Close two-step UX remains unchanged (not collapsed into single-click close).
- Multi-terminal support — `TerminalManager` stays single-terminal-at-a-time; no slot allocation, no queueing.
- No change to the 5-state machine itself (states, `canTransition`, or `LEGAL_TERMINAL_TRANSITIONS`).
- No auto-close on exit — user dismiss remains explicit; `pty.onExit` in main does not trigger the renderer dismiss logic.
- No change to skill-compose / spawn arg construction (the bug was close-side state reset, not spawn logic).
- No user-visible retry / toast / diagnostics around Close — fire-and-forget on the renderer; swallow-and-warn on main.

## Review Findings

No `/flow:review` pass was run during this feature cycle. The pipeline went brief → plan → 6 phase implementations → final check, without an explicit review step.

## Final Check Outcome

Verdict **PASSED**.

- All six phases' code at HEAD matches the plan — main handler error-swallow rule and renderer two-`set()` + synchronous IPC call ordering both verified against the exact code.
- All five brief scenarios walked through against actual code at HEAD and verified: (A) Kill → Close → re-spawn, (B) natural exit → Close → re-spawn, (C) Nth repeated cycle, (D) dismiss via `switchProject`, (E) dismiss via init-flow completion.
- All six edge cases verified.
- Out-of-scope invariants preserved (two-step Kill/Close UX, single-terminal, 5-state machine, no auto-close, spawn logic untouched, no user-visible close error UX).
- Gates at HEAD: `npm run typecheck` clean; `npm run lint` clean; `npm run test` 592 passed / 1 skipped / 1 pre-existing unrelated failure (see Notes); `npm run build` produced `out/main`, `out/preload`, `out/renderer` cleanly; `npm run test:e2e` 3/3 scenarios passed in 19.0s.
- No regressions introduced.

## Files Changed

- `src/shared/ipc.ts` — added `IPC.terminal.close = 'terminal:close'` constant.
- `src/preload/api.ts` — typed `terminal.close(id)` on `AtriumAPI`.
- `src/preload/index.ts` — preload wrapper that forwards to `ipcRenderer.invoke(IPC.terminal.close, id)`.
- `src/main/ipc/terminal.ts` — registered `safeHandle(IPC.terminal.close, …)` with error-swallow + `console.warn`; added header-comment entry.
- `src/main/ipc/__tests__/register.test.ts` — added `IPC.terminal.close` to the registered-invoke-channels list and `closeAfterExit` to `fakeTerminalManager` (Phase 1 temporarily used `PUSH_ONLY_CHANNELS` exclusion, which Phase 2 removed).
- `src/main/ipc/__tests__/wiredHandlers.test.ts` — 3 new close-handler cases; existing spawn/kill/write/resize stubs gained `closeAfterExit: vi.fn()`.
- `src/renderer/src/store/atriumStore.ts` — rewired `_autoDismissExited()` to fire IPC between its two `set()` calls (null-id guarded).
- `src/renderer/src/store/__tests__/atriumStore.test.ts` — new `_autoDismissExited — IPC wiring` describe block with 3 cases; imports extended with `afterEach`, `vi`.
- `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx` — extended `makeAtrium()` with `close` mock, added `closeMock.mockClear()` to `resetStore()`, added 2 new cases for Close button and Escape triggering the IPC.
- `e2e/scenario3-terminal.spec.ts` — extended with a second-spawn regression section (no new spec file, preserving the three-surgical-scenarios rule from `CLAUDE.md`).

## Notes

- **Pre-existing unrelated test failure carry-over.** `src/main/fileSync/__tests__/watcherManager.reparse-contract.test.ts > WatcherManager — onReparse rejection is swallowed > rejection from onReparse does not crash and send is never called` fails with `expected "spy" to be called 1 times, but got 0 times`. Confirmed unrelated to this feature via `git log` on the watcher files (last touches were `b78d89f stage-3: terminal pipeline` and `6a5e308 stage-4+5: state & canvas + interaction UX`, both predating this cycle). No code under `src/main/fileSync/**` was modified here. Final check flagged it as a separate-ticket follow-up.
- **Renderer bundle size warning.** The Phase 4c build produced a renderer bundle of 1,565.80 kB — over Vite's default chunk-size warning threshold. Pre-existing, not introduced by this feature.
- **Skipped manager-layer unit test.** The brief's Test coverage bullet suggested a "second `spawn()` succeeds after `closeAfterExit` resets to idle" test at the manager layer. It was not added because the scenario 3 E2E regression section exercises the same end-to-end invariant and was judged sufficient in the final check. A future cleanup could still add the smaller unit test for faster feedback.
- **No review pass.** `/flow:review` was not run during this cycle. If the project's convention is to require one before archiving, consider retrofitting a review before closing the ticket.
- **Deferred-channel tracking.** The original deferral note in `docs/flow/stage-3-terminal-pipeline/summary.md` (which called out `IPC.terminal.close` as deliberately deferred to Stage 5) is now stale. A future doc-update pass could cross-link this archive from that Stage 3 summary so readers who start at Stage 3 find the resolution.
