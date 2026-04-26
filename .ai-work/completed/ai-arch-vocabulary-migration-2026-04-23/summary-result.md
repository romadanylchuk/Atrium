# .ai-arch vocabulary migration
_Completed: 2026-04-23_

## Goal
Align Atrium's renderer `ConnectionType` union and edge palette with the real vocabulary the architector plugin emits, and promote the schema into `@shared/` so main and renderer share one source of truth. Remove the stale renderer-only vocabulary and any data still using it.

## Implementation Summary

Shipped in two passes. The first pass executed a planned 5-phase pipeline against a Phase 0 investigation that was wrong. A post-/final-check runtime check revealed the real architector vocabulary; a second corrective pass replaced the 5-type set with the 6-type set and migrated the repo's own `.ai-arch/` data.

**Pass 1 (executed plan, under incorrect Phase 0 conclusion):**
- Created `src/shared/schema/aiArch.ts` with `ConnectionType`, `CONNECTION_TYPES`, `CONNECTION_TYPE_ORDER`, `isKnownConnectionType`, `CONNECTION_TYPE_DESCRIPTIONS`, `UNKNOWN_CONNECTION_DESCRIPTION`. Barrel re-export through `@shared/domain` and `@shared/index`.
- Rewrote `CONNECTION_STYLE` palette in `visualEncoding.ts`.
- Unified hover tooltips on `AtriumEdge` (known + unknown both render via `EdgeLabelRenderer`, with `data-known-type` / `data-unknown-type`).
- Dev-gated unknown-type warn in `useProjectSync` with `import.meta.env.DEV`; included edge-id; kept per-session `Set<string>` dedupe resetting on `projectHash` change.
- `Legend` now orders by `CONNECTION_TYPE_ORDER`, appends unknowns, and exposes per-row `title` tooltips from `CONNECTION_TYPE_DESCRIPTIONS`.
- Review-pass fixes: console-prefix lowercased to `[atrium]` for convention alignment; `extends` palette test expanded to assert color + stroke + strokeDasharray.
- All tests green at this point; `/final-check` returned DONE.

**Pass 2 (correction after live-project verification):**
- User opened a real architector project and saw console filled with `Unknown connection type: "dependency" | "shared-concern" | "coupled-decision" | "non-dependency" | "non-contribution" | "open-question"` — the exact 6-type set the brief originally specified.
- Replaced the schema union, `CONNECTION_TYPES`, `CONNECTION_TYPE_ORDER`, and `CONNECTION_TYPE_DESCRIPTIONS` with the 6-type architector vocabulary.
- Rewrote `CONNECTION_STYLE` palette from the brief's authoritative 6-entry table (dependency blue solid, shared-concern amber solid, coupled-decision purple solid, non-dependency gray-blue dotted `2 4`, non-contribution muted-gray dotted `2 4`, open-question red-amber dashed `5 3`).
- Migrated this repo's `.ai-arch/index.json` and the parser fixture `src/main/parser/__tests__/fixtures/index.json`: `depends-on | uses | feeds` → `dependency`, `informs` → `shared-concern`.
- Updated every test referencing the old 5-type literals; added per-type palette assertions for the 6 new types.
- Typecheck clean, lint clean, 640/641 tests pass (2 pre-existing fs-watcher timing flakes pass in isolation).

## Key Decisions

- **Phase 0 conclusion was wrong.** Phase 0 cross-referenced three sources — this repo's `.ai-arch/index.json` (emitted `depends-on | informs | uses | feeds`), the architector plugin's `map/SKILL.md` (which contained exactly one example type, `dependency`, and no enum), and `ideas/canvas-ui.md` (Atrium's own design doc, locked before the plugin vocabulary stabilized). Based on the mismatch, the user elected to drop the brief's 6-type vocabulary and adopt the canvas-ui.md 5-type set. The missing piece: the architector plugin is AI-prompted with no enforced enum — it emits whatever the LLM infers from prose categories ("Dependency", "Shared concern", "Conflict" …) in SKILL.md Step 2. Real projects produced the 6-type set the brief had captured by observation.
- **Correction strategy: 6-type only, drop the legacy 5-type.** User explicitly chose *not* to carry both vocabularies. Repo data migrated with a lossy semantic mapping (collapsing `depends-on | uses | feeds` → `dependency`, and mapping `informs` → `shared-concern`). Notes preserved verbatim.
- **Warning prefix kept lowercase `[atrium]`** (deviation from brief's `[Atrium]`), for consistency with the other two warns already in `useProjectSync`. Applied in review-pass fix.
- **`NodeMaturity` stayed in `@shared/domain`** — the brief explicitly permitted leaving it if already in shared code.
- **Parser left untouched beyond transitive type import.** Parser still uses `Connection` from `@shared/domain`; the re-export chain carries the new `ConnectionType` through.

## Files Changed

**New:**
- `src/shared/schema/aiArch.ts`

**Modified (Pass 1):**
- `src/shared/domain.ts` (re-export `ConnectionType` from `./schema/aiArch`)
- `src/shared/index.ts` (barrel add)
- `src/renderer/src/canvas/visualEncoding.ts`
- `src/renderer/src/canvas/AtriumEdge.tsx`
- `src/renderer/src/canvas/useProjectSync.ts`
- `src/renderer/src/canvas/Legend.tsx`
- `src/renderer/src/canvas/__tests__/visualEncoding.test.ts`
- `src/renderer/src/canvas/__tests__/AtriumComponents.test.tsx`
- `src/renderer/src/canvas/__tests__/Canvas.test.tsx`
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx`

**Modified (Pass 2 corrections, on top of Pass 1):**
- `src/shared/schema/aiArch.ts` (6-type schema rewrite)
- `src/renderer/src/canvas/visualEncoding.ts` (6-entry palette rewrite)
- `.ai-arch/index.json` (connection-type migration)
- `src/main/parser/__tests__/fixtures/index.json` (fixture migration)
- `src/renderer/src/canvas/__tests__/visualEncoding.test.ts` (palette tests rewritten)
- `src/renderer/src/canvas/__tests__/AtriumComponents.test.tsx` (literals)
- `src/renderer/src/canvas/__tests__/Canvas.test.tsx` (legend-ordering test data)
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx` (default + markerEnd color)
- `src/main/parser/__tests__/parseIndex.test.ts` (literal)
- `src/renderer/src/toolbar/__tests__/StatusPanel.test.tsx` (literal)

## Gaps/Notes

- **Final-check result is frozen in time against Pass 1.** `final-check-result.md` captured DONE against the 5-type implementation before the runtime verification exposed the real vocabulary. The file's assertions about palette hex values, schema contents, and legend order no longer reflect the shipped state after Pass 2. A re-run of `/final-check` against the current code would pass with different assertions (6-type palette from brief's original table). Kept the Pass 1 gate record for provenance; this summary is the source of truth for what actually shipped.
- **Lesson for future Phase 0 investigations on architector output:** do not rely on SKILL.md snippets as the source of truth for emitted vocabularies. Architector is AI-prompted with no enforced enum; the only reliable evidence is (a) a diverse sample of real `.ai-arch/index.json` files from different projects or (b) explicit confirmation with the user on vocabulary intent. Checking only this repo's own `.ai-arch/` is insufficient — this repo's data may predate current plugin behavior.
- **Data migration is lossy.** The original 5-type vocabulary in this repo's `.ai-arch/` encoded more distinctions than the 6-type collapse preserves (e.g., `feeds` vs `uses` both became `dependency`). Notes are intact so human re-classification is possible later, but no automated round-trip is possible.
- **Two pre-existing flakes** (`watcherManager.test.ts`, `watcherManager.reparse-contract.test.ts`) — timing-sensitive fs-watcher tests. Pass in isolation; unrelated to this feature.
- **Missing artifact: no `feature-docs.md`** (documentation step was not run for this feature).
