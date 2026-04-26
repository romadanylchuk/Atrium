# Phase 2 Result: -p runner + IPC channel + preload bridge
_Plan: `.ai-work/feature-plan.md`_
_Date: 2026-04-26_

## Status: VERIFIED

## What Was Implemented

- `src/shared/ipc.ts` — added `runDetached: 'skill:runDetached'` to the `skill` namespace
- `src/shared/errors.ts` — added `RUN_FAILED: 'RUN_FAILED'` to `SkillErrorCode`
- `src/shared/skill/detached.ts` (new) — exports `DetachedSkillName`, `DetachedRunRequest`, `DetachedRunResult`
- `src/main/skill/runDetached.ts` (new) — implements `runDetached()`: resolves claude binary via `resolveClaudeBin()` (with `ATRIUM_E2E_CLAUDE_BIN` override matching `healthCheck.ts`), spawns `claude -p /architector:<skill>` via `node-pty`, accumulates stdout, ANSI-strips on exit, resolves `ok` on exitCode 0 and `err(RUN_FAILED)` on non-zero exit or spawn failure; never touches `TerminalManager`
- `src/main/skill/__tests__/runDetached.test.ts` (new) — 8 tests covering: success with ANSI stripping, empty-stdout success, non-zero exit (last-line message), non-zero exit (fallback message), ptySpawn throws, claude not on PATH, concurrent calls independence, and static TerminalManager import check
- `src/main/ipc/skill.ts` — added second `safeHandle` for `IPC.skill.runDetached`; imports `runDetached` and `DetachedRunRequest`
- `src/main/ipc/__tests__/wiredHandlers.test.ts` — added `vi.mock('@main/skill/runDetached', …)` at top level; added two new tests: `skill:runDetached` delegates to `runDetached` on valid skill, rejects unknown skill with `INVALID_SKILL`
- `src/preload/api.ts` — extended `AtriumAPI.skill` with `runDetached(req: DetachedRunRequest): Promise<Result<DetachedRunResult, SkillErrorCode>>`
- `src/preload/index.ts` — wired `skill.runDetached(req)` to `ipcRenderer.invoke(IPC.skill.runDetached, req)`

## Deviations from Plan

None

## Gaps Found (if any)

Mock state was not cleared between wiredHandlers tests, causing a stale call count on the `mockRunDetached` spy. Fixed by adding `mockRunDetached.mockClear()` at the start of the "unknown skill" test (consistent with how the existing test suite handles shared module mocks without a `beforeEach` teardown).

## Ready for Phase 3

`window.atrium.skill.runDetached(req)` is fully wired end-to-end. Phase 3 can add the `detachedRuns` Zustand slice and the `dispatchDetachedSkill` renderer-side helper that calls this preload method.
