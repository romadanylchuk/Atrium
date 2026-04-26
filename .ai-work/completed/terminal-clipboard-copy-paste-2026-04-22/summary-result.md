# Terminal clipboard copy/paste (Ctrl+C / Ctrl+V and Shift variants)
_Completed: 2026-04-22_

## Goal
Enable clipboard copy/paste inside the embedded xterm terminal modal using Windows chords — `Ctrl+C` copies the current selection (passing through to SIGINT only when there is no selection), `Ctrl+V` pastes into the pty, and the unambiguous `Ctrl+Shift+C` / `Ctrl+Shift+V` variants always copy / paste. All logic is renderer-only; no IPC or pty changes.

## Implementation Summary
Two-phase implementation:

- **Phase 1** — Added pure decision helper `decideClipboardAction(e, ctx)` in `src/renderer/src/terminal/clipboardKeymap.ts` returning a `ClipboardAction` union (`copy-selection` | `paste` | `swallow` | `passthrough`). Chord detection uses `e.code === 'KeyC'|'KeyV'` (layout-independent) gated on `ctrlKey` with `altKey`/`metaKey` excluded; `keyup` always passes through. Paste is only issued when `status === 'active'`; otherwise swallowed. 16 unit cases cover every chord × status × selection combination.

- **Phase 2** — Wired the helper into `TerminalModal.tsx` via `xterm.attachCustomKeyEventHandler` inside the existing xterm-mount `useEffect`. Handler reads `hasSelection`/`getSelection` from xterm and current `id`/`status` live from the Zustand store (not closed over at mount), dispatches `navigator.clipboard.writeText`/`readText` for copy/paste actions, re-checks `status === 'active'` inside the paste `.then` to guard the active→exited race, and calls `preventDefault()` + `return false` for every non-passthrough action so xterm does not also emit a literal `^V`. 10 integration tests added to `TerminalModal.test.tsx` (extended xterm mock with `attachCustomKeyEventHandler`/`hasSelection`/`getSelection`/`clearSelection`, stubbed `navigator.clipboard`, added `fireKey` helper).

Post-review fixes: merged duplicate `terminalState` imports, added `default: { const _: never = action; ... }` exhaustiveness arm to the action switch, changed `vi.stubGlobal('navigator', ...)` to spread the real `navigator`, narrowed `fireKey`'s param type, and added a direct race-condition test that transitions `active → exited` mid-clipboard-read.

Final-check confirmed: 43 terminal tests pass (16 unit + 27 TerminalModal), `tsc --noEmit` clean, no regressions in Kill/Close/Fullscreen/Escape/onData/onExit/onError/pendingInit paths.

## Key Decisions
- **Clipboard access** — `navigator.clipboard.readText`/`writeText` directly from the renderer rather than a preload bridge to Electron's `clipboard` module. Focused Electron BrowserWindow grants access without a permission prompt; a preload bridge would add IPC surface for no behavioral gain.
- **Pure decision helper** — Chord logic extracted from the xterm-mount effect so the 4 chords × 5 statuses × with/without selection truth table is Vitest-covered without mocking xterm or `navigator.clipboard`. Mirrors the existing `terminalState.ts` / `decideNextTerminalState` split.
- **`e.code` over `e.key`** — Physical-key detection is shift- and layout-independent; avoids `'c'` vs `'C'` branching.
- **Keydown only; keyup passthrough** — `attachCustomKeyEventHandler` fires both phases; acting on both would double-handle. xterm's input pipeline is keydown-driven.
- **`preventDefault()` when swallowing** — Necessary for Ctrl+V: xterm's hidden textarea would otherwise receive the native browser paste and re-emit it via `onData`, defeating the swallow.
- **Async paste from sync handler** — `attachCustomKeyEventHandler` must return boolean synchronously; paste dispatches a fire-and-forget `readText().then(...)` which writes to the pty on resolve. Per the brief, rapid repeated paste is allowed to fire independently with no batching.
- **Read `status`/`id` at event time** — The xterm-mount effect only re-runs on `[visible]` changes, so closing over `status` at mount would break the non-active swallow behavior. Handler reads live via `useAtriumStore.getState()`; paste `.then` re-reads again to cover the `active → exited` race.
- **`KeymapContext.status` uses `TerminalStatus`** — Minor deviation from the plan's inline union literal; imports the authoritative type from `atriumStore` (strictly narrower, matches codebase convention).

## Files Changed
- `src/renderer/src/terminal/clipboardKeymap.ts` (created)
- `src/renderer/src/terminal/__tests__/clipboardKeymap.test.ts` (created)
- `src/renderer/src/terminal/TerminalModal.tsx` (modified — import, `attachCustomKeyEventHandler` wiring, exhaustive switch)
- `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx` (modified — extended xterm mock, `navigator` stub, `fireKey` helper, 10 clipboard integration tests)

No changes to `preload/`, `@shared/`, or `main/`. No new E2E scenarios.

## Gaps/Notes
- No `feature-docs.md` was produced (the `/document-work-result` step was not run), so the archive contains only `summary-result.md`.
- Manual dev-server exercise (plan's Phase 2 completion criterion) was not re-executed during final-check; the automated test matrix + phase-2 result attest to it.
- `watcherManager.test.ts` flakes once under full-parallel suite load per phase-2 notes — unrelated to this feature, pre-existing.
