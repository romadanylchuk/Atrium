# Feature Summary: Canvas View Redesign
_Archived: 2026-04-22_
_Status: DONE_

## Goal

Fix three linked visual/UX problems in the main app shell so the canvas is actually readable and the chrome looks intentional:

1. Replace the unstyled `<button>` toolbar with a proper tab bar.
2. Replace the loose heading-plus-button layout in the right side panel with a styled sidebar containing project header, recents list, and a CLI health indicator.
3. Make the React Flow canvas readable: restyle nodes so maturity encodes to shape+color, restyle edges so connection type encodes to color+stroke, run dagre auto-layout on first open and on demand, and add floating canvas controls + legend.

All three are renderer-only — no changes to the parser, IPC, layout-file schema, or main process.

## What Was Built

### Shared infrastructure (Phase 1)
- New Zustand slice on `atriumStore`: `healthStatus: 'checking' | 'healthy' | 'unreachable'` (default `'checking'`) and `healthInfo: HealthInfo | null` (default `null`), plus internal `_setHealth` action.
- `useHealthPoll()` hook (`src/renderer/src/health/useHealthPoll.ts`): 30s `setInterval`, single in-flight guard, three-consecutive-failures debounce, immediate re-check on `window` `focus`, initial probe on mount. Wired in once at the top of `App.tsx`.
- Hand-rolled `formatRelativeTime(iso, now?)` utility (`src/renderer/src/utils/relativeTime.ts`) with five bands (just now / Xm ago / Xh ago / Xd ago / locale short date) — no new runtime dependency.

### Toolbar (Phase 2)
- `Toolbar.tsx` rewritten as a styled tab bar: container `#1a1a1f` bg + `#2a2a32` bottom border; tabs use reset chrome and a `data-active` attribute keyed on local `activeTab` state (OQ3 Option A — most-recently-clicked wins). Active tab gets `#2a2a32` bg, inactive tabs `#8a8a92` text on transparent, hover `#1f1f26`, disabled `#4a4a52`, focus-visible `outline: 1px solid #3a3a42`.
- New right-side group: project-name span (`#6a6a72`, 12px) + 6×6 health dot (`data-testid="toolbar-health-dot"`, `data-health={status}`) coloured `#3ba55d` healthy / `#e24b4a` unreachable / `#6a6a72` checking.
- All five `data-testid="toolbar-btn-<name>"` ids preserved; `dispatchSkill` signature unchanged.

### Right sidebar (Phase 3)
- Side panel width changed from `0 0 280px` to `0 0 240px` in `MainShell.tsx`; `overflow: auto` moved off the aside onto the inner `ProjectPanel` root (`overflow-y: auto`) so the scrollbar doesn't land on the border. Inner `SidePanel.tsx` wrapper trimmed to `width/height: 100%`.
- `ProjectPanel.tsx` restyled with `#15151a` bg, `1px solid #2a2a32` left border, 16px padding, flex-column with 16px gap.
- Section headers rendered as `<div role="heading" aria-level={2}>` styled `11px / #6a6a72 / uppercase / letter-spacing 0.05em` (replacing `<h2>` / `<h3>`).
- PROJECT section: name `14px / 500 / #e6e6e6` (or `'No project'`), path `11px / #8a8a92` with `word-break: break-all`, full-width "Open project…" button styled `#2a2a32` bg / `0.5px solid #3a3a42` / `border-radius: 6px`.
- RECENT section: inline list (not the shared `RecentsList`), each item is a button with hover `#1a1a1f`, name `12px / #e6e6e6`, relative time `10px / #6a6a72` via `formatRelativeTime`. Empty state paragraph included.
- Bottom health line (`data-testid="sidebar-health-line"`) pinned via `margin-top: auto`, `10px / #4a4a52`. Reads the Phase 1 store slice — no duplicate `checkClaude` probe. Renders all four states including `'healthy' + healthInfo === null` edge case (`claude · healthy`).

### Canvas visual encoding (Phase 4)
- `visualEncoding.ts` rewritten with new `MaturityStyle` / `ConnectionStyle` shapes (CSS values inline; old `shape: 'circle' | 'roundedRect' | 'rect' | 'badge'` discriminator dropped).
- Locked maturity palette — `raw-idea` purple ellipse (`#2a1f3d` / `#a78bc9`, `border-radius: 50% / 50%`), `explored` blue rounded-rect (`#1e3a5f` / `#5b8fd4`, 6px), `decided` amber rect (`#3d2f14` / `#c29a4e`, 3px), `ready` green rounded-rect (`#14301f` / `#4ade80`, 6px); unknown gets dashed border (`'4 3'`) plus a raw-string badge (`data-unknown-maturity` preserved).
- Locked connection palette — `depends-on` blue solid, `uses` amber solid, `informs` purple solid, `feeds` muted teal-green dotted (`#63a082`, `'2 4'`), `extends` neutral grey solid; unknown dashed grey (`#6a6a72`, `'4 3'`). All stroke widths uniformly `1.5`.
- `AtriumNode.tsx` rewritten as 96×36 box with two text lines (name 11px/500, subtitle 9px) and per-maturity CSS from the style table. Border switches to `dashed` when `style.strokeDasharray` is set (unknown only).
- `AtriumEdge.tsx` adds a hover-triggered tooltip for unknown edges (`data-unknown-type` preserved on the same element used by the existing test).
- `useProjectSync.ts` sets `markerEnd: { type: MarkerType.ArrowClosed, color: connStyle.color }` per edge so React Flow synthesises a distinct coloured `<marker>` per connection colour. Also adds the all-identical-seed gate: when every loaded `nodePositions` entry has identical `(x, y)`, the seed is treated as an "auto-layout marker" — discarded so dagre can re-run via the existing `addedSlugs` path. `LayoutFileV1` schema unchanged; this is a renderer-side inference only.
- New `Legend.tsx` component (`data-testid="canvas-legend"`) — floating bottom-left card with two sections (Connections + Maturity), each row deduped from the current `project.connections` / `project.nodes`. Maturity rows render in canonical order (`raw-idea → explored → decided → ready → unknown`). Unknown rows show the raw string verbatim. Returns `null` when `project === null` or both arrays are empty.
- `Canvas.tsx` outer wrapper gains `background: '#0f0f13'` and slots `<Legend />` as a sibling of `<ReactFlow>`.

### Auto-layout + controls + dot background (Phase 5)
- `dagreLayout.ts` constants updated: `NODESEP = 80`, `RANKSEP = 100` (rankdir `'TB'` unchanged).
- New store field `relayoutRequestId: number` (default `0`) + `triggerRelayout()` action (monotonic counter increment).
- `useProjectSync.ts` extended: when the relayout id increments mid-session, all slugs are treated as `addedSlugs`, `existingPositions` stays empty, dagre re-runs for everything, and the new positions flow through the existing `setNodes` → `handleNodesChange` → `persistence.saveNodes` path. User-dragged positions are preserved on normal re-renders (Phase 4 all-identical-seed gate untouched).
- New `CanvasControls.tsx` (`data-testid="canvas-ctrl-zoom-in" | "zoom-out" | "fit" | "relayout"`): floating top-left, four 26×26 buttons, `rgba(30,30,38,0.9)` bg, inline 16×16 SVG icons (`stroke="currentColor"`). Handlers use `useReactFlow().zoomIn / zoomOut / fitView({ padding: 0.2 })` and `useAtriumStore.getState().triggerRelayout()`. React Flow's built-in `<Controls>` is intentionally NOT imported.
- React Flow `<Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1f1f26" />` rendered inside `<ReactFlow>`.

## Phases Completed

| Phase | Name | Key Outcome |
|---|---|---|
| 1 | Shared state + utilities | Health store slice, 30s polling hook with focus + 3-failure debounce, hand-rolled `formatRelativeTime` |
| 2 | Toolbar tab-bar restyle | Five styled tabs with local `activeTab` state, project name + 6×6 health dot, all skill-dispatch contracts preserved |
| 3 | Right sidebar restyle | Width 240px, PROJECT / RECENT sections, full-width Open button, pinned bottom health line reading the Phase 1 slice |
| 4 | Canvas visual encoding | Locked maturity + connection palettes, per-edge coloured `markerEnd`, hover tooltip for unknown edges, two-section `<Legend />`, all-identical-seed gate |
| 5 | Auto-layout + canvas controls + background | NODESEP 80 / RANKSEP 100, `triggerRelayout` counter wired into `useProjectSync`, top-left `<CanvasControls />`, React Flow Dots background |

## Edge Cases Handled

- **Empty project (no nodes).** `Legend` returns `null`. `CanvasControls` still renders (zoom/fit/relayout no-op when there is nothing to lay out).
- **No edges, N>0 nodes.** Dagre's grid fallback (`dagreLayout.ts`) preserved. Legend hides the Connections section but keeps Maturity.
- **All-identical saved positions.** Detected in `useProjectSync.ts`; `seedApplied` is flipped without applying seeds, so dagre runs through the `addedSlugs` path. Schema unchanged.
- **Long project paths.** `wordBreak: 'break-all'` on the path element — no ellipsis, multi-line wrap allowed.
- **Health probe latency.** Initial store state is `'checking'`; toolbar dot is neutral grey, sidebar reads `claude · checking` until the first response.
- **Health probe flake (single/double failure).** `useHealthPoll` resets the failure counter on success; flip to `'unreachable'` requires three consecutive failures.
- **Dark mode only.** No `@media (prefers-color-scheme: light)` rules anywhere in the renderer (verified by grep in the final check).
- **`extends` connection type.** Maps to neutral grey solid (`#8a8a92`). Currently unused by the parser but renders correctly if introduced.
- **Unknown connection type / maturity.** Falls back to dashed grey (edges) / dashed-grey rectangle with raw-string badge (nodes). One `console.warn` per distinct unknown value per project hash; legend lists the raw string so the user can discover it without devtools.

## Deviations From Original Plan

None blocking. Minor implementation choices flagged by reviewers:
- **Phase 2:** `font: inherit` shorthand was implemented as separate `fontFamily` + `fontSize` properties — functionally equivalent.
- **Phase 3:** `boxSizing: border-box` added to the `ProjectPanel` root container (not in the plan) to keep the 240px aside from overflowing under 16px padding. Correct addition.
- **Phase 4:** `AtriumEdge.tsx` passes `undefined` (not the literal `'none'`) for `strokeDasharray` when no dash is required — equivalent SVG behaviour, slightly cleaner. `Legend.tsx` uses `React.CSSProperties` without an explicit `React` import — works via the JSX automatic runtime; typecheck clean.
- **Phase 5:** The relayout icon is a circular arc + arrowhead only (the plan suggested adding a small 2×2 grid glyph too). Within the spec's "inline SVG" latitude.

## Fixes Applied

None. No `fix-*-result.md` runs occurred during this cycle.

## Out of Scope (Not Implemented)

Preserved verbatim from the brief — these are deliberately not done and remain candidates for future cycles:
- **No parser changes** (`src/main/parser/**`).
- **No IPC changes** (`src/main/ipc/**`, `src/preload/api.ts`).
- **No `LayoutFileV1` schema changes** — the auto-layout marker is a renderer-side inference, not a persisted field.
- **No light-mode toggle** — all colours are dark-mode literals.
- **No panel topology changes** — toolbar top, canvas left, aside right, terminal overlay; nothing moved/added/removed.
- **`NewProjectForm` not restyled** — separate cycle.
- **`TerminalModal` not restyled.**
- **`SelectionPanel` not restyled** (the alternate side-panel view that shows node tooltips).
- **No new layout engine** — no elkjs.
- **No periodic `ProjectState` refetch on health failure** — only the health probe polls.
- **Toolbar skill set unchanged** (Explore / Decide / Map / Status / Finalize); each tab dispatches the same skill / opens the same overlay as before.
- **No Playwright changes** — E2E coverage explicitly deferred (unit-level legend / colour coverage is load-bearing).

## Review Findings

| Phase | Verdict | Must-fix | Should-fix / Notes |
|---|---|---|---|
| 1 | APPROVED | 0 | None |
| 2 (Toolbar restyle) | PASS | 0 | `font: inherit` shorthand → split properties (non-defect) |
| 3 | PASS | 0 | `boxSizing: border-box` added to root container (correct addition not called out in plan) |
| 4 | PASS | 0 | Four minor non-blocking observations (CSSProperties import, `undefined` vs `'none'` strokeDasharray, no explicit `border-style` test for `ready`, SVG row sizing) |
| 5 | PASS | 0 | Relayout icon shape simpler than plan suggestion (within latitude) |

Total across the cycle: **0 must-fix, 0 fix-mode runs**.

## Final Check Outcome

Status `DONE` per `.flow-spec/check-result.md` (`/flow:check`, 2026-04-20). Verified:

- **Team-lead checklist** (7 items) — all PASS. Zero `Unknown connection type` / `Unknown node maturity` warnings on `D:\home\Atrium\.ai-arch/`. Zero `prefers-color-scheme: light` rules. Parser / IPC / layout schema literal-diff empty. No new runtime deps. `LayoutFileV1` schema unchanged. `npm run build` succeeds (main 40.75 kB, preload 4.77 kB, renderer 1.56 MB).
- **Brief Expected Behavior** — all checked: 5 toolbar tabs + project name + health dot, sidebar PROJECT/RECENT/health line, panel width 240, dots background + dagre + ≥3 edge colours + legend bottom-left + controls top-left, tab click moves marker, auto-layout reflows + drag preserved next open, health failure path renders red + `claude · unreachable`, unknown values fall back to dashed grey with single warn.
- **Brief Edge Cases** — all checked.
- **Brief Out of Scope** — all confirmed not implemented.
- **Gate results:** typecheck PASS, lint PASS, build PASS, full test run 586 passed / 1 skipped / 1 failed (pre-existing Windows timing flake in `watcherManager.test.ts > atomic swap`, last touched by commit `9d35542`, untouched by this cycle, passes in isolation: `npx vitest run src/main/fileSync/__tests__/watcherManager.test.ts` → 8/8 green).
- **Integration audit** — no residual surface: no duplicate `checkClaude` callers; `0 0 280px` zero hits; old shape discriminant removed from `src/renderer/`; React Flow built-in `<Controls>` not imported anywhere.
- **Regressions:** none.

### Known-good-but-unverified (deferred)
- **Live `npm run dev` smoke walk on `D:\home\Atrium`** (brief §Verification steps 1–6). Unit coverage is complete for every claim; the interactive Electron session for eyeballing dots/colours/health-failure walk is deferred to the next smoke run.
- **Playwright E2E.** Explicitly deferred by the plan ("No Playwright changes this cycle"). Unit-level legend / colour coverage is load-bearing.

## Files Changed

Renderer only — no main / preload / shared edits this cycle.

| Path | Note |
|---|---|
| `src/renderer/src/App.tsx` | Wires `useHealthPoll()` once at the top of the component (Phase 1) |
| `src/renderer/src/store/atriumStore.ts` | Added `healthStatus`, `healthInfo`, `_setHealth`, `relayoutRequestId`, `triggerRelayout` (Phases 1 + 5) |
| `src/renderer/src/store/__tests__/atriumStore.test.ts` | Defaults assertions for new slice + monotonic increment test |
| `src/renderer/src/utils/relativeTime.ts` | New — hand-rolled `formatRelativeTime(iso, now?)` |
| `src/renderer/src/utils/__tests__/relativeTime.test.ts` | New — 11 tests covering all 5 bands + boundary cases |
| `src/renderer/src/health/useHealthPoll.ts` | New — 30s poll, in-flight guard, 3-failure debounce, focus recheck |
| `src/renderer/src/health/__tests__/useHealthPoll.test.tsx` | New — 6 tests (ok→healthy, partial-failure debounce, in-flight guard, focus trigger / focus guard) |
| `src/renderer/src/toolbar/Toolbar.tsx` | Rewrote as styled tab bar with local `activeTab`, right-side project name + health dot |
| `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx` | +9 tests: active-state transitions, three health-dot states, project-name present/null |
| `src/renderer/src/shell/MainShell.tsx` | Width 280 → 240; `overflow: auto` removed from aside |
| `src/renderer/src/shell/__tests__/MainShell.test.tsx` | 240px width assertion |
| `src/renderer/src/sidePanel/SidePanel.tsx` | Removed inner `overflow: auto` wrapper |
| `src/renderer/src/sidePanel/ProjectPanel.tsx` | Full restyle — PROJECT/RECENT sections, full-width Open button, pinned bottom health line; reads health from store |
| `src/renderer/src/sidePanel/__tests__/ProjectPanel.test.tsx` | +8 tests covering section headers, path wrap, three health-line states, recent items |
| `src/renderer/src/canvas/visualEncoding.ts` | Full rewrite — new `MaturityStyle` / `ConnectionStyle` shapes, locked palette, `resolveMaturityStyle` / `resolveConnectionStyle` helpers |
| `src/renderer/src/canvas/AtriumNode.tsx` | 96×36 box, two-line text, per-maturity CSS from style table |
| `src/renderer/src/canvas/AtriumEdge.tsx` | Hover-triggered tooltip for unknown edges; `data-unknown-type` preserved |
| `src/renderer/src/canvas/useProjectSync.ts` | Per-edge coloured `markerEnd`; all-identical-seed gate; relayout-id integration |
| `src/renderer/src/canvas/Canvas.tsx` | Wrapper bg `#0f0f13`; renders `<Background ... Dots>`, `<CanvasControls />`, `<Legend />`; reads `relayoutRequestId` from store |
| `src/renderer/src/canvas/Legend.tsx` | New — two-section floating legend (Connections + Maturity), deduped from current graph |
| `src/renderer/src/canvas/CanvasControls.tsx` | New — top-left zoom-in / zoom-out / fit / relayout buttons with inline SVG icons |
| `src/renderer/src/canvas/dagreLayout.ts` | NODESEP 60 → 80, RANKSEP 120 → 100 |
| `src/renderer/src/canvas/__tests__/visualEncoding.test.ts` | New palette + dasharray + colour assertions |
| `src/renderer/src/canvas/__tests__/AtriumComponents.test.tsx` | New colour / border-radius assertions; unknown-edge hover tooltip behaviour |
| `src/renderer/src/canvas/__tests__/Canvas.test.tsx` | Legend present/absent cases; CanvasControls testids; relayout click increments store; Background renders |
| `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx` | All-identical-seed gate test; markerEnd-with-resolved-colour test; relayout case G |
| `src/renderer/src/canvas/__tests__/dagreLayout.test.ts` | Updated NODESEP / RANKSEP constants |

New `data-testid`s introduced this cycle: `toolbar-health-dot`, `sidebar-health-line`, `canvas-ctrl-zoom-in`, `canvas-ctrl-zoom-out`, `canvas-ctrl-fit`, `canvas-ctrl-relayout`, `canvas-legend`.

## Notes

- **Locked decisions (OQ1–OQ8) verbatim from `feature-plan.md`:** OQ1 chose Option A (map spec intent onto existing parser types) so `ConnectionType` was NOT expanded; brief's `dependency / shared-concern / coupled-decision / non-dependency` names do not appear in code. OQ2 added a fourth maturity band for `ready` (green). OQ3 active-tab is most-recently-clicked local state. OQ4 health poll is 30s unconditional, single in-flight, three-failure threshold, immediate focus-recheck. OQ5 relative-time is hand-rolled. OQ6 canvas-control icons are inline SVGs. OQ7 legend includes unknowns. OQ8 focus-visible style is `outline: 1px solid #3a3a42; outline-offset: 1px`.
- **Pre-existing test flake carried over.** `watcherManager.test.ts > atomic swap` continues to fail intermittently in parallel runs but passes in isolation. The flake was logged in the prior cycle's check-result and re-flagged here. A dedicated stabilisation pass (longer `WAIT_MS`, or a `waitFor(...).toHaveBeenCalled()` poller) is suggested for the next cycle.
- **Renderer bundle 1.56 MB.** Crossed the 1.5 MB default warning threshold (was ~1.54 MB pre-cycle). A code-splitting pass on `TerminalModal` / `StatusPanel` / `FinalizePanel` is a clean next-cycle win.
- **Legend SVG sample for the ellipse `raw-idea` row approximates a rounded rect** (`Legend.tsx`'s 12×8 SVG `<rect rx="4">` is a square-ish pill, not an ellipse). Visually close enough for a legend sample; a purpose-built ellipse would match the canvas node exactly. Non-blocking; note for a legend polish cycle.
- **`extends` colour vs unknown fallback collision.** `extends` is mapped to neutral grey `#8a8a92`, which is similar to the unknown-fallback colour `#6a6a72`. Not currently a regression because `extends` is unused in the parser's emitted data, but if a future architecture graph introduces `extends` edges alongside unknowns, they will look similar.
- **Residual prior-cycle artifacts swept by the standard delete pattern.** `phase-6-result.md`, `review-6-report.md`, parts of `phase-4-result.md`, and parts of `review-2-report.md` contained content from the prior Stage-6 (Build & Distribution) cycle (committed on `main` as `b1d349d` and earlier) that had never been compacted. The skill's `phase-*-result.md` / `review-*-report.md` glob deletes them as part of this run; their substantive outcomes are already shipped on `main`. `.flow-spec/smoke-test.md` (also from the prior Stage-6 cycle) is NOT in the deletion glob and is preserved untouched per the skill rule "Do not delete unknown files in `.flow-spec/`."
- **Working tree status.** As of compaction, the canvas-redesign code changes (~22 files modified + 4 new) are present in the working tree but have not yet been committed. The user controls when to stage and commit.
