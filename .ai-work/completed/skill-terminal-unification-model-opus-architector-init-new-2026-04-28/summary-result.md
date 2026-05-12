# Skill terminal unification, --model opus, architector:init → new
_Completed: 2026-04-28_

## Goal
Remove all detached-run infrastructure and route the Audit and More Status buttons through the single interactive terminal slot. Add `--model opus` to every `composeCommand` output, and fix the `'init'` skill to emit `/architector:new` instead of `/architector:init`.

## Implementation Summary

**Phase 1 — composeCommand** (`src/shared/skill/composeCommand.ts`): Introduced `const base = ['claude', '--model', 'opus']`; all 10 skill branches return `[...base, ...]`. The `'init'` branch changed from `/architector:init` to `/architector:new`. All 14 composeCommand tests updated to include `--model opus`.

**Phase 2 — Toolbar Audit unification** (`src/renderer/src/toolbar/Toolbar.tsx`): Removed `dispatchDetachedSkill` import, `detachedRunAudit`/`lastDetachedError`/`clearDetachedRunError` selectors, `auditWaiting`/`effectiveError` derivations, and `handleAudit()`. Audit button now calls `handleSkill('audit')`, is gated by `!switchAllowed`, uses static "Audit" label, and tracks `activeTab`. Four detached-specific tests dropped; Audit added to the "disabled when active" test set.

**Phase 3 — StatusPanel More Status unification** (`src/renderer/src/toolbar/StatusPanel.tsx`): Removed `dispatchDetachedSkill` import. More Status button now calls `onClose()` synchronously then `dispatchSkill({skill:'status', cwd})`, with errors surfaced via `useToastStore.pushToast`. Button gated by `!switchAllowed` using `canSwitch(terminalStatus)`. Static "More Status" label. Tests updated accordingly.

**Phase 4 — CanvasRegionHost cleanup**: Removed `DetachedResultPopup` import, `detachedRuns`/`closeDetachedResult` subscriptions, and both conditional `<DetachedResultPopup>` JSX blocks. Deleted `DetachedResultPopup.tsx` and its test file. Removed 8 detached-popup tests from `CanvasRegionHost.test.tsx`.

**Phase 5 — Store cleanup**: Removed `DetachedRunState`, `DetachedSlice`, `defaultDetachedRuns`, `detachedRuns`, `lastDetachedError` from `atriumStore.ts`. Deleted 5 actions: `startDetachedRun`, `setDetachedRunResult`, `setDetachedRunError`, `closeDetachedResult`, `clearDetachedRunError`. Deleted `dispatchDetachedSkill.ts` and its test. Removed 21 detached-run tests from `atriumStore.test.ts`.

**Phase 6 — Shared/Main/Preload infrastructure**: Removed `runDetached: 'skill:runDetached'` from `IPC.skill`. Removed `RUN_FAILED` from `SkillErrorCode`. Deleted `src/shared/skill/detached.ts`, `src/main/skill/runDetached.ts`, and `src/main/skill/__tests__/runDetached.test.ts`. Stripped `runDetached` handler/imports from `skill.ts` and the bridge from `preload/index.ts`. Removed `runDetached` from `AtriumAPI` type in `preload/api.ts`. Updated `skillHandlers.test.ts` and `wiredHandlers.test.ts`.

**Fix** (post-review): `VALID_SKILLS` in `skill.ts` narrowed from `Set<string>` to `ReadonlySet<SkillName>` with matching import. Two stale test descriptions in `skillHandlers.test.ts` updated to reflect 4-element args.

## Key Decisions

- **`base` const instead of inline repetition** — Phase 1 used `const base = ['claude', '--model', 'opus']` rather than inserting the two elements at the start of each branch array. Strictly equivalent; reviewers approved.
- **Audit gets `data-active` tracking** — Phase 2 added `setActiveTab('audit')` + `data-active` attribute to match every other skill button's active-state pattern (consistent, not required by brief).
- **`phase-3-result.md` absent** — The file in HEAD was from the previous feature cycle (adding detached infra) and was correctly deleted. Phase 3 work (StatusPanel) was fully implemented and verified; no result file was written for this feature's Phase 3.
- **Review cycles**: Phases 1, 2, 4 passed clean. Phases 5 and 6 had "Should Fix" items (orphaned comment header in store test; `Set<string>` type + stale descriptions in skillHandlers). Both fixed in a single `fix-result` pass.

## Files Changed

**Modified:**
- `src/shared/skill/composeCommand.ts`
- `src/shared/skill/__tests__/composeCommand.test.ts`
- `src/shared/ipc.ts`
- `src/shared/errors.ts`
- `src/main/ipc/skill.ts`
- `src/main/ipc/__tests__/skillHandlers.test.ts`
- `src/main/ipc/__tests__/wiredHandlers.test.ts`
- `src/preload/api.ts`
- `src/preload/index.ts`
- `src/renderer/src/toolbar/Toolbar.tsx`
- `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx`
- `src/renderer/src/toolbar/StatusPanel.tsx`
- `src/renderer/src/toolbar/__tests__/StatusPanel.test.tsx`
- `src/renderer/src/canvas/CanvasRegionHost.tsx`
- `src/renderer/src/canvas/__tests__/CanvasRegionHost.test.tsx`
- `src/renderer/src/store/atriumStore.ts`
- `src/renderer/src/store/__tests__/atriumStore.test.ts`

**Deleted:**
- `src/shared/skill/detached.ts`
- `src/main/skill/runDetached.ts`
- `src/main/skill/__tests__/runDetached.test.ts`
- `src/renderer/src/skill/dispatchDetachedSkill.ts`
- `src/renderer/src/skill/__tests__/dispatchDetachedSkill.test.ts`
- `src/renderer/src/toolbar/DetachedResultPopup.tsx`
- `src/renderer/src/toolbar/__tests__/DetachedResultPopup.test.tsx`

## Gaps/Notes

- `phase-3-result.md` was not written for this feature (see Key Decisions above). Implementation is complete and tested.
- 5 pre-existing test failures remain unrelated to this feature (`claudeInvoker.test.ts` ×3, `errorMapper.test.ts` ×1, `watcherManager.test.ts` ×1) — confirmed identical on HEAD before changes.
- Reviewer suggestions not acted on (by design): adding a direct `data-active` test for Audit button; fixing `React.CSSProperties` namespace in `Toolbar.tsx`; expanding `--append-system-prompt-file` coverage to all 10 skills; removing a stale phase-reference comment in `startAutoOpen`; fixing a stray blank line in `CanvasRegionHost.test.tsx`.
