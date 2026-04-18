# Validation Report: Project Scaffolding (Stage 01)
_Date: 2026-04-17_

## Status: APPROVED

## Issues Found (Round 1)

1. **Redundant `src/shared/.gitkeep`** — Phase 5 step 6 created `src/shared/.gitkeep`, but Phase 7 places the smoke test at `src/shared/__tests__/smoke.test.ts`, which already makes the directory git-trackable. The `.gitkeep` is dead weight.

2. **Phase 1 version probe too loose** — `npm view electron version` returns the latest published version, which could become 42.x between now and implementation. The brief explicitly forbids 42 ("not 42 even if beta"). The probe must constrain to the 41 major.

3. **Unnecessary `@eslint/js` dependency + ESLint parser-options footgun** — The draft added `@eslint/js` to devDependencies, but the brief only specifies `typescript-eslint` with `recommendedTypeChecked`. Separately, the draft's `parserOptions.project: ['./tsconfig.node.json']` approach would break on `eslint.config.js` itself (not in any tsconfig include) — this would fail Phase 6's completion criterion at runtime.

## Fixes Applied (Round 1)

1. Removed the `.gitkeep` row from Affected Files; removed Phase 5 step 6; updated Phase 5 completion criterion from "six files" to "five files"; added a note that `src/shared/` becomes tracked via the smoke test's parent dir.

2. Changed Phase 1 step 2 to `npm view "electron@^41" version` — explicitly constrained to major 41.

3. Removed `@eslint/js` from Phase 2 devDependencies; switched ESLint config to `typescript-eslint` (`tseslint.config(...)` helper) using `parserOptions.projectService: true` + `tsconfigRootDir: import.meta.dirname`. Added a `disableTypeChecked` override for `*.config.{js,ts}` files so the config files themselves lint cleanly without being in the TS project. Added decision **D7** to the Decision Log documenting the choice against legacy `project: [...]`.

## Checklist After Fixes

- [x] Every plan step tied to a specific file (verification-only steps in Phase 8/9 explicitly marked).
- [x] All 9 edge cases from the brief reflected in the "Edge Cases in Implementation" section.
- [x] No public contract changed without consumer updates (greenfield; no consumers exist).
- [x] Every phase has an explicit, verifiable completion criterion.
- [x] No scope creep — nothing from brief §Out of Scope is added; the small additions (CSP `<meta>`, `.prettierignore`) are standard config hygiene, not feature work, and match the brief's spirit (e.g. "Scripts format / format:check invoke Prettier directly" implies some ignore list is needed).
- [x] Decision Log captures the 7 non-obvious choices: phase ordering (D1), preload path resolution (D2), sandbox: false justification (D3), split tsconfigs (D4), alias duplication strategy (D5), smoke test location (D6), ESLint parser-options (D7).

## Result

Plan is APPROVED after one revision round. Ready for `/implement phase-1`.
