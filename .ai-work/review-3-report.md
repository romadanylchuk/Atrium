# Review Report: Phase 3
_Date: 2026-04-26_

## Status: HAS_ISSUES

## Must Fix

_(none)_

## Should Fix

- **[src/renderer/src/skill/dispatchDetachedSkill.ts:11]** Unnecessary and misleading cast `as Result<never, 'BUSY'>`.
  → Inside `if (!start.ok)`, TypeScript narrows `start` from `Result<void, 'BUSY'>` to `Err<'BUSY'>`. `Err<'BUSY'>` is directly assignable to the function's return type `Result<DetachedRunResult, SkillErrorCode | 'BUSY'>`, so no cast is needed. The `never` success-type in the cast implies the Ok variant is impossible, which confuses readers about what the cast is doing. Change to `return start`.

## Suggestions

- **[src/renderer/src/skill/dispatchDetachedSkill.ts:13]** No defense against `runDetached` rejecting (throwing instead of returning `err`).
  → `safeHandle` prevents this in practice, but if `ipcRenderer.invoke` rejects for any infrastructure reason (IPC teardown, renderer shutdown), the `waiting` slice is never cleared and the button stays disabled until restart. A `try/catch` around `await window.atrium.skill.runDetached(req)` that calls `setDetachedRunError(skill, …)` on catch would make the function self-healing. Alternatively, add a `.mockRejectedValue(…)` test case to document the current behavior and make the gap intentional-by-record.

- **[src/renderer/src/store/__tests__/atriumStore.test.ts:1468-1495]** `setDetachedRunResult` tests don't assert that `lastDetachedError` is left untouched.
  → The plan requires Phase 5's `handleAudit` to call `clearDetachedRunError` before re-dispatch, not `setDetachedRunResult`. But the test suite never verifies that `setDetachedRunResult` does NOT clear `lastDetachedError`. A single extra assertion — set `lastDetachedError` for the skill, call `setDetachedRunResult`, assert it survives — would make the cross-phase contract explicit and catch any future regression where someone adds an accidental clear inside the action.

## Summary

Phase 3 is clean and well-tested. The slice state machine, BUSY guard, and independence invariants are all correct. The only issue worth fixing before merge is the `as Result<never, 'BUSY'>` cast in `dispatchDetachedSkill.ts` — it's a simple change and removes misleading noise. The two suggestions are low-priority but would improve long-term robustness and test coverage of the cross-phase contract.
