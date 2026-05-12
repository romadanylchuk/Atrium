# Review Report: Phase 5
_Date: 2026-04-28_

## Status: HAS_ISSUES

## Must Fix

_(none)_

## Should Fix

- **`src/renderer/src/shell/__tests__/MainShell.test.tsx:32-40`** — The `window.atrium.consultation` mock still contains the old Phase 3-removed API (`loadThread`, `sendMessage`, `newSession`, `cancel`, `onStreamChunk`, `onStreamComplete`, `onStreamError`). Phase 4 replaced the preload surface with `{ spawnTerminal }`. The mock now misrepresents the live contract and will mislead anyone who reads this test expecting it to reflect reality.
  → Replace the `consultation` block in the global stub with `consultation: { spawnTerminal: vi.fn().mockResolvedValue({ ok: true, data: 't_consult' as TerminalId }) }`.

## Suggestions

- **`src/renderer/src/store/__tests__/atriumStore.test.ts:514-518`** — `setConsultationTerminalSpawning` test only runs from `id: null` (the `beforeEach` default). The implementation spreads `s.consultationTerminal`, so the intent is to preserve a non-null id during a re-spawn flow — but this path is not exercised.
  → Add a second case: set `consultationTerminal` to `{ id: CONSULT_ID, status: 'active' }`, call `setConsultationTerminalSpawning()`, and assert `id === CONSULT_ID` is preserved alongside `status === 'spawning'`.

- **`src/renderer/src/store/__tests__/atriumStore.test.ts:553-561`** — The "resets to idle without calling kill when id is null" test explicitly calls `setState({ consultationTerminal: { id: null, status: 'idle' } })`, which is identical to what `beforeEach` already sets. The `setState` call is redundant and adds noise.
  → Remove the `setState` call; the `beforeEach` reset is sufficient.

## Summary

The store logic and new action tests are clean and correct. The one real issue is the stale `window.atrium.consultation` mock in `MainShell.test.tsx`: it documents a contract that no longer exists, and any future dev adding a consultation-related test will start from the wrong assumption. The two test suggestions are minor hygiene items. Fix the mock before moving to Phase 6.
