# Validation Report: Toolbar additions & canvas-bounded popup geometry
_Date: 2026-04-26_

## Status: APPROVED

## Issues Found (round 1)

1. **Decision §1 / `DetachedSkillName` includes `'new'`** — the runtime never dispatches `'new'` as a `-p` run (it's an interactive skill). Including `'new'` in `DetachedSkillName` is dead surface and risks future confusion.

2. **Phase 4 completion criterion uses "manual check"** — "with the app running, opening any popup keeps SidePanel and Chat fully visible" is not verifiable in CI. Need a deterministic assertion.

3. **Phase 6 step 5 ambiguity** — "Easiest path: keep the assertion at the slice level and let CanvasRegionHost.test.tsx cover the render path" reads as a deferral rather than a concrete test target. The verifier won't know which file owns the integration coverage.

4. **Phase 5 misses visual `data-active` semantics for new buttons** — the existing pattern relies on `data-active="true"` for highlighting; new buttons (Free, New, Triage, Audit) need explicit treatment, particularly Audit which never opens a panel and so should never set `data-active='true'`.

## Fixes Applied

1. Trimmed `DetachedSkillName` to `Extract<SkillName, 'audit' | 'status'>` in Changed Contracts and decision §1; updated initial slice to only `audit` and `status`.

2. Replaced Phase 4's manual check with a deterministic assertion: a styles-grep test asserts that `TerminalModal`, `StatusPanel`, `FinalizePanel`, and `DetachedResultPopup` render with `position: 'absolute'` (no `'fixed'`) and that each is rendered as a descendant of `[data-region="canvas"]` in the integration tests.

3. Phase 6 step 5 reworded: the slice→popup integration is owned by `CanvasRegionHost.test.tsx`. The dispatch path is owned by `dispatchDetachedSkill.test.ts`. The Toolbar test does not need to cover the popup render path.

4. Phase 5 step 1 + step 3 amended: each new button gets a `data-active` attribute. Free/New/Triage follow the existing skill-button pattern (active while their tab was last clicked, until another tab takes focus). **Audit always renders `data-active='false'`** — clicking it never affects `activeTab` because it doesn't open a "tab"-style overlay.
