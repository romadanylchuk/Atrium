# Phase 5 Result: Toolbar buttons (Free Terminal, New, Triage, Audit) + reorder + More Status
_Plan: `.ai-work/feature-plan.md`_
_Date: 2026-04-26_

## Status: VERIFIED

## What Was Implemented

- `src/renderer/src/toolbar/Toolbar.tsx` — Added imports for `dispatchDetachedSkill`; added store subscriptions for `detachedRuns.audit`, `lastDetachedError`, and `clearDetachedRunError`; added `handleAudit()` function (clears prior error, calls `dispatchDetachedSkill`); replaced the 5-button row with the 9-button row in the specified order (Free Terminal | New | Triage | Explore | Decide | Map | Audit | Status | Finalize); Free/New/Triage gated by `!switchAllowed`; Audit gated only by `detachedRuns.audit.kind === 'waiting'`; Audit label toggles to `Waiting…`; Audit never mutates `activeTab` (`data-active` hardcoded `"false"`); `effectiveError = error ?? lastDetachedError?.message ?? null` drives the `toolbar-error` paragraph
- `src/renderer/src/toolbar/StatusPanel.tsx` — Added `useAtriumStore` and `dispatchDetachedSkill` imports; added `detachedStatusKind` subscription; added "More Status" button (testid `status-panel-more`) that disables and shows `Waiting…` when `detachedRuns.status.kind === 'waiting'`; dispatches `dispatchDetachedSkill({ skill: 'status', cwd: project.rootPath })` on click
- `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx` — Replaced "renders 5 buttons in order" with 9-button order assertion; added `runDetachedMock` stub and `detachedRuns`/`lastDetachedError` store setup in `beforeEach`; added tests: Free Terminal dispatch, New dispatch, Triage dispatch, Audit dispatch, Audit enabled when terminal active, Audit disabled+Waiting… when detached waiting, `lastDetachedError` renders in `toolbar-error`, clicking Audit while error showing dispatches fresh run; updated existing tests to cover all 9 buttons (disabled check, active-tab check, all-false check)
- `src/renderer/src/toolbar/__tests__/StatusPanel.test.tsx` — Added `useAtriumStore` import, `runDetachedMock` stub and store setup in `beforeEach`; added tests: More Status button present, More Status dispatches `runDetached`, waiting state shows `Waiting…` and disables button

## Deviations from Plan

None.

## Gaps Found (if any)

None.

## Ready for Phase 6

CanvasRegionHost and all dispatch wiring are in place. Phase 6 can create `DetachedResultPopup` and wire it into CanvasRegionHost so that `done` states for audit/status produce visible popups inside the canvas region.
