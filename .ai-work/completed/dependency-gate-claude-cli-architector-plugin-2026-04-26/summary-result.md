# Dependency Gate (Claude CLI + architector plugin)
_Completed: 2026-04-26_

## Goal
Hard-block app launch until both required external dependencies are present: the `claude` CLI binary and the `architector@getleverage` plugin. Without either, Atrium cannot spawn terminals or run skills, so the launch gate blocks the user and offers a one-click hidden-pty install path for the plugin.

## Implementation Summary
Extended the launch-time `claude --version` check into a two-step dependency gate.

- **Shared types/contracts (Phase 1):** added 6 new `HealthErrorCode`s (`PLUGIN_NOT_FOUND`, `PLUGIN_LIST_UNAVAILABLE`, `PLUGIN_PROBE_TIMEOUT`, `INSTALL_FAILED`, `INSTALL_TIMEOUT`, `INSTALL_CANCELLED`); introduced `PluginInfo` and `InstallOutcome` discriminated union; added 3 health IPC channels (`checkPlugin`, `installPlugin`, `cancelInstall`).
- **Main-process plugin probe (Phase 2):** `pluginCheck.ts` runs `claude plugin list --json` via hidden pty, ANSI-strips, JSON-parses, matches `id === 'architector@getleverage'`, with a 5 s timeout. Never imports `TerminalManager` (singleton-slot invariant).
- **Main-process install runner (Phase 3):** `pluginInstall.ts` runs two sequential hidden ptys (`claude plugin marketplace add romadanylchuk/getleverage` → `claude plugin install architector@getleverage`), 60 s per step, with cancel support and a module-level singleton handle. Post-install re-probes via `checkArchitectorPlugin`.
- **IPC wiring (Phase 4):** wired the three handlers in `health.ts` with a concurrent-install guard; install cwd is `app.getPath('userData')`. Preload exposes typed wrappers.
- **Renderer state (Phase 5):** renamed `healthStatus`/`healthInfo`/`_setHealth` → `claudeStatus`/`claudeInfo`/`_setClaude`; added `pluginStatus`, `pluginInfo`, `installState` (`idle`/`installing`/`failed`), `_recheckHealth`, and matching actions.
- **Two-phase health hook (Phase 6):** Phase A runs claude → plugin sequentially on mount (single-failure definitive — no hysteresis); Phase B is the existing 30 s claude-only poll with 3-failure hysteresis. `_recheckHealth` published via `_setRecheckHealth` on mount.
- **LaunchGate UX (Phase 7):** `gated = claudeStatus !== 'healthy' || pluginStatus !== 'present'` disables Open + recents with tooltip; DEPENDENCIES section renders Claude unreachable explainer + Install / Cancel / Retry / Re-check controls; failure-log `<pre>` (max 200px) on `installState.kind === 'failed'`; "Cancelled" header variant; bottom health-line is two `<div>` lines (claude + architector).
- **Side-panel passive surface (Phase 8):** `ProjectPanel` renders two stacked health lines covering all five plugin statuses.
- **E2E (Phase 9):** `fake-claude.js` handles `plugin list --json`; `scenario1-launch.spec.ts` waits for both lines healthy/present (scoped to `[data-testid="launch-health-line"]` to dodge strict-mode duplicate-text from the DEPENDENCIES section), then asserts Open is enabled.
- **Post-final-check fix:** added `shell:openExternal` IPC channel (HTTPS-only guard) and an `<a>` link to `https://claude.ai/download` in the LaunchGate Claude-unreachable explainer.

Final check: 224/224 unit tests pass across the 8 feature-touching test files; `tsc --noEmit` clean; rename cascade verified by grep (`healthStatus|healthInfo|_setHealth` → no matches in `src/`).

## Key Decisions
- **`--json` flag instead of regex over decorated output:** `claude plugin list --json` confirmed available; parser is `JSON.parse` of a typed array, not a fragile string parser.
- **Singleton-slot invariant:** plugin probe + install ptys deliberately bypass `TerminalManager` (mirroring `healthCheck.ts`), so they can't lock the user's first project terminal slot. Verified structurally in unit tests (no `TerminalManager` import) and via grep.
- **No mid-session re-gate:** Phase B leaves `pluginStatus` untouched, so a Claude regression alone cannot reset the unlocked state into a gate. Mid-session disappearance is surfaced passively only.
- **Phase-1 sequencing deviation:** `register.test.ts` was touched in Phase 1 (plan deferred it to Phase 4) because the dynamic "all channels registered" check failed against the new constants. Resolved with a `PENDING_CHANNELS` exclusion set, removed in Phase 4.
- **Toolbar rename cascade:** Phase 5 also renamed `healthStatus` → `claudeStatus` in `Toolbar.tsx`/`Toolbar.test.tsx` (not explicitly listed in the plan) to keep the tree compiling.
- **`useCallback([], [])` with empty deps:** intentional; all closed-over values (refs, Zustand actions) are stable. `eslint-disable react-hooks/exhaustive-deps` comments were skipped because the rule isn't configured in the project.
- **E2E strict-mode scope fix:** locator scoped to `[data-testid="launch-health-line"]` because the DEPENDENCIES section also renders the Claude line while plugin probe is in flight.
- **`cancelInstall` async fix:** latent TS error from Phase 4 surfaced in Phase 7 — handler made `async` to satisfy `safeHandle`'s `Promise` constraint.

## Files Changed
**Shared**
- `src/shared/errors.ts`
- `src/shared/domain.ts`
- `src/shared/ipc.ts`

**Main process**
- `src/main/terminal/pluginCheck.ts` _(new)_
- `src/main/terminal/__tests__/pluginCheck.test.ts` _(new)_
- `src/main/terminal/pluginInstall.ts` _(new)_
- `src/main/terminal/__tests__/pluginInstall.test.ts` _(new)_
- `src/main/ipc/health.ts`
- `src/main/ipc/register.ts`
- `src/main/ipc/shell.ts` _(new — fix)_
- `src/main/ipc/__tests__/register.test.ts`
- `src/main/ipc/__tests__/wiredHandlers.test.ts`

**Preload**
- `src/preload/api.ts`
- `src/preload/index.ts`

**Renderer**
- `src/renderer/src/store/atriumStore.ts`
- `src/renderer/src/store/__tests__/atriumStore.test.ts`
- `src/renderer/src/health/useHealthPoll.ts`
- `src/renderer/src/health/__tests__/useHealthPoll.test.tsx`
- `src/renderer/src/launch/LaunchGate.tsx`
- `src/renderer/src/launch/__tests__/LaunchGate.test.tsx`
- `src/renderer/src/sidePanel/ProjectPanel.tsx`
- `src/renderer/src/sidePanel/__tests__/ProjectPanel.test.tsx`
- `src/renderer/src/toolbar/Toolbar.tsx`
- `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx`

**E2E**
- `e2e/fixtures/fake-claude.js`
- `e2e/scenario1-launch.spec.ts`

## Gaps/Notes
- No `feature-docs.md` produced (`/document-work-result` was not run before compact), so `mental-model.md` / `decision-log.md` / `dependency-map.md` are not included in this archive.
- One issue surfaced by the first final-check (missing external link to Claude install docs in the unreachable branch) was resolved via a follow-up fix; the second final-check passed clean.
- Pre-existing unit test failures in `consultation/` and `fileSync/` remain — confirmed unrelated to this feature.
- Out-of-scope items per the brief are confirmed not implemented: bundled installer hooks, Claude auto-install, visible terminal modal for install, mid-session re-gate, plugin version pinning, multi-plugin support, plugin auto-update, second E2E scenario (gate-blocked install-button-visible).
