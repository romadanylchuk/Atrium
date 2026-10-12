# Final Check: Sticky Node Layout + Consultation Terminal Clipboard Parity
_Date: 2026-05-13_

## Status: DONE

## Verified (against `interview-brief.md`, not the plan)

### Issue 1 — Sticky positions

**Expected Behavior**
- [x] **First open, no saved layout** — `Canvas.tsx:65-70` calls `window.atrium.layout.load`; empty result sets empty `seedPositions`. In `useProjectSync.ts:120, 146-148` `isFirstSync=true && seedPositions.size===0` ⇒ `useDagreForAdded=true`, so dagre runs for the empty `prevSlugs` against `nextSlugs`. Persistence wired via `Canvas.tsx:99-111` `handleNodesChange → saveNodes`.
- [x] **Second open, saved layout** — seed loop at `useProjectSync.ts:125-138` overwrites `existingPositions` with disk positions for every known slug; `useDagreForAdded=false`, but every added slug already lives in `existingPositions`, so `addedPositions` stays empty and no viewport-center fallback fires for seeded slugs.
- [x] **Mid-session re-sync (file edit, architector write, maturity/name/description/connection change)** — `getLiveNodes()` at `useProjectSync.ts:101-108` rebuilds `existingPositions` from React Flow's live store. Existing slugs preserve drag positions; non-slug edits leave `addedSlugs` empty so no repositioning. Confirmed by case H, I in `useProjectSync.test.tsx`.
- [x] **Brand-new slug mid-session** — `useDagreForAdded` evaluates to `false` (not first sync, not relayout); `getViewportCenter()` returns flow-coord center via `Canvas.tsx:46-51` (`rf.screenToFlowPosition(rect/2)`); multiple new slugs stack at same point. Confirmed by case J, K.
- [x] **Re-layout button** — `useProjectSync.ts:75-82` bumps `prevRelayoutIdRef`; `existingPositions` left empty by the guarded fill at line 100; dagre runs for entire graph. Confirmed by case L.
- [x] **Node removed** — `useProjectSync.ts:86-95` strips selection + tooltip; persistence rebuilds map from current node list on next `onNodesChange`.
- [x] **App restart** — `layout.load` reload path unchanged. No regressions.

**Edge Cases**
- [x] Stale seed slug warning preserved (`useProjectSync.ts:128-131`).
- [x] All-identical-seed gate widened into `useDagreForAdded` predicate (`:148`) — preserves auto-layout-marker first-open. Pinned by new case F2.
- [x] StrictMode double-invoke — single-effect dispose in `Canvas.tsx:55-76` preserved; the new callbacks are stable `useCallback`s.
- [x] Project switch — `useProjectSync.ts:60-68` now resets `prevNodesRef.current = []` on `projectHash` change, preventing project-A slug leakage.
- [x] Concurrent watcher + user drag — `getLiveNodes()` reads React Flow's reducer state, which has applied the drag synchronously.
- [x] No re-render loop on drag — `nodes` not in effect deps; `getLiveNodes`/`getViewportCenter` are `useCallback([rf])`.
- [x] First-render race — two-pass `seedApplied` flag preserved; `isFirstSync` computed before seed-apply block (`:120`) so the all-identical-seeds short-circuit still routes through dagre.

### Issue 2 — Consultation clipboard

**Expected Behavior**
- [x] Handler attached before `xterm.onData` at `ConsultationPanel.tsx:52-55`; existing `xterm.onData(...)` keystroke wiring at `:68-71` untouched.
- [x] **passthrough** — `clipboardHandler.ts:32-33` returns `true`.
- [x] **swallow** — `:34-36` preventDefault + `false`.
- [x] **copy-selection** — `:37-41` preventDefault + `writeText` + `clearSelection`.
- [x] **paste** — `:42-57` preventDefault, `readText`, empty/id/status guards (status re-read at resolve time at `:49`), `encodeBracketedPaste`, `terminal.write`.
- [x] Status read at event time from `consultationTerminal` slice (`ConsultationPanel.tsx:53-54`).

**Edge Cases**
- [x] Permission denied/unavailable — `.catch(() => {})` on both clipboard calls (`clipboardHandler.ts:39, 55`).
- [x] `status === 'spawning'` — `decideClipboardAction` returns `swallow` (paste branch only fires when status === 'active'). Confirmed by ConsultationPanel test "paste swallowed when status spawning".
- [x] `status === 'exited'` — same swallow path. Confirmed by ConsultationPanel test "paste swallowed when status exited".
- [x] `id === null` — explicit `if (!text || !currentId) return;` at `clipboardHandler.ts:48`. Confirmed by test "paste short-circuit when id is null".
- [x] Empty / whitespace clipboard — `if (!wrapped) return;` at `:51`. Confirmed by test "paste with empty clipboard drops silently".
- [x] Bracketed-paste-marker injection — `encodeBracketedPaste` strips embedded markers (unchanged module).
- [x] Right-click — no changes to context menu handling.

### Out of Scope (brief lines 116-123)
- [x] `LayoutFileV1` format, `window.atrium.layout` IPC, `computeDagrePositions` — untouched.
- [x] No new toolbar button, dialog, or settings toggle.
- [x] No confirmation dialog on Re-layout.
- [x] No right-click context menu added.
- [x] No `consultationTerminal.status` transition changes; no spawn-hook changes.
- [x] No deferred consultation-service file removal.
- [x] No `composeConsultationCommand` or IPC changes.
- [⚠️] **`TerminalModal` clipboard code** — see Deviations below.

## Deviations from Brief

- **`TerminalModal.tsx` clipboard block was extracted, not left in place.** The brief's Out-of-Scope list said "Do NOT touch the main `TerminalModal` clipboard code." However, the review fix-loop (`review-all-report.md` Should Fix #1, applied in `fix-1-result.md`) extracted the 40-line inline `attachCustomKeyEventHandler` block from both `TerminalModal.tsx` and `ConsultationPanel.tsx` into a shared `src/renderer/src/terminal/clipboardHandler.ts` and replaced both call sites with `attachClipboardHandler(xterm, { getStatus, getId })`.

  This is a behavior-preserving refactor: all 29 existing `TerminalModal.test.tsx` cases still pass, and the new clipboard module is byte-for-byte equivalent to the prior inline TerminalModal code modulo the `getStatus`/`getId` callbacks. The change was driven by review intent (prevent the two terminals from drifting — exactly the regression class this feature was created to fix). Flagging for transparency only; no action recommended.

## Issues
_None._

## Regressions
_None found._ The 5 failing tests in the full suite are all pre-existing and unrelated to this feature:
- 4× `claudeInvoker.test.ts` / `errorMapper.test.ts` — missing fixture files at `.ai-work/phase0/r1-happy*.jsonl` (documented as pre-existing in both phase-1 and phase-2 results).
- 1× `watcherManager.test.ts` "start after stop" — known Windows `@parcel/watcher` flaky race; passes on isolated re-run.

The 5 lint errors and 13 typecheck errors are also all pre-existing in unrelated files (`wiredHandlers.test.ts`, `health.ts`, `useConsultationTerminal.ts`, `LaunchGate.test.tsx`, `ProjectPanel.test.tsx`) — documented in phase results.

## Build / Lint / Test Status
- **Build:** PASS (`npm run build` — main + preload + renderer bundles produced).
- **Lint:** PASS for all changed files. 5 pre-existing errors in unrelated files remain.
- **Typecheck:** PASS for all changed files. 13 pre-existing errors in unrelated files remain.
- **Tests (feature-relevant):** 81/81 PASS
  - `useProjectSync.test.tsx` — 27/27
  - `Canvas.test.tsx` — 13/13
  - `ConsultationPanel.test.tsx` — 12/12
  - `TerminalModal.test.tsx` — 29/29
- **Tests (full suite):** 922 passed / 5 failed / 1 skipped — failures all pre-existing and unrelated.
