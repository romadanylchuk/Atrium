# Fix Result: disable Finalize toolbar button when !switchAllowed
_Date: 2026-04-26_

## Status: VERIFIED

## Issue Addressed
The Finalize toolbar button remained enabled when a terminal was active (`!switchAllowed`). Per the feature brief, all interactive skill buttons (including Finalize) should be disabled when the terminal slot is busy. The inner `FinalizePanel` Continue button was already gated via `canContinue`, but the toolbar entry point was not.

## What Was Changed
- `src/renderer/src/toolbar/Toolbar.tsx` — Added `disabled={!switchAllowed}` and updated `tabStyle` call to pass `!switchAllowed` instead of `false` for the Finalize button.
- `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx` — Updated test title from "Free/New/Triage/Explore/Decide/Map disabled when terminal active; Audit/Status/Finalize remain enabled" to "…/Finalize disabled when terminal active; Audit/Status remain enabled". Flipped Finalize assertion from `toBeNull()` to `not.toBeNull()`.

## Verification
- `npx vitest run src/renderer/src/toolbar/__tests__/Toolbar.test.tsx` → 28/28 tests pass, no regressions.
