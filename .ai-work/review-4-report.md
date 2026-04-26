# Review Report: Phase 4
_Date: 2026-04-26_

## Status: HAS_ISSUES

## Must Fix

_None._

## Should Fix

- **`src/renderer/src/toolbar/Toolbar.tsx:24,117–130`** — `activeTab` local state drifts out of sync with the overlay.
  When the user opens StatusPanel (click Status → `activeTab='status'`, `toolbarOverlay='status'`), then dismisses it via the Close button inside CanvasRegionHost (`setToolbarOverlay(null)`), the store resets but Toolbar's local `activeTab` stays `'status'`. The Status button remains visually highlighted with no panel visible.
  → For the two overlay buttons (Status, Finalize), derive `data-active` from `toolbarOverlay` store state instead of `activeTab`. `activeTab` is already read from local state for skill buttons, so the simplest fix is: `data-active={activeTab === 'status' || toolbarOverlay === 'status' ? 'true' : 'false'}` — but cleaner is to drop `activeTab` for overlay buttons entirely and read directly from the store: `const toolbarOverlay = useAtriumStore((s) => s.toolbarOverlay)` is already subscribed in Toolbar, so `data-active={toolbarOverlay === 'status' ? 'true' : 'false'}`.

## Suggestions

- **`src/renderer/src/canvas/__tests__/CanvasRegionHost.test.tsx:182,190`** — `getAttribute('disabled') ... not.toBeNull()` is fragile. The `disabled` attribute in jsdom is present as an empty string `""`, which is truthy but `not.toBeNull()` relies on attribute presence. Use `expect(element).toBeDisabled()` / `expect(element).not.toBeDisabled()` from `@testing-library/jest-dom` — it expresses intent and is immune to attribute serialization differences.

- **`src/renderer/src/toolbar/StatusPanel.tsx` + `FinalizePanel.tsx`** — The outer scrim wrapper and inner card `div` have identical inline style objects in both files (same `position/inset/background/display/alignItems/justifyContent/paddingTop/zIndex` and same inner `background/#1e1e2e/border/borderRadius/padding/minWidth/maxWidth/width/color`). If a third panel is added in Phase 5 this will be a copy-paste source of drift.
  → Extract to a shared `ModalCard` component or a `PANEL_STYLES` constant in a sibling file. Not urgent at two panels but worth doing before a third is added.

- **`src/renderer/src/toolbar/Toolbar.tsx:139` (test file)** — The type cast `'term-1' as ReturnType<typeof useAtriumStore.getState>['terminal']['id']` is verbose and inconsistent with `CanvasRegionHost.test.tsx` which simply uses `'tid' as TerminalId`. Use `as TerminalId` for consistency.

## Summary

The phase 4 geometry overhaul is clean and correct — absolute positioning, canvas-region containment, and store-driven overlay dispatch all work as designed. The one real issue is the `activeTab` / `toolbarOverlay` state drift in Toolbar: overlay buttons stay visually highlighted after the panel closes externally, which is visually misleading and will confuse users. Fix it before shipping. The duplicate panel styles are a low-priority cleanup, and the test attribute checks are a minor robustness improvement.
