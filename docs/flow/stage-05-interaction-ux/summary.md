# Feature Summary: Stage 05 — Interaction & Project UX
_Archived: 2026-04-19_
_Status: DONE_

## Goal
Build the user-facing interaction layer that turns Stage 04's passive canvas into a complete product: a mandatory launch gate that selects or creates a project, a persistent project side panel for switching, click-for-tooltip / right-click-for-select interaction on nodes, a 5-button context-aware top toolbar, an xterm.js-backed terminal modal for Explore/Decide/Map/Finalize/init skills, and app-native Status/Finalize panels rendered from `ProjectState`. After this stage the app is feature-complete end-to-end — open, see, click, run a skill, watch the graph update live, switch projects, create a new project — and is ready for Stage 06 packaging.

## What Was Built

### Shared contracts (cross-process)
- `src/shared/ipc.ts` — added `IPC.skill.spawn = 'skill:spawn'` namespace.
- `src/shared/errors.ts` — added `SkillErrorCode` (`...CommonErrorCode, COMPOSE_FAILED, SPAWN_FAILED, INVALID_SKILL`).
- `src/shared/skill/spawn.ts` (new) — exports `SkillSpawnRequest = { skill: SkillName; nodes?: string[]; prompt?: string; cwd: string }` and re-exports `SkillName` from `composeCommand`.
- `src/shared/index.ts` — re-exports `./skill/spawn.js`.

### Main-process IPC + skill composition bridge
- `src/main/ipc/skill.ts` (new) — `registerSkillHandlers(terminalManager, skillsPathFactory = resolveSkillsPath)` with injectable path factory. Validates skill name via `VALID_SKILLS`; composes args via `composeCommand`; calls `terminalManager.spawn`. Returns `Result<TerminalId, SkillErrorCode>`. Renderer never sees `args[]`.
- `src/main/ipc/register.ts` — wires `registerSkillHandlers` after layout handlers.
- `src/main/ipc/dialog.ts` — added `ATRIUM_E2E_FOLDER` env-var override gated by `process.env.NODE_ENV !== 'production' && !app.isPackaged`.
- `src/main/terminal/healthCheck.ts` — `ATRIUM_E2E_CLAUDE_BIN` override (same guard); ANSI/VT100 escape-sequence stripping added to version output parsing.
- `src/main/terminal/terminalManager.ts` — `ATRIUM_E2E_CLAUDE_BIN` override (same guard) replaces `args[0]`.

### Preload surface
- `src/preload/api.ts` — added `skill: { spawn(req): Promise<Result<TerminalId, SkillErrorCode>> }` to `AtriumAPI`.
- `src/preload/index.ts` — implements `skill.spawn` as `ipcRenderer.invoke(IPC.skill.spawn, req)`.

### Renderer — store (Zustand)
- `src/renderer/src/store/atriumStore.ts` — added actions: `setTooltipTarget(slug|null)` (toggle-on-same), `toggleSelectedNode(slug)` (functional Set update, flips `activePanel` atomically), `setFullscreen(value)` (direct mutation, no transition guard — Phase 9 bugfix), `setPendingInit`/`clearPendingInit`. `clearSelection` updated to reset `activePanel: 'project'`. Added `pendingInit: { source: 'gate'|'panel'; cwd; terminalId } | null` slice. Added `toolbarOverlay: 'status'|'finalize'|null` slice.
- `src/renderer/src/store/toastStore.ts` (new) — `pushToast(message, kind)` / `dismissToast(id)`, auto-dismiss after 4s via `setTimeout`, IDs via `crypto.randomUUID()`.

### Renderer — app shell + launch gate
- `src/renderer/src/App.tsx` — renders `<LaunchGate />` when `project === null`, `<MainShell />` otherwise. Auto-open preserved; runs behind the gate (closes it on success).
- `src/renderer/src/shell/MainShell.tsx` (new) — toolbar / canvas / 280px side-panel regions; mounts `<SidePanel />`, `<TerminalModal />`, `<Toolbar />`, `<Tooltip />` overlay, and `<ToastContainer />`.
- `src/renderer/src/shell/ToastContainer.tsx` (new) — fixed bottom-right overlay stacking multiple toasts.
- `src/renderer/src/launch/LaunchGate.tsx` (new) — `role=dialog aria-modal`; non-dismissable without a project. Contains `HealthSection`, recents list, Open button (routes via `openOrNewProject`), inline new-project form. Exports `dispatchInitSpawn(req, source)` used by both gate and panel new-project paths.
- `src/renderer/src/launch/HealthSection.tsx` (new) — `health.checkClaude` on mount + Recheck button.
- `src/renderer/src/launch/RecentsList.tsx` (new) — pure component, ≤5 enforced, disables current project.
- `src/renderer/src/launch/NewProjectForm.tsx` (new) — 4 optional fields (name / technology / description / target audience). Empty submit allowed.
- `src/renderer/src/launch/buildInitPrompt.ts` (new) — pure concatenation helper; returns `undefined` if all blank.
- `src/renderer/src/launch/openOrNewProject.ts` (new) — pure routing: `ok → opened`, `NOT_AN_ARCH_PROJECT → new`, other `err → error`, thrown → error.

### Renderer — canvas interaction
- `src/renderer/src/canvas/AtriumNode.tsx` — `onClick` → `setTooltipTarget(slug)`; `onContextMenu` → `preventDefault` + `toggleSelectedNode(slug)` + `setTooltipTarget(null)` (right-click dismisses tooltip in same gesture).
- `src/renderer/src/canvas/Canvas.tsx` — `onPaneClick` clears selection + tooltip; `onPaneContextMenu` preventDefault + clears selection.
- `src/renderer/src/canvas/dagreLayout.ts` — 0-edge fallback grid layout (Phase 10 Windows fix for dagre networkSimplex crash on edgeless graphs).

### Renderer — tooltip
- `src/renderer/src/interaction/Tooltip.tsx` (new) — mounts when `tooltipTarget !== null`. Renders name, maturity badge, summary, 3 skill buttons (Explore/Decide/Map). Position snapshotted at open; `onPaneClick` dismisses before canvas pan. Document-level Escape keydown listener mounted only when visible. Inline `spawn-error` text on dispatchSkill err; also pushes toast.
- `src/renderer/src/interaction/tooltipPlacement.ts` (new) — pure `computeTooltipPlacement` with 70% viewport flip thresholds (right-prefer, vertical-align).
- `src/renderer/src/interaction/SkillButton.tsx` (new) — reusable skill-launcher button, `disabled` prop with visual feedback (opacity + cursor) + native HTML disabled attr.
- `src/renderer/src/skill/dispatchSkill.ts` (new) — calls `window.atrium.skill.spawn(req)`; on `ok` transitions store to `spawning` with returned id; propagates illegal-transition as `INTERNAL` err.

### Renderer — side panel
- `src/renderer/src/sidePanel/SidePanel.tsx` (new) — switches on `activePanel` between ProjectPanel and SelectionPanel.
- `src/renderer/src/sidePanel/ProjectPanel.tsx` (new) — project name header, Open button (reuses gate routing), recents list filtered to exclude current project, inline new-project form toggle. Guards on `canSwitch`. Calls `dispatchInitSpawn(req, 'panel')`.
- `src/renderer/src/sidePanel/SelectionPanel.tsx` (new) — resolves slugs to names from `project.nodes` (fallback to slug string); Clear button.
- `src/renderer/src/sidePanel/canSwitchSelector.ts` (new) — pure `canSwitch(status)`: true for `idle | exited`, false for `spawning | active | closing`.

### Renderer — toolbar
- `src/renderer/src/toolbar/Toolbar.tsx` (new) — 5 buttons in order (Explore, Decide, Map, Status, Finalize). Reads `selectedNodes` at click time. Explore/Decide/Map disabled when `!canSwitch`; Status and Finalize always enabled (Finalize is read-only panel entry; only its Continue button respects `canSwitch`). Inline error surface + toast on dispatchSkill err.
- `src/renderer/src/toolbar/StatusPanel.tsx` (new) — app-native overlay; project name, node/connection counts, maturity groups (collapsible `<details>`). Pure read.
- `src/renderer/src/toolbar/FinalizePanel.tsx` (new) — Continue/Close; Continue disabled on `!canSwitch`; Continue closes panel and calls `dispatchSkill({ skill: 'finalize', … })`.

### Renderer — terminal modal (xterm.js)
- `src/renderer/src/terminal/TerminalModal.tsx` (new) — overlay div sibling inside MainShell. Mounts xterm when `status ∈ {spawning, active, exited}`, unmounts on idle. Hooks: `onData` → ArrayBuffer → `xterm.write` + `spawning→active` flip (with double-fire guard); `onExit` writes `\r\n[process exited with code N]\r\n` then transitions to `exited`; `onError` writes + transitions. xterm `.onData` → `terminal.write(id, TextEncoder.encode(data).buffer)`. `ResizeObserver` → `fit.fit()` → `terminal.resize(id, cols, rows)` debounced 150ms. Kill button visible on `active`; Close enabled on `exited`; Escape dismisses only on `exited`. Fullscreen toggle via `setFullscreen(!fullscreen)` (bypasses transition guard). Init-flow completion: on exit with matching `pendingInit.terminalId`, calls `project.open(cwd)` → `resolveInitOutcome` → `setProject` or §G fallback. `__ATRIUM_E2E__` build-constant gated `window.__e2e_terminalOutput` accumulator (stripped in production bundles).
- `src/renderer/src/terminal/terminalState.ts` (new) — pure: `decideNextTerminalState()` (spawning→active with double-fire guard) and `resolveInitOutcome()` (discriminates `success`/`not-arch-project`/`error`).
- `src/renderer/src/terminal/xtermTheme.ts` (new) — `XTERM_THEME` constant + `XTERM_FONT_FAMILY` (dark bg, block cursor, monospace system stack).

### E2E test harness
- `package.json` — added deps: `xterm`, `xterm-addon-fit`, `zustand` extension, `@playwright/test` (devDep).
- `scripts/test-e2e.mjs` (new) — Node wrapper sets `ATRIUM_E2E=1`, runs `electron-vite build`, then `playwright test`. Cross-platform replacement for inline env var assignment.
- `package.json` `test:e2e` script → `node scripts/test-e2e.mjs`.
- `playwright.config.ts` (new, repo root) — `testDir: './e2e'`, serial workers, 30s timeout.
- `electron.vite.config.ts` — renderer `define: { __ATRIUM_E2E__: JSON.stringify(process.env.ATRIUM_E2E === '1') }`.
- `vitest.config.ts` — `define: { __ATRIUM_E2E__: 'false' }` for unit tests.
- `src/renderer/src/vite-env.d.ts` (new) — `declare const __ATRIUM_E2E__: boolean`.
- `e2e/fixtures/fake-claude.js` + `fake-claude.cmd` — minimal Node fixture that responds to `--version` (prints `1.0.0-e2e`) and emits `HELLO_ATRIUM` then blocks on skill invocations.
- `e2e/fixtures/fake-project/` — fixture Atrium project with `.ai-arch/index.json` + one idea file.
- `e2e/helpers/launchApp.ts` (new) — shared launcher; per-test `--user-data-dir=<tempdir>` (`fs.mkdtempSync`); passes `ATRIUM_E2E_CLAUDE_BIN` + `ATRIUM_E2E_FOLDER`.
- `e2e/scenario1-launch.spec.ts`, `scenario2-open-project.spec.ts`, `scenario3-terminal.spec.ts` — the 3 brief-locked scenarios.

### Tests (vitest — renderer + main)
- `src/shared/__tests__/ipc.test.ts` + `src/shared/skill/__tests__/spawn.contract.test.ts` (contract + type-only).
- `src/main/ipc/__tests__/skillHandlers.test.ts` (5 cases); `register.test.ts` extended.
- `src/preload/__tests__/api.type-test.ts` + `preload.runtime.test.ts` extended.
- `src/renderer/src/launch/__tests__/*` — `LaunchGate.test.tsx` (10+), `HealthSection`, `RecentsList`, `NewProjectForm`, `buildInitPrompt`, `openOrNewProject` (27+ cases total).
- `src/renderer/src/canvas/__tests__/AtriumComponents.test.tsx` — extended with click/right-click/Escape cases.
- `src/renderer/src/canvas/__tests__/Canvas.test.tsx` — pane click + context-menu tests.
- `src/renderer/src/interaction/__tests__/tooltipPlacement.test.ts` (7 cases: corners, center, boundaries), `Tooltip.test.tsx` (13+ cases incl. disabled-button path).
- `src/renderer/src/skill/__tests__/dispatchSkill.test.ts` (3 cases).
- `src/renderer/src/sidePanel/__tests__/canSwitchSelector.test.ts` (5), `ProjectPanel.test.tsx`, `SelectionPanel.test.tsx`, `SidePanel.test.tsx`.
- `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx` (context-aware + disabled states), `StatusPanel.test.tsx`, `FinalizePanel.test.tsx`.
- `src/renderer/src/terminal/__tests__/terminalState.test.ts` (9), `pendingInit.test.ts` (4), `TerminalModal.test.tsx` (13) — xterm mocked at module boundary.
- `src/renderer/src/store/__tests__/atriumStore.test.ts` — extended with `toggleSelectedNode` / `setTooltipTarget` / `setFullscreen` / `pendingInit` / `toolbarOverlay` cases.
- `src/renderer/src/store/__tests__/toastStore.test.ts` (8 cases — push, dismiss, auto-dismiss, stack).

### Smoke checklist
- `docs/flow/stage-05-interaction-ux/smoke-checklist.md` — 12 scenarios with platform matrix (Windows / macOS / Linux).

## Phases Completed

| Phase | Name | Key Outcome |
|-------|------|-------------|
| 1 | Shared `skill:spawn` contract | `IPC.skill.spawn`, `SkillSpawnRequest`, `SkillErrorCode` added to `@shared`; contract tests pass; register-test skip-set entry deferred to P2. |
| 2 | `skill:spawn` impl in main + preload | Main handler resolves `skillsDir`, composes, spawns; renderer never sees args[]. Preload exposes `window.atrium.skill.spawn`. Register snapshot complete. |
| 3 | App shell + launch-gate scaffold | `App.tsx` gate-aware; `LaunchGate` placeholder modal; `MainShell` with toolbar/canvas/280px side-panel regions. |
| 4 | Launch gate contents | Health surface + Recheck; recents list (≤5); single Open button routes via `.ai-arch/index.json` check; inline new-project form; `dispatchInitSpawn` shim. |
| 5 | Canvas event handlers | Click/right-click wired on `AtriumNode` + pane handlers on canvas; `setTooltipTarget` / `toggleSelectedNode` store actions; `activePanel` flips atomically; right-click dismisses tooltip in same gesture. |
| 6 | Tooltip + positioning helper | `Tooltip.tsx` + pure `computeTooltipPlacement` (right-prefer, 70% flip); 3 skill buttons; Escape dismisses; `dispatchSkill` shim. |
| 7 | Project + Selection side panel | `SidePanel` switches on `activePanel`; `ProjectPanel` (Open, recents filtering current, canSwitch-guarded); `SelectionPanel` (slug→name resolution, Clear). |
| 8 | Top toolbar + Status + Finalize | 5 context-aware buttons; Status app-rendered from `ProjectState`; Finalize two-step (panel → Continue → spawn). Finalize button always enabled; Continue respects `canSwitch`. |
| 9 | Terminal Modal (xterm.js) + init-flow completion | xterm + fit-addon installed; overlay modal with Kill/Close/Escape/Fullscreen; `spawning→active` on first onData; init-flow re-check on exit → `setProject` or §G fallback (source='gate' vs 'panel'); `setFullscreen` bypasses transition guard. |
| 10 | Playwright + 3 E2E scenarios | `@playwright/test` wired; fake-claude fixture + fake-project; env-var stubs for dialog + claude binary (production-guarded); all 3 brief scenarios pass. Incidental: dagre 0-edge fallback, ANSI stripping in healthCheck. |
| 11 | Polish | Toast system (Zustand slice + bottom-right container, 4s auto-dismiss); `canSwitch` enforced on tooltip skill buttons; smoke checklist under `docs/flow/stage-05-interaction-ux/`. |

## Edge Cases Handled

From brief, all confirmed by final check with file:line references.

- **Empty recents on launch** — `RecentsList.tsx:11-13` renders "No recent projects." (asserted in Scenario 1).
- **Health check failure + recheck** — `HealthSection.tsx:36-45` shows error + Recheck button; Open remains enabled (user can still try).
- **Open → `project.open` fails from gate** — `openOrNewProject.ts:30` → `{ kind: 'error' }`; gate surfaces error + toast; canvas not entered.
- **Folder picker cancelled** — `LaunchGate.tsx:50-53` re-enables Open on `ok(null)`.
- **Picked folder has `.ai-arch/` but open fails** — treated as error branch, not new-project route.
- **Init terminal closed without writing `.ai-arch/`** — `TerminalModal.tsx:111-113` clears `pendingInit`; gate (source='gate') stays open; panel (source='panel') leaves current project untouched.
- **Tooltip near canvas edge** — `tooltipPlacement.ts:13-22` flips at 70% viewport; 7 unit tests cover corners + center + threshold boundaries.
- **Right-click during tooltip visible** — `AtriumNode.tsx:40` dismisses tooltip alongside toggling selection (single gesture).
- **Rapid right-clicks** — `toggleSelectedNode` uses functional Set update; 10-iteration test confirms consistency.
- **Left-click on already-tooltip'd node** — `setTooltipTarget(same)` toggles to null.
- **Watcher push during active terminal** — Canvas stays mounted behind modal; live-updates.
- **`project.switch` blocked by terminal** — `canSwitchSelector` + `ProjectPanel.tsx:121` early-return; store's `switchProject` returns `BLOCKED_BY_TERMINAL`.
- **`setTerminal` illegal transition** — `dispatchSkill.ts:11-15` returns err; modal does not open on desync.
- **Selection panel visible during switch** — panel hidden when selection empty; switch path clears selection (Stage 4).
- **`onContextMenu` on background vs node** — node toggles select, background clears, both `preventDefault`.
- **xterm resize debounced** — 150ms (`TerminalModal.tsx:16`); `ResizeObserver` coalesces.
- **Fullscreen toggle keeps xterm focus** — instance not remounted across `fullscreen` changes (only refit).
- **Fullscreen toggle during active terminal** — Phase 9 bugfix: routes through `setFullscreen` (direct mutation), not `setTerminal` (would fail transition guard).
- **New-project form all blank** — `buildInitPrompt.ts:16` returns `undefined`; composer accepts missing prompt.
- **Multiple rapid Escape presses** — `setTooltipTarget(null)` idempotent.

## Deviations From Original Plan

- **Phase 7 — side panel new-project helpers reused instead of hoisted.** Plan allowed either hoisting `openOrNewProject`/`buildInitPrompt`/`NewProjectForm`/`RecentsList` to a shared location or importing from `launch/`. Implementation kept them in `launch/` and imported directly (one-way, no cycles), which is simpler and has the same test coverage.
- **Phase 8 — `toolbarOverlay` store slice added but local `useState` used in Toolbar.** The slice was added for external observability (e.g., future keyboard-shortcut handlers), but Toolbar's own overlay state lives in `useState`. Consistent and tested.
- **Phase 9 — `setFullscreen` store action added (not in plan).** The plan called for `terminal.fullscreen` flips via `setTerminal`. Implementation discovered this fails `LEGAL_TERMINAL_TRANSITIONS` when the status is the same (e.g., `active → active`), silently making fullscreen a no-op. A dedicated `setFullscreen(value)` action bypasses the guard (fullscreen is UI-only).
- **Phase 9 — `resolveInitOutcome` input narrowed.** Plan specified the pure function's input as `ProjectOpenResult + PendingInit`; implementation only needs `openResult` since the source-based branching is done in the caller. Functionally equivalent; tests cover all branches.
- **Phase 10 — incidental correctness fixes ride along.** Dagre 0-edge crash (fallback grid layout) and ANSI escape sequences in version output (regex strip) were discovered while making E2E pass on Windows. Both fixes benefit production users, not just the E2E harness.
- **Phase 10 — `ATRIUM_E2E_CLAUDE_BIN` env-var pattern.** Plan suggested a single `ATRIUM_E2E_FOLDER` override on `dialog.openFolder`. Implementation added a second override at the terminal-spawn boundary so the fake-claude binary resolves without touching PATH, and a corresponding guard in healthCheck. Both guards use `NODE_ENV !== 'production' && !app.isPackaged` (defense-in-depth added during P10 fix cycle).
- **Phase 10 → Phase 11 — `__ATRIUM_E2E__` build constant.** Plan called for gating E2E-only globals on an env check. Implementation chose a Vite `define` build constant (`__ATRIUM_E2E__`) so production bundles tree-shake the entire block. Cleaner than a runtime check.
- **Phase 11 — toast system scope widened.** Plan called for `Toast` + toolbar inline error. Implementation added a dedicated `toastStore.ts` slice (separate from `atriumStore`) to avoid coupling transient UI with core state; toasts are pushed from Toolbar, Tooltip, LaunchGate, and ProjectPanel. Inline error surfaces retained per spec.

## Fixes Applied

Eight in-cycle fixes applied during reviews (fixes persisted as edits, not as `fix-*-result.md` files since the team communicated via SendMessage rather than writing artifacts to disk):

1. **Phase 3 — non-dismissable gate.** `LaunchGate.tsx` test-only "Skip" button removed (unconditionally rendered in production, violating brief §A). Test rewired to drive gate close via `useAtriumStore.getState().setProject(...)`. `LaunchGate.test.tsx` added `queryByRole('button', { name: /close|dismiss|cancel/i })` null assertion to lock the invariant.
2. **Phase 5 — right-click dismisses tooltip.** `AtriumNode.handleContextMenu` added `setTooltipTarget(null)` after `toggleSelectedNode` (brief "single gesture" edge case). Test added for tooltip-on-different-node right-click path.
3. **Phase 6 — Phase 4 lint debt cleanup.** 5 ESLint errors in `src/renderer/src/launch/` cleaned (stale `react-hooks/exhaustive-deps` disable comment removed, `_req` renamed with `void req;` marker, `no-misused-promises` wrapped as `void handleAsync()`, stray `async`/unnecessary cast removed).
4. **Phase 8 — Finalize button always enabled.** `Toolbar.tsx` Finalize button `disabled={!switchAllowed}` prop removed; `FinalizePanel`'s Continue button keeps the guard. Test flipped to `finalize.disabled === false` when terminal active, new test for Continue disabled.
5. **Phase 9 — panel-side init dispatch source.** `ProjectPanel.tsx:75` `dispatchInitSpawn(req)` → `dispatchInitSpawn(req, 'panel')`. Test added asserting `pendingInit.source === 'panel'` when form submits from panel.
6. **Phase 9 — Phase 8 toolbar test typecheck debt cleanup.** 5 `noUncheckedIndexedAccess` violations in `Toolbar.test.tsx` fixed via non-null assertions; 2 unused `beforeEach` imports removed.
7. **Phase 9 — fullscreen toggle bypass.** Added `setFullscreen(value)` store action; `TerminalModal.tsx` switched from `setTerminal` call (blocked by transition guard) to `setFullscreen`. 2 new tests prove toggle works under `active` / `spawning`.
8. **Phase 10 — production-leak guards.** `window.__e2e_terminalOutput` gated behind `__ATRIUM_E2E__` Vite build constant; module-local `Window` declaration merge used instead of `Record<string, unknown>` cast. `app.isPackaged` secondary guard added to all three main-process E2E hooks. `package.json` `test:e2e` → `scripts/test-e2e.mjs` Node wrapper for cross-platform env setup.
9. **Phase 11 — lint debt cleanup (30 errors across 6 files).** `scripts/**` added to ESLint ignore; `ProjectPanel.test.tsx` unbound-method via local mock var; `TerminalModal.tsx` init async wrapped `void (async () => {})()` for sync onExit, unnecessary cast dropped; `TerminalModal.test.tsx` dropped 5 useless `async` + `await` on sync `act()`; Toolbar / Finalize / Status tests replaced `as HTMLButtonElement` casts with `getAttribute('disabled')`; `Toolbar.test.tsx` replaced unsafe mock-call index chains with typed `spawnMock.mock.lastCall?.[0] as SkillSpawnRequest` + explicit property checks.
10. **Phase 11 — `toastStore.test.ts` typecheck.** 4 `noUncheckedIndexedAccess` violations fixed with non-null assertions / local extraction.

## Out of Scope (Not Implemented)

Verified absent by final check:

- electron-builder packaging, code signing, installers (Stage 06).
- CI matrix / GitHub Actions (Stage 06).
- Auto-update (deferred beyond v1).
- Keyboard shortcuts for skill buttons (Escape only for tooltip dismiss + modal close-when-exited — locked decision §5).
- Any writes to `.ai-arch/` from Atrium itself (architector plugin owns this via skills in terminal).
- Multiple concurrent terminals.
- Right-side panel slide-out details view on node click (arch brief rejected).
- Skill buttons inside the selection panel (arch brief rejected — toolbar is the only entry point).
- Summary cards with node counts in recents (arch brief rejected — name + path only).
- Unlimited recents (locked at 5).
- `ProjectState.warnings` UI surface (still deferred; planning did not pull it in).
- Layout schema migrations (`SCHEMA_MISMATCH` remains reserved).
- Stage-4 known flake cleanup (`WatcherManager — atomic swap` — carried in Stage 4 archive notes).

## Review Findings

11 reviews run (one per phase). Aggregate: several must-fix / should-fix flagged across phases; all must-fixes resolved during the phase cycle (final check PASSED with no carried issues).

| Phase | Review Status | Must-Fix | Should-Fix |
|-------|---------------|----------|------------|
| 1 | PASSED | 0 | 0 |
| 2 | PASSED | 0 | 0 |
| 3 | HAS_ISSUES (1 fix) | 1 (non-dismissable gate — test-only skip button) | 0 |
| 4 | PASSED | 0 | 0 |
| 5 | HAS_ISSUES (1 fix) | 0 | 1 (right-click dismiss tooltip — promoted to must-fix pre-Phase-6) |
| 6 | HAS_ISSUES (1 lint-debt fix) | 0 | 1 (Phase 4 lint debt surfaced here — 5 errors blocking lint gate, cleaned) |
| 7 | PASSED | 0 | 0 |
| 8 | HAS_ISSUES (1 fix) | 1 (Finalize button always-disabled during terminal active — contrary to brief §D) | 0 |
| 9 | HAS_ISSUES (3 fixes) | 3 (panel-side init source arg missing; 8 typecheck errors from Phase 8 toolbar tests; fullscreen toggle silently no-op under transition guard) | 0 |
| 10 | HAS_ISSUES (2 fixes) | 1 (unconditional `window.__e2e_terminalOutput` in production) | 1 (`app.isPackaged` defense-in-depth) |
| 11 | HAS_ISSUES (2 fix cycles) | 1 (typecheck error in `toastStore.test.ts`) | 1 (30 lint errors — accumulated debt from earlier phases; cleaned end-of-stage) |

All issues resolved within their respective phase cycles. No issues carried forward.

## Final Check Outcome

**Verdict: PASSED.** All five exit gates green, every brief section §A–§H backed by concrete code + tests, every edge case handled, nothing from Out-of-Scope leaked in, 10 Locked Decisions in place verbatim, 5 Open Questions resolved in implementation.

- `npm run build` — PASS (electron-vite build succeeds, main + preload + renderer).
- `npm run typecheck` — PASS (tsc -b across main/preload/renderer/shared — 0 errors).
- `npm run lint` — PASS (eslint . — 0 warnings / 0 errors; Phase 4/8 debt cleaned during Phases 6/11).
- `npm run test` — PASS (502 pass, 1 skip; 2 failures isolated to `watcherManager.test.ts` under parallel execution — confirmed flake: same file runs 7/7 green in isolation. Pre-existing Stage-4 flake; explicitly out of Stage-5 scope).
- `npm run test:e2e` — PASS (3/3 Playwright scenarios: scenario1-launch ~3.1s, scenario2-open-project ~1.1s, scenario3-terminal ~1.9s).

## Files Changed

### `src/shared/` — cross-process contracts
- `ipc.ts` — added `IPC.skill.spawn` namespace.
- `errors.ts` — added `SkillErrorCode`.
- `skill/spawn.ts` — **created**; `SkillSpawnRequest` + `SkillName` re-export.
- `index.ts` — re-exports `./skill/spawn.js`.
- `__tests__/ipc.test.ts`, `skill/__tests__/spawn.contract.test.ts` — **created** / extended.

### `src/main/` — IPC + terminal + dialog
- `ipc/skill.ts` — **created**; `registerSkillHandlers` with injectable path factory + VALID_SKILLS guard.
- `ipc/register.ts` — wires `registerSkillHandlers`.
- `ipc/dialog.ts` — `ATRIUM_E2E_FOLDER` override (dev/test-only, `app.isPackaged` guard).
- `ipc/__tests__/skillHandlers.test.ts` — **created** (5 cases); `register.test.ts` extended.
- `terminal/healthCheck.ts` — `ATRIUM_E2E_CLAUDE_BIN` override + ANSI stripping.
- `terminal/terminalManager.ts` — `ATRIUM_E2E_CLAUDE_BIN` override.

### `src/preload/` — bridge surface
- `api.ts` — added `skill: { spawn }` to `AtriumAPI`.
- `index.ts` — implements `skill.spawn`.
- `__tests__/api.type-test.ts` + `preload.runtime.test.ts` — extended.

### `src/renderer/src/` — app shell, gate, canvas, tooltip, panels, toolbar, terminal modal, store, toasts
- `App.tsx` — gate-aware toggle, auto-open preserved; mounts `ToastContainer`.
- `__tests__/App.test.tsx` — rewritten (5+ tests).
- `shell/MainShell.tsx` — **created**; 280px side panel; mounts SidePanel, Toolbar, Tooltip, TerminalModal.
- `shell/ToastContainer.tsx` — **created**.
- `shell/__tests__/MainShell.test.tsx` — **created**.
- `launch/LaunchGate.tsx` — **created**; full gate body (health, recents, Open routing, inline new-project form).
- `launch/HealthSection.tsx`, `RecentsList.tsx`, `NewProjectForm.tsx` — **created**.
- `launch/buildInitPrompt.ts`, `openOrNewProject.ts` — **created** (pure helpers).
- `launch/__tests__/*` — **created** (LaunchGate, HealthSection, RecentsList, NewProjectForm, buildInitPrompt, openOrNewProject).
- `canvas/AtriumNode.tsx` — click / context-menu handlers wired.
- `canvas/Canvas.tsx` — pane click + context-menu handlers.
- `canvas/dagreLayout.ts` — 0-edge fallback grid.
- `canvas/__tests__/AtriumComponents.test.tsx` — extended; `Canvas.test.tsx` — extended.
- `interaction/Tooltip.tsx`, `tooltipPlacement.ts`, `SkillButton.tsx` — **created**.
- `interaction/__tests__/tooltipPlacement.test.ts` (7), `Tooltip.test.tsx` (13+) — **created**.
- `skill/dispatchSkill.ts` — **created**.
- `skill/__tests__/dispatchSkill.test.ts` (3) — **created**.
- `sidePanel/SidePanel.tsx`, `ProjectPanel.tsx`, `SelectionPanel.tsx`, `canSwitchSelector.ts` — **created**.
- `sidePanel/__tests__/*` — **created** (SidePanel, ProjectPanel, SelectionPanel, canSwitchSelector).
- `toolbar/Toolbar.tsx`, `StatusPanel.tsx`, `FinalizePanel.tsx`, `index.ts` — **created**.
- `toolbar/__tests__/*` — **created** (Toolbar, StatusPanel, FinalizePanel).
- `terminal/TerminalModal.tsx`, `terminalState.ts`, `xtermTheme.ts` — **created**.
- `terminal/__tests__/TerminalModal.test.tsx` (13), `terminalState.test.ts` (9), `pendingInit.test.ts` (4) — **created**.
- `store/atriumStore.ts` — added `setTooltipTarget`, `toggleSelectedNode`, `setFullscreen`, `setPendingInit`/`clearPendingInit`, `setToolbarOverlay`; `clearSelection` updated.
- `store/toastStore.ts` — **created**; `__tests__/toastStore.test.ts` (8) — **created**.
- `store/__tests__/atriumStore.test.ts` — extended.
- `vite-env.d.ts` — **created**; `__ATRIUM_E2E__` ambient.

### Build + test infrastructure
- `package.json` — added `xterm`, `xterm-addon-fit` (runtime); `@playwright/test` (dev). Added `test:e2e` script.
- `electron.vite.config.ts` — renderer `define: { __ATRIUM_E2E__ }`.
- `vitest.config.ts` — `define: { __ATRIUM_E2E__: 'false' }`.
- `playwright.config.ts` — **created**.
- `scripts/test-e2e.mjs` — **created**.
- `.eslintrc.*` (flat config) — `scripts/**` + `e2e/**` added to ignore list.

### E2E harness (under `e2e/`, outside `src/`)
- `fixtures/fake-claude.js` + `fake-claude.cmd` — **created**.
- `fixtures/fake-project/.ai-arch/index.json` + ideas — **created**.
- `helpers/launchApp.ts` — **created**.
- `scenario1-launch.spec.ts`, `scenario2-open-project.spec.ts`, `scenario3-terminal.spec.ts` — **created**.

### Documentation
- `docs/flow/stage-05-interaction-ux/smoke-checklist.md` — **created** (12 scenarios, platform matrix).

## Notes

- **No `phase-*-result.md` / `review-*-report.md` / `fix-*-result.md` artifacts on disk.** The team used the `/teams:flow` orchestration where agents communicate with the team lead via `SendMessage` and the artifacts are captured in the conversation transcript, not written to `.flow-spec/`. The summary above consolidates all of that directly.
- **`WatcherManager` parallel-execution flake** persists — the same flake documented in the Stage 4 archive. Passes in isolation (7/7 green). Not introduced or exacerbated by Stage 5; explicitly out of Stage 5's regression scope per team-lead note to the checker. Candidate for a focused Stage 6 cleanup or a dedicated watcher-timing ticket.
- **`IpcMainOnLike` redundancy** (noted in Stage 4) — still present in `src/main/ipc/terminal.ts`. Its `on` signature matches the widened `IpcMainLike.on`. Left in place; Stage-6 refactor candidate.
- **Manual dev smoke** was not run in the headless team environment. The smoke checklist at `docs/flow/stage-05-interaction-ux/smoke-checklist.md` is the open item for a human team lead to walk through on Windows (and ideally macOS/Linux before Stage 6 packaging ships). Particular attention: tooltip edge-flip at real canvas sizes, xterm rendering under high DPI, and fullscreen-toggle keyboard focus retention.
- **Defense-in-depth guards on E2E env vars** — all three main-process hooks (`dialog.ts`, `healthCheck.ts`, `terminalManager.ts`) check both `process.env.NODE_ENV !== 'production'` AND `!app.isPackaged` before honoring overrides. `window.__e2e_terminalOutput` is additionally gated by the `__ATRIUM_E2E__` Vite build-time constant so the block is tree-shaken out of production bundles.
- **`setFullscreen` is a deliberate escape hatch from the terminal state machine.** `LEGAL_TERMINAL_TRANSITIONS` is still the only path to change `status`; `setFullscreen` only mutates the UI-only `fullscreen` flag. Future UI-only terminal fields should follow the same pattern rather than routing through `setTerminal`.
- **`dispatchSkill` evolution.** Started as a P6 shim (calls `skill.spawn` + transitions to `spawning`), gained full lifecycle in P9 (active/exited flips via `TerminalModal`), and gained toast-on-error in P11. Each evolution preserved backwards compatibility at the call sites (tooltip, toolbar, gate, panel) so intermediate phases shipped green.
- **Open Question 5 resolution** (skill composition bridge) chose option (a) — `skill:spawn` IPC in main. This keeps `composeCommand` + `resolveSkillsPath` co-located in the main process and means the renderer never sees the args array. The alternative (option b — `skill.resolveDir()` exposing the skills directory) was rejected as it would have cached a main-owned path in renderer state.
