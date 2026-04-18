# Feature Summary: Stage 3 — Terminal Pipeline
_Archived: 2026-04-18_
_Status: DONE_

## Goal

Implement the main-process terminal feedback loop end-to-end: compose Claude CLI commands from typed inputs, spawn them via `node-pty`, watch the project's `.ai-arch/` directory for changes Claude makes, and push parsed `ProjectState` updates back to the renderer.

After this stage, the app can spawn a single Claude Code terminal governed by a 5-state lifecycle, forward terminal events to the renderer over IPC, watch `.ai-arch/` with native debounced events, and run a startup health check resolving the `claude` binary and its version.

## What Was Built

### CLI engine (`src/main/terminal/`)
- `TerminalManager` — singleton holding at most one active `IPty`. Owns the canonical 5-state lifecycle (`idle | spawning | active | exited | closing`) via `canTransition` predicate; rejects spawns outside `idle`; wires `pty.onData`/`onExit` to `webContents.send`; on `kill()` sends SIGTERM and arms a 5 s SIGKILL fallback timer (`KILL_FALLBACK_MS`) that is cleared on clean exit and logs `[atrium:terminal] SIGKILL fallback fired: pid=<n> elapsedMs=<n>` on fire. Drops `write`/`resize` silently outside `active`. Enforces a 4 MB `MAX_WRITE_BYTES` guard that rejects over-size writes with a `WRITE_TOO_LARGE` error emitted on `IPC.terminal.onError`.
- `closeAfterExit(id)` helper implements the `exited → closing → idle` transition; the corresponding `IPC.terminal.close` channel is deliberately deferred to Stage 5.
- Health check (`healthCheck.ts`) — `checkClaude()` resolves the binary via `execFile('which'|'where', ['claude'])` with a 3 s timeout + explicit `cp.kill()`, then spawns an independent short-lived pty running `claude --version` with a hard `HEALTH_TIMEOUT_MS = 5000` deadline. Stores the captured version string **verbatim** (pre-release tags and trailing newlines survive). Never occupies the singleton terminal slot.

### Skill orchestration (`src/shared/skill/` + `src/main/skills/`)
- Pure `composeCommand({ skill, nodes?, prompt?, skillsDir })` in `@shared/skill` covering four patterns (`init` / `explore+decide` / `map+finalize` / `free`) plus edge cases (missing prompt, empty nodes, trailing-slash skillsDir). Zero `electron`/`node:fs`/`node:path`/`path`/`fs` imports — enforced by a new safety-grep assertion.
- `resolveSkillsPath()` in `@main/skills` — memoised; branches on `app.isPackaged` between `app.getAppPath()/skills` and `process.resourcesPath/skills`.

### File-state sync (`src/main/fileSync/`)
- `WatcherManager({ onReparse })` — at most one `@parcel/watcher` subscription; 300 ms trailing-edge debounce (`DEBOUNCE_MS`); atomic directory swap on consecutive `start()`; ENOENT → `NOT_FOUND`; idempotent `stop()`. Respects R2: caller passes the watch path verbatim — the manager never appends `.ai-arch/`.

### IPC wiring (`src/main/ipc/`)
- `registerTerminalHandlers(manager, ipcMainLike?)`, `registerFileSyncHandlers(manager, ipcMainLike?)`, `registerHealthHandlers(ipcMainLike?)` replace the Stage 2 stubs. `registerIpc(getWindow, { terminalManager, watcherManager })` signature now requires both managers.
- Preload surface grew by one push channel: `window.atrium.terminal.onError(id, cb) → unsubscribe`, symmetric to existing `onData`/`onExit`.
- `openProject` refactored: pure `readAndAssembleProject(absPath)` extracted so the watcher's debounced re-parse reuses the project pipeline without duplicating file reads; `openProject = readAndAssembleProject + bumpRecent`.

### Startup (`src/main/index.ts`)
- `applyFixPath()` called synchronously as the first runtime statement (before `requestSingleInstanceLock`, before any spawn) so macOS apps launched from Finder/Dock inherit the user's shell PATH.
- Both managers constructed at module level; `createMainWindow()` calls `setWindow(win)` immediately after `new BrowserWindow(...)` and `setWindow(null)` in `win.on('closed', …)` so `webContents.send` never fires against a destroyed window.
- `watcherReparseAdapter` bridges `.ai-arch/` (watcher input) back to project root (what `readAndAssembleProject` wants) via `path.dirname`.

### Native dependencies + rebuild toolchain
- Exact pins (no `^`/`~`): `node-pty@1.1.0`, `@parcel/watcher@2.5.6`, `fix-path@5.0.0` (runtime), `@electron/rebuild@4.0.3` (dev).
- `postinstall` / `rebuild:native` scripts: `electron-rebuild -f -w node-pty,@parcel/watcher`.
- 4 rows added to `STACK_VERSIONS.md` with exact-pin rationale.

## Phases Completed

| Phase | Name | Key Outcome |
|-------|------|-------------|
| 1 | Native deps pinned + rebuild story wired | `package.json` / `package-lock.json` / `STACK_VERSIONS.md` carry exact pins + `@electron/rebuild` postinstall; 161 tests green baseline. |
| 2 | Terminal module scaffold | `constants`, `state` + `canTransition`, skeleton `TerminalManager` whose non-`getState` methods throw `Error('Phase 3')`; 25-assertion 5×5 transition matrix test; `WRITE_TOO_LARGE` + `HEALTH_TIMEOUT` added to error unions. |
| 3 | TerminalManager behavior | Real node-pty integration; 5-state enforcement; SIGKILL fallback with warn log; 4 MB write guard via `'terminal:onError'` string literal; 8 tests (1 Windows-skipped per PD-3); 169 pass / 1 skip. |
| 4 | WatcherManager + onError IPC constant | `IPC.terminal.onError` constant introduced; preload `onError` wrapper symmetric to `onData`/`onExit`; full `WatcherManager` (300 ms debounce, atomic swap, R2 verified); 178 pass / 1 skip. |
| 5 | `composeCommand` + `resolveSkillsPath` | Pure `composeCommand` with 11 unit tests covering all patterns + edge cases; memoised `resolveSkillsPath`; 189 pass / 1 skip. |
| 6 | healthCheck + fix-path boot wrapper | `checkClaude()` independent-pty probe with timeout; `applyFixPath` thin wrapper; 6 mocked-pty tests; 195 pass / 1 skip. |
| 7 | IPC wiring + `openProject` refactor | Handlers delegate to injected managers; `readAndAssembleProject` extracted; `wiredHandlers.test.ts` replaces `stubHandlers.test.ts`; 196 pass / 1 skip. |
| 8 | Startup wiring + safety-grep extension + release gate | `applyFixPath` first; managers + `setWindow` wiring; `registerIpc` managers now required; safety-grep third assertion for `@shared/skill`; new `safety.lockfile.test.ts` enforces AC 11. 201 pass / 1 skip. |

## Edge Cases Handled

- **Spawn rejected outside `idle`** — second `spawn()` during an active session returns `SPAWN_FAILED` without disturbing the first.
- **Clean exit before SIGKILL fallback** — `pty.onExit` handler calls `clearTimeout(#killTimer)` before transitioning `active → exited`, preventing stale timer firing against a recycled PID (D1).
- **Windows has no POSIX signals** — `pty.kill('SIGTERM')` throws on `win32`; platform-branch in `kill()` calls `pty.kill()` no-arg and skips the SIGKILL timer. Tests use `process.execPath` (node-pty on Windows requires the full `.exe` path). SIGKILL fallback test skipped with `it.skipIf(win32)` per PD-3.
- **Window destroyed mid-send** — every `webContents.send` null-guards with `#window && !#window.isDestroyed()`.
- **Watcher burst coalescing** — 5 file writes within 100 ms produce exactly one `onChanged` push after the 300 ms quiescence period.
- **Atomic watcher swap** — starting a new watcher while one is active tears down the old subscription first (no dual subscriptions, no leaked timer).
- **Non-existent watch dir** — stat check fires before `@parcel/watcher.subscribe`, returning `NOT_FOUND` cleanly.
- **Reparse rejection** — `onReparse` failures inside the debounce fire are swallowed with `console.warn`; no crash, no push.
- **Binary missing** — `which`/`where` ENOENT → `CLAUDE_NOT_FOUND` with actionable message.
- **Health probe stuck** — 5 s `HEALTH_TIMEOUT` fires, kills the pty, returns `HEALTH_TIMEOUT`. 3 s internal timeout around `execFile` explicitly calls `cp.kill()` before rejecting.
- **Version parse failure** — probe output missing `/\d+\.\d+\.\d+/` → `VERSION_UNPARSEABLE` with resolved path in the message. Valid pre-release tags (e.g. `1.4.0-beta.3`) preserved verbatim (D3).
- **Over-size write (4 MB+)** — dropped and surfaced as `WRITE_TOO_LARGE` error event rather than silently truncating or splitting (D4/PD-2).
- **`@shared/skill` purity** — `composeCommand` handles trailing-`/` on `skillsDir` without producing double-slash; degrades gracefully on missing `prompt` / empty `nodes`.

## Deviations From Original Plan

1. **Phase 3 — Windows `kill()` platform branch.** `pty.kill('SIGTERM')` throws on Windows; implementer added `process.platform === 'win32'` guard that calls `pty.kill()` no-arg and skips the SIGKILL timer. Tests use `process.execPath` for cross-platform spawn. SIGKILL fallback test skipped on `win32` per PD-3. Accepted by review — `active` state check runs before the platform branch, so the guard is not bypassed; `#killTimer` stays null on Windows (no leak).

2. **Phase 4 — R2 invariant test uses source-text assertion.** `vi.spyOn` against `@parcel/watcher.subscribe` is infeasible because ESM module namespaces are non-configurable under Vitest. Substituted a source-grep test asserting `.ai-arch` is never appended inside `watcherManager.ts`. Reviewer accepted with a note that the test name should clarify it's a source-level check.

3. **Phase 4 — pre-existing lint bug cleanup.** Removed a dangling `async beforeEach` with no `await` in `terminalManager.test.ts` (Phase 3 artifact). No behavior change.

4. **Phase 6 — callback-style `execFile`.** Used callback form rather than `util.promisify(execFile)` so `vi.mock` interception works reliably. Wrapped in a hand-rolled Promise with the plan's 3 s timeout semantics intact.

5. **Phase 7 — `registerIpc` managers optional with fallback.** Made the `{ terminalManager, watcherManager }` argument optional temporarily (falling back to `new TerminalManager()` / `new WatcherManager({ onReparse: () => Promise.resolve(null) })`) so `src/main/index.ts` continued to compile through the phase boundary. **Cleaned up in Phase 8** — the argument is now required and the fallback is deleted. No IPC path exercised the orphan fallback instances (no UI existed during the interim).

6. **Phase 8 — `@electron/rebuild` script flag form.** Plan listed `-w node-pty -w @parcel/watcher` (two flags); the `@electron/rebuild@4.0.3` CLI actually documents the comma form `-w node-pty,@parcel/watcher`, which is what shipped. Functionally identical.

## Fixes Applied

None. No `/flow:implement fix` runs were needed — every phase passed first-round review.

## Out of Scope (Not Implemented)

Explicitly deferred:
- `TerminalModal` React component, xterm.js wiring, fullscreen toggle (Stage 5).
- Renderer-side Zustand slices, terminal slice, file-sync hook (Stage 4).
- Canvas / React Flow rendering (Stage 4).
- `SKILL.md` content authoring (assumed present in the resolved `skillsDir`).
- `IPC.terminal.close` channel and `exited → closing → idle` trigger from user action (Stage 5; internal `closeAfterExit(id)` helper lands here).
- Project-switch plumbing calling `WatcherManager.start/stop` on `project:switch` (Stage 4/5).
- Full backpressure system for `terminal:write` — the 4 MB seatbelt is the only guard; Stage 5 owns the follow-up tests (10 KB / 100 KB / 1 MB paste smoke; 10k events/sec × 10 s sustained; slow-reader buffer check).
- `atrium.claudeCodePath` config override — namespace reserved, unclaimed, not implemented (D2).
- `healthCheck.deep()` end-to-end inference probe (D3).
- User-configurable `KILL_FALLBACK_MS` — module-level constant only (D1).

## Review Findings

8 review rounds, 0 blocking issues across all phases. Aggregate counts: **must-fix 0, should-fix 0**. Non-blocking observations the reviewers noted:
- Phase 1: prebuilt-only Windows validation (VS Build Tools absent on dev machine; `electron-rebuild` source compile unverified locally — flagged for Stage 6 CI matrix to require source-rebuild verification).
- Phase 3: SIGKILL fallback test uses `'node'` string at line 121 instead of the `NODE = process.execPath` constant used elsewhere in the file; test is win32-skipped so cosmetic.
- Phase 4: R2 invariant source-text test name should more clearly signal "source-level check, not runtime".
- Phase 6: `resolveBinaryPath` 3 s timeout did not explicitly `cp.kill()` the child — addressed in Phase 7's carry-over.
- Phase 7: `registerIpc` optional-managers deviation accepted as safe dead-code-by-Phase-8.

## Final Check Outcome

`/flow:check` verdict: **DONE**. Re-run of `npm run typecheck && npm run lint && npm run test && npm run build` — all four green. 201 tests passed, 1 skipped (Windows SIGKILL per PD-3). All 11 Acceptance Criteria visibly satisfied; every D1–D4 locked decision and R1–R4 reconciliation confirmed verbatim against the codebase. Out-of-scope boundary respected end-to-end (zero occurrences in grep of `TerminalModal`, `zustand`, `react-flow`, `terminal:close`, `claudeCodePath`, `healthCheck.deep`). Safety invariants intact: parser electron-free, no `.ai-arch/` writes anywhere in `src/`, `@shared/skill/**` environment-free, lockfile pins enforced by new test. No regressions.

## Files Changed

**Modified**
- `package.json` — native deps + `postinstall`/`rebuild:native` scripts (Phase 1)
- `package-lock.json` — fresh lock (Phase 1)
- `STACK_VERSIONS.md` — 4 rows appended (Phase 1)
- `src/shared/errors.ts` — `WRITE_TOO_LARGE` (`TerminalErrorCode`) + `HEALTH_TIMEOUT` (`HealthErrorCode`) added (Phase 2)
- `src/shared/ipc.ts` — `IPC.terminal.onError` constant added (Phase 4)
- `src/preload/api.ts` — `onError(id, cb)` surface added (Phase 4)
- `src/preload/index.ts` — `onError` listener implementation (Phase 4)
- `src/preload/__tests__/preload.runtime.test.ts` — `onError` listener-identity test (Phase 4)
- `src/main/ipc/__tests__/register.test.ts` — `IPC.terminal.onError` added to `PUSH_ONLY_CHANNELS`; fake-manager injection (Phases 4, 7)
- `src/main/ipc/terminal.ts` — `registerTerminalHandlers` wired to injected `TerminalManager` (Phase 7)
- `src/main/ipc/fileSync.ts` — `registerFileSyncHandlers` wired to injected `WatcherManager` (Phase 7)
- `src/main/ipc/health.ts` — `health:checkClaude` delegates to `checkClaude()` (Phase 7)
- `src/main/ipc/register.ts` — `registerIpc` signature extended with required `{ terminalManager, watcherManager }` (Phases 7, 8)
- `src/main/project/openProject.ts` — split into `readAndAssembleProject` + `bumpRecent` wrapper (Phase 7)
- `src/main/project/index.ts` — exports `readAndAssembleProject` (Phase 7)
- `src/main/project/__tests__/openProject.test.ts` — parity suite added (Phase 7)
- `src/main/terminal/terminalManager.ts` — full behavior: spawn/kill/write/resize/closeAfterExit + 5-state + SIGKILL fallback + 4 MB guard (Phases 3–4)
- `src/main/terminal/index.ts` — re-exports `toArrayBuffer` (Phase 3)
- `src/main/terminal/__tests__/terminalManager.test.ts` — async-beforeEach lint fix (Phase 4 carry-over)
- `src/main/__tests__/safety.grep.test.ts` — third assertion: `@shared/skill` environment-free (Phase 8)
- `src/main/index.ts` — `applyFixPath()` first; managers constructed + injected; `setWindow` wiring in `createMainWindow`/`closed` (Phase 8)

**New**
- `src/main/terminal/constants.ts` — `KILL_FALLBACK_MS`, `MAX_WRITE_BYTES` (Phase 2)
- `src/main/terminal/state.ts` — `TerminalState` union + `canTransition` predicate (Phase 2)
- `src/main/terminal/__tests__/state.test.ts` — 5×5 transition matrix (Phase 2)
- `src/main/terminal/toArrayBuffer.ts` — utf-8 `string → ArrayBuffer` helper (Phase 3)
- `src/main/terminal/healthCheck.ts` — `checkClaude()` + `HEALTH_TIMEOUT_MS`; explicit `cp.kill()` in resolveBinaryPath timeout (Phases 6, 7)
- `src/main/terminal/__tests__/healthCheck.test.ts` — 6 mocked-pty tests (Phase 6)
- `src/main/fileSync/constants.ts` — `DEBOUNCE_MS = 300` (Phase 4)
- `src/main/fileSync/watcherManager.ts` — full WatcherManager (Phase 4)
- `src/main/fileSync/index.ts` — barrel (Phase 4)
- `src/main/fileSync/__tests__/watcherManager.test.ts` — 7 behavior tests (Phase 4)
- `src/main/fileSync/__tests__/watcherManager.reparse-contract.test.ts` — reparse-rejection swallow (Phase 4)
- `src/shared/skill/composeCommand.ts` — pure function + `SkillName` type (Phase 5)
- `src/shared/skill/index.ts` — barrel (Phase 5)
- `src/shared/skill/__tests__/composeCommand.test.ts` — 11 unit tests (Phase 5)
- `src/main/skills/resolveSkillsPath.ts` — memoised dev/packaged branch (Phase 5)
- `src/main/skills/index.ts` — barrel (Phase 5)
- `src/main/boot/applyFixPath.ts` — thin `fix-path` wrapper (Phase 6)
- `src/main/boot/index.ts` — barrel (Phase 6)
- `src/main/ipc/__tests__/wiredHandlers.test.ts` — 7 delegation tests (Phase 7)
- `src/main/__tests__/safety.lockfile.test.ts` — AC 11 enforcement (Phase 8)

**Deleted**
- `src/main/ipc/__tests__/stubHandlers.test.ts` — superseded by `wiredHandlers.test.ts` (Phase 7)

## Notes

**Follow-ups carried forward (from `check-result.md`):**
1. **`cp` reference readability** — `healthCheck.resolveBinaryPath` references `cp` inside a `setTimeout` callback that closes over the later-assigned `execFile` child. TDZ-safe but a readability wart; tidy in Stage 5 if the module grows.
2. **Windows SIGKILL test skip (PD-3)** — if Stage 4/5 gains Windows E2E runners, document an alternative cross-platform SIGKILL proof (e.g. process-group kill via `taskkill /F`).
3. **`atrium.claudeCodePath` reserved namespace** — when Stage 5 ships settings UI, carve out this key as the user override for `claudePath`; do not collide.
4. **`conpty_console_list_agent` stderr noise** on Windows `vitest run` — non-fatal `AttachConsole failed` bleed; if CI logs matter, gate node-pty load or redirect stderr.
5. **`@electron/rebuild` on Windows arm64** — Stage 6 CI matrix will need `--arch=arm64` if arm64 runners are added.
6. **`WatcherManager.#fire` reparse-error swallow** — rejections from `onReparse` log `console.warn` but don't surface to the renderer. Stage 4 may want a typed `FileSyncErrorCode.REPARSE_FAILED` push if parse-failure visibility is needed mid-watch.
7. **`IPC.terminal.close` channel + Stage 5 trigger** — R3 deferred; `closeAfterExit(id)` internal helper is in place; Stage 5 adds the channel, preload wrapper, and handler (alongside the close-button UI).
8. **Full backpressure system for `terminal:write`** — D4 follow-up tests (large-paste smoke 10 KB / 100 KB / 1 MB; sustained programmatic stress 10k events/sec × 10 s; slow-reader buffer check) land in Stage 5.
