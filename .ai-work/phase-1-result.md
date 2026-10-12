# Phase 1 Result: Sticky positions in `useProjectSync` + Canvas wiring
_Plan: `feature-plan.md`_
_Date: 2026-05-13_

## Status: VERIFIED

## What Was Implemented
- `src/renderer/src/canvas/useProjectSync.ts`:
  - Added two required params to `UseProjectSyncParams`: `getLiveNodes: () => RFNode[]` and `getViewportCenter: () => NodePosition`.
  - Position-read path now sources existing positions from `getLiveNodes()` (single source of truth) instead of `prevNodesRef`. The hook still keeps `prevNodesRef` for slug-diffing only.
  - On projectHash change, `prevNodesRef.current = []` is now also reset so a new project does not inherit prior slug state.
  - Added `isFirstSync = prevNodes.length === 0 && !tracker.seedApplied;` computed before the seed-application block so `seedApplied` flips do not perturb the predicate.
  - Introduced `useDagreForAdded = isRelayoutTrigger || (isFirstSync && (!seedPositions || seedPositions.size === 0 || allIdenticalSeeds));`. When false, newly added slugs are placed at `getViewportCenter()` instead of being routed through `computeDagrePositions`.
  - Renamed the local `dagrePositions` → `addedPositions` to reflect the broader role.
  - Added `getLiveNodes`, `getViewportCenter` to the effect's deps array.
- `src/renderer/src/canvas/Canvas.tsx`:
  - Imported `useReactFlow` from `reactflow`.
  - Added `containerRef = useRef<HTMLDivElement | null>(null);` and attached it to the outer wrapper `<div>`.
  - Acquired `const rf = useReactFlow();` and defined stable callbacks:
    - `getLiveNodes = useCallback(() => rf.getNodes(), [rf]);`
    - `getViewportCenter` reads `containerRef.current?.getBoundingClientRect()`; falls back to `{x:0,y:0}` if the rect is unavailable or zero-sized; otherwise returns `rf.project({ x: rect.width/2, y: rect.height/2 })`.
  - Passed both callbacks into `useProjectSync({...})`.
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx`:
  - Reworked `renderSync` harness to supply `getLiveNodes` (defaults to mirroring last `setNodes` call) and `getViewportCenter` (defaults to `{x:500,y:300}`); per-test overrides via `setLiveNodesOverride` / `setViewportCenterOverride`.
  - Updated **case 7** to assert new slug lands at viewport center `{x:500,y:300}` (was: "dagre position").
  - Updated **case G** to also assert relayout positions differ from the simulated drag (live) positions, with an injected live-nodes override.
  - Added new `describe` block "sticky positions + viewport-center add" with cases **H** (drag-survives-resync), **I** (maturity change keeps drag), **J** (new mid-session slug at viewport center, alpha preserved), **K** (multiple new slugs stack at center), **L** (relayout overrides drag).
- `src/renderer/src/canvas/__tests__/Canvas.test.tsx`: no edits required — all 13 existing tests pass against the new Canvas wiring (the real `<ReactFlowProvider>` provides a working `useReactFlow()` and `rf.project()` in jsdom).

## Files Read
- `src/renderer/src/canvas/useProjectSync.ts` (target — modified)
- `src/renderer/src/canvas/Canvas.tsx` (target — modified)
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx` (target — modified)
- `src/renderer/src/canvas/__tests__/Canvas.test.tsx` (target — read to confirm no edits required)
- `src/renderer/src/canvas/dagreLayout.ts` (contract dependency)
- `src/shared/layout.ts` (contract: `NodePosition`)
- `package.json` (build/lint/test commands)
- `.ai-work/feature-plan.md` (full plan)

## Verification
- Build: PASS (`npm run build`)
- Typecheck: PASS for changed files. Two pre-existing failures in `src/renderer/src/launch/__tests__/LaunchGate.test.tsx` and `src/renderer/src/sidePanel/__tests__/ProjectPanel.test.tsx` confirmed present before this phase via `git stash`-based comparison.
- Lint: PASS for changed files. Five pre-existing errors in unrelated files (`wiredHandlers.test.ts`, `health.ts`, `useConsultationTerminal.ts`, `LaunchGate.test.tsx`) confirmed pre-existing.
- Tests: PASS — `useProjectSync.test.tsx` 26/26, `Canvas.test.tsx` 13/13. Full suite: 912 pass (up from 907 pre-change) + 5 pre-existing fixture-path failures in `claudeInvoker.test.ts` and `errorMapper.test.ts` (missing `.ai-work/phase0/r1-happy.jsonl`), unrelated to this phase.
- Patterns: matched — same React-style `useEffect` + ref + zustand pattern as surrounding code; new params declared on the existing interface with JSDoc; new test cases follow the existing case-letter convention.

## Deviations from Plan
None of substance. One minor ordering refinement: `isFirstSync` is computed **before** the seed-application block so the all-identical-seeds branch (which flips `seedApplied` to true) does not collapse the predicate to false on first sync. The plan's step-1 wording placed the computation "after the tracker reset" without specifying order vs. seed-application — the implementation puts it between them, which preserves case F (all-identical seeds → dagre runs) exactly as the plan requires.

## Gaps Found
None.

## Ready for Phase 2
- `useProjectSync` now has sticky-position semantics; new slugs go to viewport center mid-session; dagre is gated to first-open and explicit relayout.
- Canvas owns the React Flow instance and container ref needed for viewport math.
- No public API exposed to other modules changed; Phase 2 work on `ConsultationPanel` is fully independent.
