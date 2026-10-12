# Validation Report: Sticky Node Layout + Consultation Terminal Clipboard Parity
_Date: 2026-05-13_

## Status: APPROVED

## Validator Checklist

- [x] Every plan step is tied to a specific file. All 8 substeps across 2 phases name the exact file (`useProjectSync.ts`, `Canvas.tsx`, two `__tests__` files, `ConsultationPanel.tsx`, its test).
- [x] All edge cases from the brief are reflected.
  - Issue 1 (brief 95–104): stale seed slug, all-identical-seed gate (explicit hook into the new `useDagreForAdded` predicate caught during draft), StrictMode double-invoke, project switch (added explicit `prevNodesRef.current = []` reset on `hash` change), concurrent watcher + drag, `useNodesState` re-render loops, first-render race — all addressed in the Edge Cases in Implementation section.
  - Issue 2 (brief 107–113): clipboard permission, `spawning`, `exited`, `id === null`, empty / whitespace clipboard, paste-marker injection, right-click — each backed by a step or test.
- [x] No public-contract change leaves a consumer unupdated. `useProjectSync` is the only contract that widens; its only importer is `Canvas.tsx`, which is updated in the same phase. `ConsultationPanel` adds no exported API surface.
- [x] No step depends on a prior result without verification. Each phase has an explicit Completion Criterion (tests + manual smoke). Phase 2 lists Phase 1 as dependency.
- [x] Nothing in the plan exceeds the brief scope. Out-of-scope items from the brief are explicitly mirrored in "What Is NOT Implemented" (no IPC change, no toolbar additions, no TerminalModal edits, no consultation-service dead-file removal, no context menu).
- [x] Every phase has a verifiable completion criterion. Phase 1: full vitest suite green + 5 new test cases + 3 manual smoke checks + typecheck + lint. Phase 2: same shape, 7+ new test cases + 4 manual smoke checks.
- [x] Plan respects the project's patterns. No `profile.json` present — defaults adopted: TS-everywhere (CLAUDE.md), `Result<T,E>` not introduced (renderer-only here), `.catch(() => {})` style for clipboard mirrors `TerminalModal.tsx:68/83`, `useCallback` with stable deps for callbacks, no new dependencies.
- [x] Each phase fits the conservative token budget.

## Budget Check
_(No `phase_token_budget` in `profile.json`. Using conservative default 130K with 100K warn-at.)_

| Phase | Estimate | Budget | Status |
|-------|----------|--------|--------|
| 1 — Sticky positions | ~70K | 130K | OK |
| 2 — Consultation clipboard | ~50K | 130K | OK |

Breakdown (Phase 1):
- Baseline (skill + brief + sentinel): ~8K
- `feature-plan.md`: ~8K
- `useProjectSync.ts` (~188 lines): ~2K
- `Canvas.tsx` (~141 lines): ~1.3K
- `useProjectSync.test.tsx` (521 lines): ~5.5K
- `Canvas.test.tsx` (185 lines): ~1.8K
- Reference reads (`dagreLayout.ts`, `layoutPersistence.ts`, `atriumStore` slice, React Flow types): ~7K
- Verifier round + corrections + output: ~10K
- 30% headroom: ~13K
- Total: ~57K + headroom ≈ ~70K. Comfortable.

Breakdown (Phase 2):
- Baseline ~8K + plan ~8K + `phase-1-result.md` ~5K + `ConsultationPanel.tsx` (~6K chars / 1.5K tokens) + `ConsultationPanel.test.tsx` (~3K / 0.8K) + reference (`TerminalModal.tsx` 11K/2.7K, `clipboardKeymap.ts` 0.3K, `bracketedPaste.ts` 0.2K, `atriumStore` consultation slice ~2K) + verifier ~8K + 30% headroom.
- Total ≈ ~38K + headroom ≈ ~50K. Comfortable.

## Issues Found
None.

## Fixes Applied During Draft (self-corrections folded into the plan before APPROVED)
1. Added `allIdenticalSeeds` to the `useDagreForAdded` predicate to preserve the existing auto-layout-marker first-open behavior — initially the predicate would have routed those nodes to viewport center, breaking the case-F test.
2. Added explicit `prevNodesRef.current = []` reset on `projectHash` change so project-A nodes do not leak into a project-B first sync.
3. Rewrote case 7 (slug rename) expectation: new slug now lands at viewport center, not dagre — corrected to match the new "dagre only on first open or relayout" rule.
4. Excluded `MainShell.test.tsx` from Affected Files after inspection — it mocks both `ConsultationPanel` and routes around `Canvas`'s sync internals, so neither fix surfaces there.
