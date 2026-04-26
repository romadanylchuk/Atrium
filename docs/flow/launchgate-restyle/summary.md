# Feature Summary: LaunchGate Restyle
_Archived: 2026-04-22_
_Status: DONE_

## Goal

Restyle the `LaunchGate` view (the pre-project gate that renders when `project === null`) to match the dark palette and visual language locked in by the Canvas View Redesign cycle (`docs/flow/canvas-view-redesign/summary.md`). Previously the gate was the only renderer surface still shipping unstyled browser-default chrome — large default `<h1>`, default `<h2>`, default `<button>`, and a hand-drawn dark grey card. The cycle restyles it to feel like the same app as the post-redesign main shell while preserving every existing behaviour (gate-passes-when-claude-found, Open project flow, recents click-to-switch, `NewProjectForm` sub-view). All work is renderer-only — no main / preload / shared / IPC / parser / layout-schema changes.

## What Was Built

**Renderer — `src/renderer/src/launch/LaunchGate.tsx` (full rewrite):**
- Swapped the one-shot `HealthSection` probe for `healthStatus` / `healthInfo` subscriptions from the Zustand slice (already populated by `useHealthPoll` mounted in `App.tsx`).
- Full visual rewrite: full-bleed centred column on `#0f0f13`, `Atrium` brand heading (`32px / weight 500 / #e6e6e6`), `RECENT` and `OPEN` section headers (`<div role="heading" aria-level={2}>` styled `11px / #6a6a72 / uppercase`), inline restyled recents list using `formatRelativeTime`, `Open project…` button matching `ProjectPanel.tsx:161` byte-for-byte (U+2026 ellipsis).
- Unreachable-explainer paragraph rendered only when `healthStatus === 'unreachable'` (`Claude CLI not found. Install Claude Code, then Atrium will reconnect automatically.`), positioned above the Open button inside the OPEN section.
- Bottom health-line `<div data-testid="launch-health-line">` pinned via `margin-top: auto`, rendering one of `claude v{version} · healthy` / `claude · healthy` (defensive) / `claude · unreachable` / `claude · checking` (U+00B7 middle dot, byte-equivalent to `ProjectPanel.tsx:98-105`).
- Scoped `<style>` block keyed off `className="launch-gate-column"` for hover (`#1a1a1f`) and focus-visible (`outline: 1px solid #3a3a42; outline-offset: 1px`) states — no new `data-testid` introduced beyond `launch-health-line`.
- Restyled inline error paragraphs (`switchError`, `body.error`) to `color: #f38ba8; font-size: 12px`.
- Preserved `role="dialog"` + `aria-modal="true"`, the `body.view === 'new-project'` branch, `handleOpen` / `handleRecentPick` / `handleNewProjectSubmit` callbacks, and the `dispatchInitSpawn(req, 'gate')` shim signature unchanged.

**Renderer — deletions:**
- `src/renderer/src/launch/HealthSection.tsx` — removed (replaced by store subscription + bottom health-line + unreachable-explainer).
- `src/renderer/src/launch/RecentsList.tsx` — removed (gate inlines a restyled list; no other consumers after Phase 3 of the canvas redesign).
- `src/renderer/src/launch/__tests__/RecentsList.test.tsx` — removed alongside the component.

**Renderer — tests — `src/renderer/src/launch/__tests__/LaunchGate.test.tsx`:**
- Added a `beforeEach` reset that seeds `{ project: null, healthStatus: 'healthy', healthInfo: { claudePath, version: '1.0.0' } }`.
- Deleted two obsolete tests (`shows health error and Recheck button on health check failure`, `Recheck button re-invokes health.checkClaude`).
- Added four new tests: health-line with version, health-line `checking` + no explainer, health-line `unreachable` + explainer visible, Open button stays enabled when unreachable.
- Updated all Open-button matchers from `/open/i` to `/open project/i` (6 tests) to pin the new affordance text.

**E2E — `e2e/scenario1-launch.spec.ts`:**
- Button role matcher: `'Open'` → `'Open project…'` (exact U+2026 ellipsis).
- Health regex: `/Claude .* found\./` → `/claude .* · healthy/` (lowercase, U+00B7 middle dot, `healthy` suffix).
- Comments refreshed: dropped `HealthSection` / `RecentsList` references; replaced with wording matching the new architecture.

## Phases Completed

| Phase | Name | Key Outcome |
|-------|------|-------------|
| 1 | Switch health source to store slice; rewrite obsolete unit tests | `LaunchGate` reads the Zustand `healthStatus` / `healthInfo` slice; `HealthSection.tsx` deleted; 4 new unit tests cover the health-line + unreachable-explainer pattern; 2 obsolete `Recheck` tests removed. Layout intentionally unchanged. |
| 2 | Visual restyle — centred column, brand, restyled button, inline recents | Full visual rewrite of `LaunchGate.tsx` to the locked palette; `RecentsList.tsx` + its test deleted; button label switched to `Open project…`; 6 test matchers updated; `data-testid="launch-health-line"` is the only new testid. |
| 3 | e2e fixup — match new health-line text and Open button label | `e2e/scenario1-launch.spec.ts` updated with exact U+2026 button name and U+00B7 health regex; stale `HealthSection` / `RecentsList` comments removed. |

## Edge Cases Handled

- **`healthInfo === null` with `healthStatus === 'healthy'`** → renders `claude · healthy` via the defensive ternary ladder at `LaunchGate.tsx:101–108` (mirrors `ProjectPanel.tsx:98-105`).
- **Initial paint before first poll** → `healthStatus: 'checking'` (store default) → bottom line reads `claude · checking`, no explainer (explainer is gated on `'unreachable'` only).
- **Single / double health-probe failure** → handled entirely by `useHealthPoll`'s 3-failure debounce (untouched); slice does not flip to `'unreachable'` on a flake, so the explainer does not flash.
- **More than 5 recents in storage** → `setRecents(r.data.slice(0, 5))` preserved at `LaunchGate.tsx:51`; inline list maps over `recents` directly so the cap holds.
- **Recent with empty `name`** → `<span>{r.name || r.path}</span>` fallback at line 167 preserves the prior `RecentsList.tsx:24` behaviour.
- **Long recent names / paths** → `wordBreak: 'break-all'` on the name span at line 166 (matches `ProjectPanel.tsx:141`); column wraps within 360–400px.
- **Picker error / open error** → `body.error` populates the restyled `<p role="alert">` at line 206 with `color: '#f38ba8'`.
- **`switchProject` error (e.g., `BLOCKED_BY_TERMINAL`)** → `switchError` populates the restyled alert paragraph at line 175; dialog stays open; existing `shows inline error when switchProject fails, gate stays open` test still green.
- **`NewProjectForm` cancel path** → no Cancel button added to the gate (Out of Scope §5); `body.view === 'new-project'` branch unchanged.
- **Dark mode only** → verified by `grep -r "prefers-color-scheme" src/renderer` → zero matches.
- **Tall viewport** → `margin-top: auto` on the health-line pins it to the column's natural flow bottom; outer flex centres the column.
- **Short viewport (< 500px tall)** → overflow accepted per the brief; no scroll added.
- **`useHealthPoll` not mounted** → cannot happen in production (`App.tsx:14`); unit tests seed the slice directly via `useAtriumStore.setState`.
- **Open button always enabled when unreachable (Q8 / Out of Scope §7)** → pinned by both the Phase 1 unit test and `LaunchGate.tsx:191 — disabled={body.openBusy}` (no `healthStatus` condition).

## Deviations From Original Plan

- **Phase 1 — `beforeEach` seed shape (minor).** The plan named `claudePath: '/usr/bin/claude'`; the implementation used the same shape. No deviation.
- **Phase 2 — explainer margin shorthand.** Plan step 4c specified `fontSize: 11px; color: #8a8a92; lineHeight: 1.4; marginBottom: 8px`; implementation used `margin: '0 0 8px'` at line 185. Functionally equivalent — explicitly zeros top margin and matches the required bottom margin. Flagged as a minor observation in `review-2-report.md`, not a regression.
- **Phase 2 — `baseAtrium()` still includes `health.checkClaude` mock.** Plan explicitly permitted this ("The mock `atrium.health.checkClaude` may still be set by tests but the component must not call it"). Left as inert dead mock; no test depends on it. Flagged in `review-1-report.md` and `review-2-report.md` as non-blocking.

No phase reported scope deviations — every file touched was on the plan's Affected Files table.

## Fixes Applied

None — no `fix-*-result.md` artifacts were produced during this cycle. All three phases passed review on first submission.

## Out of Scope (Not Implemented)

The following were explicitly deferred per the brief and are preserved for future cycles:

1. No changes to `src/main/`, `src/preload/`, `src/shared/`, or `src/renderer/src/store/atriumStore.ts`. Renderer-only restyle.
2. No new runtime dependencies. Inline styles + one scoped `<style>` block only.
3. No light-mode / theme-toggle support. No `@media (prefers-color-scheme: light)` rules.
4. **No restyle of `NewProjectForm.tsx`.** The form keeps its default-browser chrome; a separate cycle (carved out by Phase 3 of the canvas redesign) handles it.
5. No Cancel button added to the gate's `NewProjectForm` sub-view. Current behaviour ("no Cancel on gate; only `ProjectPanel` exposes one") preserved.
6. No deletion or restyle of `openOrNewProject.ts` or `buildInitPrompt.ts`.
7. **No change to warn-but-don't-block on `healthStatus === 'unreachable'`.** The Open button stays enabled regardless of health. A future cycle may decide to gate the button on health (behaviour change, not restyle) — explicitly not in scope here.
8. No behaviour change in `useHealthPoll`. 30s poll, in-flight guard, 3-failure debounce, focus-recheck all unchanged.
9. No change to `dispatchInitSpawn` or the `'gate'` source tag.
10. No changes to `App.test.tsx` beyond what existing assertions need (which was: nothing).
11. No new `data-testid`s except `launch-health-line`. The scoped hover/focus CSS uses `className="launch-gate-column"` — a deliberate design from the validation pass (initial plan draft proposed `data-testid="launch-gate"`; reverted to className to honour this restriction).
12. No Playwright additions beyond the two text-assertion updates in `e2e/scenario1-launch.spec.ts`.
13. No bundle-size budget work. Renderer bundle was 1.56 MB after the prior cycle; restyle is noise-level. `TerminalModal` / `StatusPanel` / `FinalizePanel` code-splitting remains flagged as a next-cycle win.

## Review Findings

- `review-1-report.md` (Phase 1) — **PASSED.** Zero must-fix, zero should-fix. Two non-blocking observations: `health.checkClaude` mock remains in `baseAtrium()` (inert, permitted); `RecentsList.tsx` + test still present (correct — deleted in Phase 2).
- `review-2-report.md` (Phase 2) — **PASSED.** Zero must-fix, zero should-fix. Three non-blocking observations: `body.error` type narrowing is correct; inert `health.checkClaude` mock remains (harmless); explainer uses `margin: '0 0 8px'` shorthand (functionally equivalent to plan's `marginBottom: 8px`).
- `review-3-report.md` (Phase 3) — **PASSED.** Zero must-fix, zero should-fix. File shape unchanged (1 test, 2 imports). Byte-level verification of U+2026 ellipsis and U+00B7 middle dot confirmed.

No `review-all-report.md` was produced for this cycle — per-phase reviews covered the scope.

## Final Check Outcome

`check-result.md` — **Status: DONE.**

All three phases ship together cleanly; the entire feature satisfies the brief (not just the plan). Every critical invariant called out by the team-lead is verified at the source:

1. Out of Scope §7 / Q8 — Open button stays enabled regardless of `healthStatus` (`LaunchGate.tsx:191 — disabled={body.openBusy}` only).
2. Out of Scope §11 — only `data-testid="launch-health-line"` is sanctioned; no other testids in `src/renderer/src/launch/`.
3. Renderer-only — `src/main`, `src/preload`, `src/shared` all zero-diff vs HEAD this cycle.
4. No new runtime dependencies — `package.json` / `package-lock.json` unchanged.
5. Dark mode only — zero `prefers-color-scheme` rules across `src/renderer`.
6. `HealthSection.tsx` and `RecentsList.tsx` deleted; zero references anywhere in `src/`.
7. Three-state health-line copy byte-equivalent across `LaunchGate.tsx:101–108` and `ProjectPanel.tsx:98–105` (U+00B7 verified byte-by-byte).
8. Phase 3 Unicode — e2e matchers byte-for-byte against `LaunchGate.tsx` (U+2026 button name, U+00B7 health regex).
9. `useHealthPoll` untouched.
10. `NewProjectForm.tsx` untouched.

All 13 out-of-scope items honoured. All 7 concrete scenarios from the brief (lines 119–129) render correctly. All edge cases (brief lines 131–145) verified.

Exit gates at final check:
- `npm run typecheck` — green (0 errors).
- `npm run lint` — green (0 errors / 0 warnings).
- `npm run test` — 584 passed, 1 skipped, 1 tolerated failure (pre-existing `watcherManager.reparse-contract.test.ts` Windows timing flake; zero diff vs HEAD this cycle; tolerated per team-lead instructions and `.flow-spec/project.md`).
- Playwright (`npm run test:e2e`) — not executed (no Electron display in this environment); verified statically against `LaunchGate.tsx` source with byte-level Unicode confirmation.

## Files Changed

| File | Change | Note |
|------|--------|------|
| `src/renderer/src/launch/LaunchGate.tsx` | modified | Full visual rewrite; health-source swap to Zustand slice; inline recents; unreachable-explainer; bottom health-line with `margin-top: auto`; `Open project…` button; scoped `className="launch-gate-column"` CSS. |
| `src/renderer/src/launch/HealthSection.tsx` | deleted | Replaced by store subscription + bottom health-line + unreachable-explainer. |
| `src/renderer/src/launch/RecentsList.tsx` | deleted | Gate inlines its own restyled list; no other consumers after canvas redesign Phase 3. |
| `src/renderer/src/launch/__tests__/RecentsList.test.tsx` | deleted | Removed alongside the component. |
| `src/renderer/src/launch/__tests__/LaunchGate.test.tsx` | modified | New `beforeEach` health seed; 2 obsolete `Recheck` tests removed; 4 new tests added (health-line variants + Open-stays-enabled-when-unreachable); 6 Open-button matchers switched to `/open project/i`. |
| `e2e/scenario1-launch.spec.ts` | modified | Button matcher → `Open project…` (U+2026); health regex → `/claude .* · healthy/` (U+00B7); comments refreshed. |

Files explicitly NOT touched this cycle (verified by `git diff --stat HEAD`): `src/renderer/src/launch/NewProjectForm.tsx`, `src/renderer/src/launch/openOrNewProject.ts`, `src/renderer/src/launch/buildInitPrompt.ts`, `src/renderer/src/launch/index.ts`, `src/renderer/src/App.tsx` (wiring already correct), `src/renderer/src/store/atriumStore.ts`, `src/renderer/src/health/useHealthPoll.ts`, everything under `src/main/` / `src/preload/` / `src/shared/`.

## Notes

- **Pre-existing dirty state carried across from canvas-view-redesign.** At the start of this cycle `git status` showed uncommitted modifications under `src/renderer/src/canvas/`, `src/renderer/src/sidePanel/`, `src/renderer/src/toolbar/`, `src/renderer/src/shell/`, `src/renderer/src/store/`, plus untracked `src/renderer/src/canvas/CanvasControls.tsx`, `src/renderer/src/canvas/Legend.tsx`, `src/renderer/src/health/`, `src/renderer/src/utils/`. These are from the prior canvas-view-redesign cycle (already shipped on disk but not yet committed). Explicitly excluded from this cycle's audit per team-lead instructions; will be committed as part of a later housekeeping pass.
- **Tolerated test failure.** `src/main/fileSync/__tests__/watcherManager.reparse-contract.test.ts > poisoning-like onReparse error does NOT invoke pruneRecent` is a pre-existing Windows timing flake, last touched by commit `6a5e308` (`stage-4+5: state & canvas + interaction UX (consolidated)`), zero diff vs HEAD in this cycle. Tolerated per `.flow-spec/project.md`; passes in isolation, fails intermittently under full-suite parallel execution on Windows.
- **Playwright not executed.** The environment used for `/flow:check` has no Electron display / headed browser; Scenario 1 was verified statically via byte-level Unicode inspection against `LaunchGate.tsx`. The e2e suite should be re-run on a developer machine or CI with display before release to confirm.
- **Follow-up suggested by the brief's Out of Scope §13.** Renderer bundle size (1.56 MB) warrants a code-splitting pass on `TerminalModal` / `StatusPanel` / `FinalizePanel` in a future cycle — carried over from the canvas redesign summary.
- **Validation fix pre-planning.** The initial plan draft proposed `data-testid="launch-gate"` on the outer wrapper to scope the hover/focus `<style>` selector. `validation-report.md` caught this as a violation of Out of Scope §11 (only `launch-health-line` sanctioned); the plan was revised to use `className="launch-gate-column"` before Phase 1 started. This is why the shipped code uses a class-based scope and no wrapper testid.
