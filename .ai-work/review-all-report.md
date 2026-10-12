# Review Report: All Phases
_Date: 2026-05-13_

## Status: HAS_ISSUES

(All Should Fix only — no Must Fix. The `Should Fix` items are about long-term consistency, not bugs. Final-check fix-loop should pick them up; the orchestrator review fix-loop will not.)

## Must Fix
_None._

## Should Fix
- **`src/renderer/src/consultation/ConsultationPanel.tsx:53-95` vs `src/renderer/src/terminal/TerminalModal.tsx:56-91`** — the clipboard `attachCustomKeyEventHandler` block is a near-verbatim 40+ line copy (only the store-slice read differs: `terminal` vs `consultationTerminal`). Two copies will drift the moment one side gets a clipboard fix and the other does not — exactly the regression class this phase exists to repair.
  → Extract a `createClipboardHandler({ xterm, getStatus, getId })` (or `attachClipboardHandler(xterm, { getStatus, getId })`) into `src/renderer/src/terminal/clipboardKeymap.ts` (or a sibling `clipboardHandler.ts`). Call it from both terminals. The handler closes over a `getStatus` and `getId` reader to keep the "read store at event time" semantics the brief explicitly calls out. This was foreseen in the plan (Phase 2 reuses `decideClipboardAction` and `encodeBracketedPaste` precisely because they're shared), so taking the last step and sharing the dispatch wrapper too is consistent.

- **`src/renderer/src/canvas/useProjectSync.ts:139-142`** — the `else if (allIdenticalSeeds && !tracker.seedApplied)` branch carries non-obvious control-flow coupling: it flips `tracker.seedApplied = true` *without* applying any seed, relying on the dagre predicate at line 146-148 to include `allIdenticalSeeds` so dagre still fires on the same pass. If a future edit removes `allIdenticalSeeds` from the predicate, this branch will silently leave nodes at the origin fallback. There is no test that pins the second-render behavior for the all-identical-seeds path (case F covers only the first render).
  → Add a test case "case F2: all-identical seeds → second render does not re-fire dagre and preserves positions from the first render". Asserts `setNodes.mock.calls.at(-1)![0]` on a second `rerender({ project: { ...proj }, seedPositions: sameSeeds })` matches the first-render positions exactly (proves seedApplied=true short-circuits both seed-apply and re-dagre).

## Suggestions
- **`src/renderer/src/canvas/Canvas.tsx:49`** — `rf.project(...)` is deprecated in `reactflow@11` in favor of `screenToFlowPosition`. Both work today; the deprecated name will go away in v12.
  → Use `rf.screenToFlowPosition({ x: rect.width / 2, y: rect.height / 2 })`. Trivial swap, same return type.

- **`src/renderer/src/canvas/Canvas.tsx:48`** — the zero-rect guard `if (!rect || (rect.width === 0 && rect.height === 0))` is correct (jsdom returns a real rect object with zero dims) but the `&&` rather than `||` is surprising at a glance; a one-line comment would save the next reader the trace.
  → Add `// jsdom returns a rect object with both dims zero; treat as unmeasured.` above the guard.

- **`src/renderer/src/canvas/__tests__/useProjectSync.test.tsx:78`** — the harness default `{ x: 500, y: 300 }` is repeated as a literal across cases 7, J, K assertions. If the default changes the failure messages will be obscure.
  → Hoist `const DEFAULT_VIEWPORT_CENTER: NodePosition = { x: 500, y: 300 }` near the top of the file and reuse in both the harness default and the assertions.

- **`src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx:7-12`** — the xterm mock vi.fns are module-level and shared across every test in the file. This works because `beforeEach` resets them, but it couples test order in a non-obvious way (a forgotten reset would leak between tests).
  → Optional: wrap the mock state in a single `xtermMocks` object and reset via `Object.values(xtermMocks).forEach(fn => fn.mockReset?.())` for symmetry — or accept as-is given `TerminalModal.test.tsx` follows the same pattern.

- **`src/renderer/src/consultation/ConsultationPanel.tsx:18`** — `id` and `status` are subscribed via `useAtriumStore((s) => s.consultationTerminal)` for the JSX (Connecting…, Restart button), then re-read via `useAtriumStore.getState().consultationTerminal` inside the handler. That's the same dual-read pattern as `TerminalModal.tsx:33,58` — flag only for cross-reference; not an issue.

## Summary
Implementation is high-quality and a tight structural match to the existing `TerminalModal` and `useProjectSync` patterns; no correctness or type-safety bugs found, and the verified test suites cover the new behaviors well (cases H–L for sticky positions, 9 cases for clipboard). The most worth-addressing item is the duplicated 40-line clipboard handler between the two terminals — extracting a shared dispatcher now prevents the exact "clipboard parity drifted again" regression this phase was created to fix. The minor `allIdenticalSeeds` second-render gap is worth a single extra test to lock down the predicate coupling.
