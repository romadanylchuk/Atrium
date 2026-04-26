# Fix canvas edge colors to match target palette
_Completed: 2026-04-23_

## Goal
Align `CONNECTION_STYLE` in `src/renderer/src/canvas/visualEncoding.ts` with the agreed target palette so each `ConnectionType` renders a distinct color/stroke. Update concrete test assertions and verify visually against a real `.ai-arch/` project.

## Implementation Summary
Updated three entries in the `CONNECTION_STYLE` map to match the target table:
- `extends` → `#a78bc9` solid (was `#8a8a92`)
- `informs` → `#7a9dc9` dotted `2 4` (was `#a78bc9` solid)
- `feeds` → `#63a082` solid (was `#63a082` dotted `2 4`)

`depends-on`, `uses`, and `UNKNOWN_CONNECTION_STYLE` were already on-palette and left untouched. Type shape, keys, and consumer code (`AtriumEdge.tsx`, `useProjectSync.ts`, `Legend.tsx`) unchanged — they all read the map generically.

Unit tests updated in `visualEncoding.test.ts`:
- Replaced stale `feeds` assertion (dasharray `2 4`/dotted → `none`/solid).
- Replaced stale `extends` color assertion (`#8a8a92` → `#a78bc9`).
- Added regression test pinning `UNKNOWN_CONNECTION_STYLE` to `#6a6a72` dashed `4 3`.
- Added concrete pin for `informs` (post-review fix) covering color/stroke/dasharray.

Phase 3 sweep confirmed zero stale concrete assertions in `Canvas.test.tsx`, `AtriumComponents.test.tsx`, or `useProjectSync.test.tsx`. Phase 4 visual verification ran `npm run dev` against a real `.ai-arch/` project and found Hypothesis B — the project used a legacy vocabulary (`dependency`, `shared-concern`, `coupled-decision`, etc.) that correctly falls through to `UNKNOWN_CONNECTION_STYLE`. Per the brief, this is an out-of-scope follow-up (palette fix itself is confirmed correct via unit tests against the map).

## Key Decisions
- **Post-review `informs` pin added** outside the original plan in response to review-2. Phase 1 changed three types but Phase 2 only pinned two concretely — `informs` was left unguarded. `fix-result.md` captures the added test.
- **Hypothesis B accepted as out-of-scope.** The brief explicitly warns the palette fix alone may not explain the user's "all wires identical" symptom and defines a non-destructive diagnostic path. Phase 4 followed it (one-shot `console.log`, observed, removed) and handed off.
- **Non-blocking observations** captured in `final-check-result.md`: `feeds.color` has no unit-test concrete pin; the UNKNOWN regression test duplicates two assertions from the identity test. Both are review-3 should-fix/suggestion items; neither blocks sign-off.

## Files Changed
- `src/renderer/src/canvas/visualEncoding.ts` (modify)
- `src/renderer/src/canvas/__tests__/visualEncoding.test.ts` (modify)

Scanned, no change:
- `src/renderer/src/canvas/__tests__/Canvas.test.tsx`
- `src/renderer/src/canvas/__tests__/AtriumComponents.test.tsx`
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx`

## Gaps/Notes
- `phase-3-result.md` was initially missing and written after the fact during `/final-check`; audit trail now complete.
- `feeds.color` silent-regression gap (unit-test only pins stroke/dasharray). Review-3 flagged as should-fix. Worth a 1-line follow-up if revisiting this area.
- Follow-up task: decide how to handle legacy architector connection vocabulary (`dependency`, `shared-concern`, etc.) — expand union, accept UNKNOWN fallback, or colour-code unknowns. Captured in `phase-4-result.md`.
- No `feature-docs.md` produced — skill-defined doc extraction (mental-model/decision-log/dependency-map) skipped.
