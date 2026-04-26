# Phase 3 Result: Renderer detached-run slice + dispatch helper
_Plan: `.ai-work/feature-plan.md`_
_Date: 2026-04-26_

## Status: VERIFIED

## What Was Implemented

- `src/renderer/src/store/atriumStore.ts` — added `DetachedSkillName` import; added `DetachedRunState` type, `DetachedSlice` type, and `defaultDetachedRuns()` factory; added `detachedRuns: DetachedSlice` and `lastDetachedError: { skill: DetachedSkillName; message: string } | null` fields to `AtriumStore` type and initial state; implemented five actions: `startDetachedRun` (BUSY guard on `'waiting'`), `setDetachedRunResult` (`waiting → done`), `setDetachedRunError` (`waiting → error`; sets `lastDetachedError`), `closeDetachedResult` (`done → idle`), `clearDetachedRunError` (`error → idle`; clears `lastDetachedError` only when skill matches)
- `src/renderer/src/store/__tests__/atriumStore.test.ts` — imported `DetachedSkillName`; extended `beforeEach` reset with `detachedRuns` and `lastDetachedError`; added 21 new tests covering: initial state, `startDetachedRun` (idle/done/error → waiting, BUSY on waiting), `setDetachedRunResult`, `setDetachedRunError` (sets `lastDetachedError`), `closeDetachedResult`, `clearDetachedRunError` (clears / preserves `lastDetachedError`), independent concurrent slots
- `src/renderer/src/skill/dispatchDetachedSkill.ts` (new) — implements the helper per the plan contract: calls `startDetachedRun`, returns `BUSY` without calling IPC if already waiting, calls `window.atrium.skill.runDetached`, dispatches `setDetachedRunResult` or `setDetachedRunError` based on the result
- `src/renderer/src/skill/__tests__/dispatchDetachedSkill.test.ts` (new) — 5 tests covering: happy path (audit and status), error path (`setDetachedRunError` and `lastDetachedError` set), BUSY dedupe (IPC not called), concurrent different-skill calls (no cross-slot blocking)

## Deviations from Plan

None. The `dispatchDetachedSkill` signature and behaviour exactly match the plan contract.

## Gaps Found (if any)

None.

## Ready for Phase 4

The detached-run Zustand slice is fully functional and observable. `dispatchDetachedSkill` is ready to be called from Toolbar/StatusPanel in Phase 5. Phase 4 (canvas-region overlay host + popup geometry) can proceed — it depends on the store slice already being in place.
