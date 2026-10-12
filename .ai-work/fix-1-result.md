# Fix Result: review-all should-fix + suggestions
_Date: 2026-05-13_

## Status: VERIFIED

## Issue Addressed
From `review-all-report.md` (HAS_ISSUES, no Must Fix). Implemented both Should Fix items and all Suggestions:

- **Should Fix 1** — Duplicated 40-line clipboard `attachCustomKeyEventHandler` block between `ConsultationPanel.tsx:53-95` and `TerminalModal.tsx:56-91`. Extract shared dispatcher to prevent drift.
- **Should Fix 2** — `useProjectSync.ts:139-142` `else if (allIdenticalSeeds && !tracker.seedApplied)` branch had no test pinning the second-render behavior. Add case F2.
- **Suggestion** — `Canvas.tsx:49` deprecated `rf.project(...)` → `rf.screenToFlowPosition(...)`.
- **Suggestion** — `Canvas.tsx:48` add comment explaining the jsdom zero-rect `&&` guard.
- **Suggestion** — `useProjectSync.test.tsx:78` hoist `DEFAULT_VIEWPORT_CENTER` constant.
- **Suggestion** — `ConsultationPanel.test.tsx:7-12` wrap module-level xterm mocks into a single `xtermMocks` object for symmetric reset.

## What Was Changed
- **New** `src/renderer/src/terminal/clipboardHandler.ts` — exports `attachClipboardHandler(xterm, { getStatus, getId })`. Reads status/id at event time (and status again after `readText` resolves) to preserve the live-store-at-event semantics both panels relied on.
- `src/renderer/src/terminal/TerminalModal.tsx` — replaced the 36-line inline `attachCustomKeyEventHandler` block with a single `attachClipboardHandler(xterm, { getStatus: () => …terminal.status, getId: () => …terminal.id })`; dropped now-unused `decideClipboardAction`/`encodeBracketedPaste` imports.
- `src/renderer/src/consultation/ConsultationPanel.tsx` — same swap against the `consultationTerminal` slice; dropped the same two imports.
- `src/renderer/src/canvas/Canvas.tsx` — `rf.project(...)` → `rf.screenToFlowPosition(...)` (reactflow@11.x; same return type); added one-line comment above the zero-rect jsdom guard.
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx`:
  - Hoisted `const DEFAULT_VIEWPORT_CENTER: NodePosition = { x: 500, y: 300 }`; reused in harness default and in cases 7 / J / K assertions.
  - Added **case F2: all-identical seeds → second render preserves first-render positions (no re-dagre)** — re-renders with same project/seeds and asserts every node's position equals its first-render position exactly, proving `seedApplied=true` short-circuits both seed-apply and re-dagre on the all-identical-seeds path.
- `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx` — wrapped `attachCustomKeyEventHandler`/`hasSelection`/`getSelection`/`clearSelection` into a single `xtermMocks` object; `beforeEach` now resets symmetrically via `Object.values(xtermMocks).forEach((fn) => fn.mockReset())`. Updated all in-test references (`xtermMocks.hasSelection.mockReturnValue(true)`, etc.) and the `fireKey` helper.

## Files Read
- `src/renderer/src/consultation/ConsultationPanel.tsx`
- `src/renderer/src/terminal/TerminalModal.tsx`
- `src/renderer/src/terminal/clipboardKeymap.ts` (contract: `decideClipboardAction`, `KeymapContext`, `TerminalStatus`)
- `src/renderer/src/terminal/bracketedPaste.ts` (contract: `encodeBracketedPaste`)
- `src/renderer/src/canvas/Canvas.tsx`
- `src/renderer/src/canvas/useProjectSync.ts`
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx`
- `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx`
- `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx` (test-pattern reference)
- `src/renderer/src/store/atriumStore.ts` (`TerminalStatus`, `ConsultationTerminalStatus`, slice shapes)
- `src/preload/api.ts` (`window.atrium.terminal.write` signature → `TerminalId | null`)
- `.ai-work/review-all-report.md`
- `.ai-work/feature-plan.md`
- `.ai-work/phase-1-result.md`, `.ai-work/phase-2-result.md`

## Verification
- Build: PASS (`npm run build` — main + preload + renderer bundles produced).
- Typecheck: PASS for changed files. Same pre-existing errors in `LaunchGate.test.tsx` and `ProjectPanel.test.tsx` documented in phase-1-result remain — no new errors.
- Lint: PASS for changed files. Same pre-existing `react-hooks/exhaustive-deps` rule-resolution error in `useConsultationTerminal.ts` documented in phase-1-result remains — no new errors.
- Tests: `useProjectSync.test.tsx` 27/27 (was 26, +1 for case F2); `Canvas.test.tsx` 13/13; `ConsultationPanel.test.tsx` 12/12; `TerminalModal.test.tsx` 29/29 — all four affected suites green. Total 81/81 across the relevant files.
- No regressions confirmed.
