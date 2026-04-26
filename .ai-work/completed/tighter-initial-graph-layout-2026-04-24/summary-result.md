# tighter initial graph layout
_Completed: 2026-04-24_

## Goal
Make a fresh project (no `layout.json`) open with nodes packed closer together and rendered at a higher effective scale by tightening dagre spacing and capping ReactFlow's initial auto-fit zoom.

## Implementation Summary
- Shrank four module-level dagre constants in `dagreLayout.ts` to match the real `96×36` DOM node footprint: `NODESEP` 80→30, `RANKSEP` 100→40, `DEFAULT_NODE_WIDTH` 150→96, `DEFAULT_NODE_HEIGHT` 50→36. Grid-fallback branch inherits the new values (column stride now 126).
- Added `fitViewOptions={{ maxZoom: 1.2 }}` to the `<ReactFlow>` element in `Canvas.tsx`, capping the initial auto-fit zoom for small graphs. Manual fit-view and re-layout paths unchanged.
- Updated the two value-assertion tests in `dagreLayout.test.ts` to reflect the new constants. All shape-only tests unaffected.

## Key Decisions
- Hoisted `fitViewOptions` to a module-level `FIT_VIEW_OPTIONS` const (applied during fix after Phase 2 review) rather than using an inline object literal. Matches the existing `nodeTypes`/`edgeTypes` pattern in the same file and avoids fresh object references on every render that could re-trigger ReactFlow's fitView. Semantically identical to the brief's contract.

## Files Changed
- `src/renderer/src/canvas/dagreLayout.ts` — four constant value updates
- `src/renderer/src/canvas/Canvas.tsx` — added `FIT_VIEW_OPTIONS` module const and `fitViewOptions` prop on `<ReactFlow>`
- `src/renderer/src/canvas/__tests__/dagreLayout.test.ts` — updated two value-assertion tests (`NODESEP is 30`, `RANKSEP is 40`)

## Gaps/Notes
- No `feature-docs.md` was produced for this feature (mechanical tuning change; `/document-work-result` not run).
- Review-2 suggestions beyond the applied fix (naming `MAX_INITIAL_ZOOM`, reconsidering the constant-pinning tests) were noted but not acted on — non-blocking test-design observations.
- Full vitest suite green after Phase 1 (642/642, 1 pre-existing skip); Canvas tests 13/13 after Phase 2 and the fix.
