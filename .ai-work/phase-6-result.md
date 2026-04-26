# Phase 6 Result: Detached result popups (Audit + Status)
_Plan: `.ai-work/feature-plan.md`_
_Date: 2026-04-26_

## Status: VERIFIED

## What Was Implemented

- `src/renderer/src/toolbar/DetachedResultPopup.tsx` — New component. `position: absolute; inset: 0` overlay matching the StatusPanel pattern; centered card with `maxWidth: 560`; `<pre>` body with `whiteSpace: pre-wrap`, `maxHeight: 60vh`, monospace at 12px; Close button with `${testid}-close` testid; empty output renders the same layout without crashing.
- `src/renderer/src/canvas/CanvasRegionHost.tsx` — Extended to subscribe to `detachedRuns` and `closeDetachedResult`; renders `<DetachedResultPopup title="Audit" …>` when `detachedRuns.audit.kind === 'done'` and `<DetachedResultPopup title="Status" …>` when `detachedRuns.status.kind === 'done'`; both can render simultaneously.
- `src/renderer/src/toolbar/__tests__/DetachedResultPopup.test.tsx` — New test file (5 tests): verbatim output including `*` characters, `onClose` called on close button click, empty output renders without crash, testid propagation, overlay has `position: absolute` not `fixed`.
- `src/renderer/src/canvas/__tests__/CanvasRegionHost.test.tsx` — Extended with 8 new tests: audit popup renders with correct output inside canvas region, status popup renders with correct output inside canvas region, both popups render simultaneously when both slices are `done`, closing audit popup sets `detachedRuns.audit.kind` to `idle`, closing status popup sets `detachedRuns.status.kind` to `idle`, no audit popup when idle, no status popup when idle; added `DetachedResultPopup` mock.

## Deviations from Plan

None.

## Gaps Found (if any)

None.

## Ready for Phase 7 (if any)

All phases complete → run `/final-check`
