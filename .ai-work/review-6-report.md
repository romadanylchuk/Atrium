# Review Report: Phase 6
_Date: 2026-04-26_

## Status: HAS_ISSUES

## Must Fix

_None._

## Should Fix

- **`src/renderer/src/toolbar/DetachedResultPopup.tsx:4`** `title` is typed as `'Audit' | 'Status'` but the component never branches on this value — it only renders `{title} Output` as a string. The union type couples a display-only prop to its current callers for no correctness benefit. If a third detached run type were added, a type change would be required even though the rendering logic is identical.
  → Change `title: 'Audit' | 'Status'` to `title: string`.

## Suggestions

- **`src/renderer/src/canvas/CanvasRegionHost.tsx:52–67`** When both audit and status runs are `done`, two full-coverage `position: absolute; inset: 0; zIndex: 100` overlays stack. The audit popup renders first and is completely hidden under the status overlay — the user cannot close it until they dismiss status. The spec says "both can render simultaneously" but the current stacking makes the earlier one unreachable.
  → Either render them with ascending z-index values (`zIndex: 100` / `zIndex: 101`), or display them side-by-side / sequentially in a queue so neither popup is occluded.

- **`src/renderer/src/toolbar/__tests__/DetachedResultPopup.test.tsx:22,30,51–52,68–69,82–83`** Four of the five tests assert `.toBeDefined()` on elements returned by `getByTestId`. `getByTestId` already throws on miss, so these assertions always pass and provide no signal. They read like intent tests but don't catch anything `getByTestId` itself doesn't.
  → Replace `expect(el).toBeDefined()` with a check on something meaningful (e.g., `screen.getByRole('dialog')` or the heading text), or simply rely on the non-throwing `getByTestId` call as the assertion.

## Summary

Phase 6 is clean and consistent with the existing overlay pattern (StatusPanel / FinalizePanel). The single should-fix is the unnecessarily narrow `title` union type on a display-only prop. The z-index stacking of simultaneous popups is a UX gap worth addressing before shipping, but not a code correctness issue. Tests are thorough and structurally sound; the `.toBeDefined()` redundancy is cosmetic.
