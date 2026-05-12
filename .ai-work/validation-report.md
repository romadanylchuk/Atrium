# Validation Report: Replace Consultation Chat Panel with Consultation Terminal
_Date: 2026-04-28_

## Status: APPROVED

## Issues Found
1. **Phase 6 missing EdgeTab visibility guard.** The brief's edge case states "EdgeTab is hidden or
   disabled when `project === null`". The original plan did not update `ConsultationRegion.tsx` to
   check project state. Without this fix, clicking the EdgeTab with no project loaded would open
   an empty panel where the terminal never spawns, producing a broken-looking UI.

## Fixes Applied
1. Added `src/renderer/src/consultation/ConsultationRegion.tsx` to the affected files table
   (modify: add project-null guard, return null when `project === null`).
2. Updated Phase 6 step 5 to explicitly update `ConsultationRegion.tsx` (3-line change:
   `useAtriumStore(s => s.project)` + early return null).
3. Updated the edge cases table to reflect both the `ConsultationRegion` null-return guard and
   the `useConsultationTerminal` projectRoot guard as the two layers of no-project protection.
