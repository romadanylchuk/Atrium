# Feature Summary: Stage 02 — IPC & Data Layer
_Archived: 2026-04-18_
_Status: DONE_

## Goal

Build the main-process ↔ renderer communication contract (IPC) and the read-only `.ai-arch/` parser for Atrium. After this stage the app can: present a typed, namespaced preload API (`window.atrium.*`) to the renderer; let the renderer ask the main process to open a folder containing `.ai-arch/`, parse it, and receive a typed `ProjectState`; persist/read the "recent projects" list in Electron userData (capped at 5); persist/read per-project canvas layout metadata (`layout.json`); and define — but not implement — the channels for terminal, file-watcher, and health check (stubs return `Result.err(CommonErrorCode.NOT_IMPLEMENTED, 'stage 03')`). This stage is the data backbone every other stage consumes.

No new UI — renderer stays on the Stage 01 proof-of-life page. Outcome is infrastructural: opening DevTools in the running app exposes `window.atrium.project`, `dialog`, `fileSync`, `terminal`, `health` as namespaced objects backed by a typed `Result<T, E>` transport.

## What Was Built

**`@shared` transport contract (Phase 1):** `Result<T, E>` discriminated union with `ok()` / `err()` constructors, six `as const` error-code namespaces (`CommonErrorCode`, `ProjectErrorCode`, `DialogErrorCode`, `FileSyncErrorCode`, `TerminalErrorCode`, `HealthErrorCode` — each spreading Common members), domain types (`NodeData`, `Connection`, `Session`, `ProjectContext`, `ProjectState`, `RecentProject`, `HealthInfo`, `ParseWarning`, branded `TerminalId`), and the `IPC` channel-name constants object. Zero Electron / Node / React imports in `src/shared/**`.

**Pure parser (`src/main/parser/`, Phase 2):** Electron-free, fs-free string/map → `Result`/partial pipeline. `splitByH2` tracks backtick fences at column 0 and normalizes CRLF; `parseIndex` hand-validates JSON (no Zod) and emits `UNKNOWN_INDEX_FIELD` warnings; `parseNodeMarkdown` never throws and emits `MALFORMED_NODE_MD` on missing headings; `parseProjectContext` handles empty files as legitimate; `assembleProjectState` merges warnings from all sources. Unknown enum values (`priority`, `maturity`, `connection.type`) pass through as raw strings — the architector plugin is the sole writer and may add new values ahead of us.

**Storage (`src/main/storage/`, Phase 3):** `write-file-atomic` 7.0.1 (exact-pinned) runtime dep wrapped in `atomicWriteJson`. `projectHash` implements D1 — slug (`[a-z0-9-]`, 32-char cap, `project` fallback) + sha256(normalized-path).slice(0,8); win32 paths lowercased via `process.platform` guard. `appConfig` implements all D2 branches: missing → silent defaults, corrupt → quarantine to `config.json.corrupt-<iso>` (colons replaced with `-` for Windows compat), future `schemaVersion` → warn + in-memory defaults + file byte-unchanged, older `schemaVersion` → backup to `config.json.v<old>.bak` then migrate. `layout` mirrors the same fail-closed pattern per-project. Warn prefix `[atrium:config]` / `[atrium:storage]`. Tests use `__setUserDataDirForTests` seam.

**Project orchestrator (`src/main/project/`, Phase 4):** `openProject(absPath)` wires stat → parseIndex → read idea files → read `project-context.md` → `assembleProjectState` → fire-and-forget `bumpRecent`. Missing idea files become `MISSING_IDEA_FILE` warnings (non-fatal). `bumpRecent` errors are warned but don't fail the open. `showOpenFolder(window)` wraps `dialog.showOpenDialog` — cancel → `Result.ok(null)`, OS error → `Result.err(DIALOG_FAILED)`. Null-window branch supported.

**IPC handler layer (`src/main/ipc/`, Phase 5):** `ipcModule.ts` isolates the single `ipcMain` value import so Vitest can `vi.mock` it. `safeHandle` wraps `ipcMain.handle` with a try/catch that converts any throw to `Result.err(INTERNAL)` with `e instanceof Error ? e.message : String(e)` coercion. Fully-implemented channels: `project:open`, `project:switch` (same body as open for now), `project:getRecents`, `dialog:openFolder`. Stubs: `fileSync:start/stopWatching`, `terminal:spawn/kill`, `health:checkClaude` — all return exactly `Result.err(CommonErrorCode.NOT_IMPLEMENTED, 'stage 03')`. `terminal:write` / `terminal:resize` registered as no-op `ipcMain.on` subscribers. `registerIpc` is idempotent. Push-only channels (`fileSync:onChanged`, `terminal:onData/onExit`) are unregistered — Stage 03 adds `webContents.send` emitters.

**Preload contextBridge surface (`src/preload/`, Phase 6):** `contextBridge.exposeInMainWorld('atrium', api)` with the full namespaced surface. `ipcRenderer` itself is NOT exposed — only wrapper functions. Every `on*` listener captures a single `listener = makeListener(cb)` reference, passes it to `ipcRenderer.on`, and the returned closure calls `ipcRenderer.removeListener` with the exact same reference (identity-preserving). `terminal.onData` and `terminal.onExit` filter by `id` for forward-compat with multi-terminal. `AtriumAPI` type + `declare global { interface Window { atrium } }` lives in `src/preload/api.ts`; `tsconfig.web.json` lists `src/preload/api.ts` + `src/shared/**/*` in `include` (required by `composite: true`).

**Main-process wire-up (`src/main/index.ts`, Phase 7):** `registerIpc(() => mainWindow)` called inside the `gotLock` branch, after `second-instance` handler, **before `app.whenReady()`** to eliminate the renderer-race window. `fs.mkdir(getProjectsDir(), { recursive: true })` called at the top of `whenReady` with `.catch(warn)` — non-blocking. Security prefs (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`) byte-identical to Stage 01.

**Hardening (Phase 8):** 19 additional tests + helper + fixture. `makeFakeIpcMain` helper extracted. New files: `src/main/ipc/__tests__/helpers/makeFakeIpcMain.ts`, `parseProjectContext.test.ts`, `preload.runtime.test.ts` (listener identity via `toBe` ref equality, id filter, ArrayBuffer fidelity, send vs invoke), `safety.grep.test.ts` (parser contains zero Electron imports; no `.ai-arch/` write-verbs anywhere in `src/`). New fixture `whitespace-section.md`. String/null non-Error coercion branch now covered.

## Phases Completed

| Phase | Name | Key Outcome |
|-------|------|-------------|
| 1 | Shared types & channel constants | `@shared` barrel with `Result`, 6 error-code namespaces, 12 domain types, `IPC` channel map; 12 tests |
| 2 | Pure parser (Electron-free) | `splitByH2` (fence-aware, CRLF-aware), `parseIndex`/`parseNodeMarkdown`/`parseProjectContext`/`assembleProjectState`; 34 tests, 7 fixtures |
| 3 | Storage + dep install | `write-file-atomic` 7.0.1 pinned; `paths`/`projectHash`/`atomicWrite`/`appConfig`/`layout` with D1 hash + D2 quarantine/backup/migration; 43 tests |
| 4 | Project orchestrator | `openProject` + `showOpenFolder` wiring dialog → parser → storage; 12 tests |
| 5 | Main IPC handlers + `register.ts` | `ipcModule` seam, `safeHandle`, 4 fully-implemented + 5 stub + 2 no-op-on channels; 26 tests |
| 6 | Preload contextBridge surface | `window.atrium` bridge, `AtriumAPI` ambient type, listener-identity pattern; 15 type-level tests |
| 7 | Wire-up in `src/main/index.ts` | `registerIpc` pre-`whenReady`; `getProjectsDir` mkdir on boot; first full-system build green |
| 8 | Comprehensive tests + hardening | Phase 5 should-fixes folded in, parser/storage/IPC runtime edge cases, negative safety grep tests; +19 tests → 161 total |

## Edge Cases Handled

- **`## ` inside a fenced code block** (brief §6 requirement) — `fence-with-h2.md` fixture; `splitByH2` tracks `insideFence` toggle on `` ``` `` at column 0, only splits when false. Assertion is exact ordered-key equality (`['Description', 'Real Heading']`).
- **Malformed / empty / CRLF markdown** — `parseNodeMarkdown` never throws; empty-string emits one `MALFORMED_NODE_MD` warning; CRLF fixture round-trips via `\r?\n`-tolerant splitter; whitespace-only section bodies preserved (`sections['Notes']` present with `.trim() === ''`).
- **Corrupt / truncated `index.json`** — `Result.err(PARSE_FAILED)`, no throw.
- **Unknown enum values** — `priority`, `maturity`, `connection.type` pass through as raw string with zero warnings (architector-plugin forward-compat).
- **Missing idea file referenced by `index.json`** — `Result.ok` with `MISSING_IDEA_FILE` warning; node emitted with empty `description`/`sections`/no `markdownContent`.
- **`app-config` with `schemaVersion: 999`** — warn, in-memory defaults, file SHA-256 byte-identical before/after load.
- **`app-config` with `schemaVersion: 0`** — atomic-write backup to `config.json.v0.bak`, empty migration registry bumps to current, rewrite succeeds.
- **`app-config` backup-write failure** — target pre-created as directory; warn emitted, defaults returned, original corrupt-version file untouched.
- **Corrupt-JSON quarantine filename is Windows-safe** — `toISOString().replace(/:/g, '-')`, asserted `.not.toContain(':')`.
- **`projectHash` win32 vs posix casing** — stubs `process.platform` in both directions; hash identical across win32 case variants, different on posix.
- **Atomic-write concurrency** — two rapid `saveAppConfig` calls via `Promise.all` produce valid JSON with one `recents` entry.
- **`bumpRecent` failure during `project.open`** — swallowed with warn, open still returns `Result.ok`.
- **`dialog.openFolder` cancel** — `Result.ok(null)` (distinct from `Result.err(DIALOG_FAILED)` for OS failures).
- **`showOpenFolder` with null window** — handled via conditional overload selection (`dialog.showOpenDialog(window, opts)` vs `dialog.showOpenDialog(opts)`).
- **Preload listener identity** — `removeListener` receives the exact same function reference passed to `on` (verified via `toBe`, not `toEqual`).
- **`terminal.onData` / `terminal.onExit` id filter** — mismatched id does NOT invoke callback.
- **ArrayBuffer fidelity across bridge** — mocked `ipcRenderer.invoke` returning an `ArrayBuffer` is re-exposed with identical reference and `.byteLength` intact.
- **`terminal.write` / `terminal.resize` use `send` not `invoke`** — verified via spy call log.
- **Registration idempotency** — `registered` guard lets tests call `registerIpc` twice without double-handler errors.
- **Renderer-race elimination** — `registerIpc` called at top level inside `gotLock`, before `app.whenReady()`.
- **Negative safety: parser Electron-free** — `safety.grep.test.ts` reads all `src/main/parser/**/*.ts` (excluding `__tests__/`) and asserts zero matches for `from 'electron'` / `require('electron')`.
- **Negative safety: no `.ai-arch/` writes** — `safety.grep.test.ts` reads all `src/**/*.ts` (excluding `__tests__/`) and asserts no line contains both `.ai-arch` and a write-verb (`writeFile*`, `appendFile*`, `writeFileAtomic`, `atomicWriteJson`, `rename*`, `rm*`, `unlink*`, `mkdir*`).

## Deviations From Original Plan

- **Phase 2 — `vitest.config.ts` alias mirror.** Plan did not list a `vitest.config.ts` change but the implementer added a `resolve: { alias }` block mirroring the four existing aliases. Without it, Vitest (which runs outside `electron-vite`) could not resolve `@shared/*` imports. Not a path-alias schema change — just wiring existing aliases into the test runner. Reviewer flagged as legitimate.
- **Phase 6 — `tsconfig.web.json` gained a second `include` entry.** Plan called for one entry (`src/preload/api.ts`); in practice `src/shared/**/*` had to be added as well because `composite: true` requires all referenced files to be listed (verified: temporarily removing it produced 5 TS6307 errors). The Phase 6 implementer documented this as a plan gap, reviewer confirmed legitimacy.
- **Phase 6 — `@shared` vs `@shared/index` import path.** The wildcard alias `@shared/*` does not match a bare `@shared` import in all tsconfigs. Fixed by using `import type { ... } from '@shared/index'` everywhere in preload files. Main-process code keeps `@shared` (resolves via `tsconfig.node.json` `include`). Future cleanup (adding `"@shared": ["src/shared/index.ts"]`) is out of Stage 02 scope because it would touch all three mirrored tsconfigs.
- **Phase 6 — `vitest.config.ts` `include` glob.** Extended the `main` project pattern from `'src/preload/**/*.test.ts'` to `'src/preload/**/*.{test,type-test}.ts'` to pick up `api.type-test.ts` (the `-` before `test` is not an extension separator). Minimal, reviewer confirmed.
- **Phase 8 — nothing further deferred.** All edge cases from the plan spec landed; the Phase 5 should-fixes were folded in as scheduled (new `String(e)` coercion tests, `makeFakeIpcMain` helper extraction).

## Fixes Applied

One post-check lint fix (not captured as a `fix-*-result.md` artifact because the re-run happened inline):

- **`src/main/ipc/__tests__/safeHandle.test.ts` — ESLint `@typescript-eslint/prefer-promise-reject-errors` at line 119.** The first `/flow:check` run reported a single lint error against `Promise.reject(42)` on that line. Fix: added `// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors` at line 121 directly above the `Promise.reject(42)` call, matching the sibling-disable pattern used on other `@typescript-eslint/only-throw-error` cases in the same file. The `Promise.reject(42)` is preserved so the `String(e)` coercion branch remains covered. Verified: `eslint .` reports zero errors / zero warnings on the re-run; test still passes. No other files changed.

## Out of Scope (Not Implemented)

Preserved from the brief so future stages know what was deliberately skipped:

- **Terminal lifecycle** — node-pty spawn/kill, 5-state machine, ArrayBuffer write/resize, onData/onExit push. Channel shapes only; real implementation is Stage 03.
- **File watcher** — `@parcel/watcher`, 300ms debounce, re-parse on change, `fileSync.onChanged` push. Channel shapes only; real implementation is Stage 03.
- **Health check** — `claude` binary detection, version parsing. Channel shape only; real implementation is Stage 03.
- **Renderer UI** — project launcher, canvas, terminal modal, toolbar. Stages 04/05. `src/renderer/src/App.tsx` is byte-identical to Stage 01.
- **Zustand store and any renderer-side state management.** Stage 04.
- **React Flow, dagre, jsdom, Playwright.** Stage 04/05 + Stage 06.
- **Writes to `.ai-arch/`** — explicitly forbidden forever. Enforced by `safety.grep.test.ts`.
- **AST-based markdown parsing (e.g. remark).** Explicitly rejected; string-split on `## ` with fence-tracking is the decided strategy.
- **`MessagePort` zero-copy optimization for terminal data.** Deferred, possibly post-MVP.
- **Writing layouts from the renderer.** `layout.ts` functions are importable and unit-tested but no IPC channel writes them yet; Stage 04 adds renderer persistence.
- **`meta.json` per-project file.** Reserved in the D1 namespace but not written in Stage 02.

## Review Findings

Eight phase reviews ran. Verdicts: all PASSED. Across all reviews: **0 must-fix**, **5 should-fix**. All were test-quality concerns with no production correctness impact.

| Phase | Verdict | Must-fix | Should-fix | Disposition |
|------:|---------|---------:|-----------:|-------------|
| 1 | PASSED | 0 | 0 | — |
| 2 | PASSED | 0 | 1 | "unknown enum pass-through test does not assert zero warnings." Folded into Phase 8 (now asserts `warnings.toHaveLength(0)`). |
| 3 | PASSED | 0 | 0 | — |
| 4 | PASSED | 0 | 0 | — |
| 5 | PASSED | 0 | 2 | (a) `safeHandle` non-Error branch not exercised — folded into Phase 8 with two new tests (string literal, `null`). (b) `makeFakeIpcMain` duplicated across three files — folded into Phase 8 via `helpers/makeFakeIpcMain.ts` extraction. |
| 6 | PASSED | 0 | 0 | — |
| 7 | PASSED | 0 | 0 | — |
| 8 | PASSED | 0 | 2 | (a) Residual `safeHandle.test.ts:117` is misleadingly named — real branch is covered by the new Phase-8 tests above it; residual is a doc-nit. (b) Quarantine filename test uses `.not.toContain(':')` instead of the plan's full regex — catches the regression but is weaker than specified. Both acknowledged, not blocking; neither landed a fix before compact. |

## Final Check Outcome

`/flow:check` was run twice on 2026-04-18. The first run reported a single lint regression in `safeHandle.test.ts:119` (see **Fixes Applied**). After the inline fix, the re-run reported:

**Status: DONE — PASSED.** All four project-level gates green on HEAD:

| Gate | Command | Exit | Outcome |
|------|---------|-----:|---------|
| typecheck | `npm run typecheck` | 0 | PASS — `tsc -b` zero errors |
| lint | `npm run lint` | 0 | PASS — zero errors, zero warnings |
| build | `npm run build` | 0 | PASS — `out/main/index.js` (36.23 kB), `out/preload/index.mjs` (3.51 kB), `out/renderer/index.html` (0.52 kB) + `assets/index-13N0-Pa5.js` (556.12 kB) |
| test | `npm run test` | 0 | PASS — 161 tests across 18 files, 1.07s |

**Brief acceptance criteria (1–8):** all PASS except #5 (`npm run dev` DevTools probes) which is deferred to user-side manual smoke per checker policy. Build + test gates prove the IPC surface is wired.

**Plan acceptance criteria (1–11):** all PASS except #5 (same DevTools deferral).

**Brief `Expected Behavior` / `User-Facing Outcome` checks:** all PASS (`window.atrium.*` namespaces present; `dialog.openFolder` / `project.open` / `project.getRecents` return expected shapes; no crash on missing / empty / unknown-version persisted files).

**Brief `Locked decisions` D1/D2/D3:** all PASS (per-project dir `<slug>-<8-char-hash>` with lowercase-on-win32 + sha256-slice-8; schemaVersion integer with atomic writes, backup, quarantine, warn-once; `fileSync.stopWatching` returns `Promise<Result<void, FileSyncErrorCode>>` with the 5-member enum).

**Brief `Non-goals`:** all PASS (no node-pty / `@parcel/watcher` / jsdom / zustand / react-flow installed; stubs return `NOT_IMPLEMENTED`; renderer UI unchanged; no writes to `.ai-arch/`).

**Regressions: none.** **Scope creep: none.**

**Known deltas (intentional, carried forward from prior check):**
1. `tsconfig.web.json` `include` has two additions (`src/preload/api.ts` + `src/shared/**/*`); second is required by `composite: true`.
2. `vitest.config.ts` has a `resolve: { alias }` block and an `include` pattern extension `*.{test,type-test}.ts`.
3. `paths.ts` value-imports `app` from `electron` (used only inside `getUserDataDir()`). Storage module, not parser; parser remains Electron-free (grep-verified).
4. `src/preload/index.ts` uses `@shared/index` (not bare `@shared`) due to a TS path-alias quirk.

**Phase-result header wording note:** the skill spec mentions `Status: VERIFIED` as a precondition; phases 2–6 and 8 report `COMPLETE`. The checker accepted this because the underlying state is unambiguously green. Flagged for process hygiene only — not a blocker.

## Files Changed

**Created — `src/shared/`**
- `result.ts` — `Result<T,E>` discriminated union + `ok()` / `err()` constructors
- `errors.ts` — six `as const` error-code namespaces (Common, Project, Dialog, FileSync, Terminal, Health), each spreading Common members
- `domain.ts` — `TerminalId` branded string, `NodePriority`/`NodeMaturity`/`ConnectionType` unions with forward-compat widening idiom, `NodeData`, `Connection`, `Session`, `ProjectContext`, `ProjectState` (including `warnings: ParseWarning[]`), `RecentProject`, `HealthInfo`, `ParseWarning`
- `ipc.ts` — `IPC` const object with all 12 channel strings across 5 namespaces
- `index.ts` — barrel
- `__tests__/result.test.ts` — 12 tests (envelope shape, discriminated-union narrowing via `expectTypeOf`)

**Deleted**
- `src/shared/__tests__/smoke.test.ts` — superseded by `result.test.ts`

**Created — `src/main/parser/`** (Electron-free, fs-free)
- `splitHeadings.ts` — `splitByH2` (fence-aware, CRLF-aware) + `firstParagraph`
- `parseIndex.ts` — JSON + hand-rolled structural validator; `UNKNOWN_INDEX_FIELD` warnings
- `parseNodeMarkdown.ts` — never-throws parser; `MALFORMED_NODE_MD` warning on missing sections
- `parseProjectContext.ts` — loose `Record<string, string>` keyed by heading + `description`
- `assembleProjectState.ts` — merges index + idea files + context into `ProjectState`, collects all warnings
- `index.ts` — barrel
- `__tests__/splitHeadings.test.ts`, `parseIndex.test.ts`, `parseNodeMarkdown.test.ts`, `parseProjectContext.test.ts`, `assembleProjectState.test.ts`
- `__tests__/fixtures/` — `index.json`, `canvas-ui.md`, `project-context.md` (verbatim copies), plus hand-crafted `no-headings.md`, `fence-with-h2.md`, `truncated.json`, `crlf.md`, `whitespace-section.md`

**Created — `src/main/storage/`**
- `write-file-atomic.d.ts` — minimal local ambient declaration (package 7.x ships no types)
- `paths.ts` — `getUserDataDir()` lazy wrapper + `__setUserDataDirForTests` seam + derived path helpers including reserved `getMetaPath`
- `projectHash.ts` — `normalizePath` / `slugify` / `hashKeyOnly` / `hashProjectPath` (D1)
- `atomicWrite.ts` — `atomicWriteJson` thin wrapper over `write-file-atomic`
- `appConfig.ts` — `AppConfigV1` (schemaVersion 1), empty `MIGRATIONS` registry (shape ready for Stage 03+), `loadAppConfig` with all 5 D2 branches, `saveAppConfig`, `bumpRecent` (cap 5 FIFO dedup), `getRecents`
- `layout.ts` — `LayoutFileV1` with `projectPath` orphan-detection anchor, `loadLayout` / `saveLayout` with auto-mkdir + quarantine
- `index.ts` — barrel
- `__tests__/projectHash.test.ts`, `appConfig.test.ts`, `layout.test.ts`

**Created — `src/main/project/`**
- `openProject.ts` — orchestrator (stat → parseIndex → read idea files → contextMD → assemble → fire-and-forget bumpRecent)
- `showOpenFolder.ts` — `dialog.showOpenDialog` wrapper; separate overload branches for null-window handling
- `index.ts` — barrel
- `__tests__/openProject.test.ts`, `showOpenFolder.test.ts`

**Created — `src/main/ipc/`**
- `ipcModule.ts` — single-point electron import for `ipcMain`, swappable via `vi.mock`
- `safeHandle.ts` — `safeHandle<T,E>(channel, fn, ipcMainLike?)` with `INTERNAL` fallback and `e instanceof Error ? e.message : String(e)` coercion
- `project.ts` — `project:open` / `project:switch` / `project:getRecents` handlers
- `dialog.ts` — `dialog:openFolder` handler with type-only `BrowserWindow` import
- `fileSync.ts` — `startWatching` / `stopWatching` stubs returning `NOT_IMPLEMENTED`
- `terminal.ts` — `spawn` / `kill` invoke stubs + `write` / `resize` no-op `on` subscribers
- `health.ts` — `checkClaude` stub
- `register.ts` — `registerIpc(getWindow)` with idempotent guard + `__resetRegisteredForTests` for tests
- `index.ts` — barrel
- `__tests__/safeHandle.test.ts`, `stubHandlers.test.ts`, `projectHandlers.test.ts`, `register.test.ts`
- `__tests__/helpers/makeFakeIpcMain.ts` — `makeSimpleFakeIpcMain` + `makeFullFakeIpcMain`, arrow-function properties to avoid `unbound-method` lint

**Created — `src/preload/`**
- `api.ts` — `AtriumAPI` type-only module + `declare global { interface Window { atrium } }` ambient augmentation; uses `import type { ... } from '@shared/index'`
- `__tests__/api.type-test.ts` — 15 `expectTypeOf` assertions covering every method signature
- `__tests__/preload.runtime.test.ts` — listener-identity, id-filter, ArrayBuffer fidelity, send-vs-invoke runtime tests via mocked `ipcRenderer`

**Created — `src/main/__tests__/`**
- `safety.grep.test.ts` — parser-Electron-free + no-writes-to-`.ai-arch/` negative safety assertions

**Created — `src/renderer/src/__tests__/`**
- `window-ambient.type.ts` — compile-time proof the ambient `Window` augmentation reaches the renderer project

**Modified — `src/main/index.ts`** (Phase 7)
- Added imports: `promises as fs`, `registerIpc`, `getProjectsDir`
- Added `registerIpc(() => mainWindow)` inside `gotLock` branch, before `app.whenReady()`
- Added `await fs.mkdir(getProjectsDir(), { recursive: true }).catch(warn)` at the top of `whenReady`
- Security prefs (`contextIsolation`, `nodeIntegration`, `sandbox`) byte-identical to Stage 01

**Modified — `src/preload/index.ts`** (Phase 6)
- Replaced `export {}` placeholder with full bridge — `ipcRenderer.invoke` / `send` / `on` / `removeListener` wrappers; `ipcRenderer` itself not exposed

**Modified — `package.json` + `package-lock.json`** (Phase 3)
- Added `write-file-atomic: 7.0.1` (exact pin) to `dependencies`

**Modified — `STACK_VERSIONS.md`** (Phase 3)
- Added row documenting `write-file-atomic 7.0.1` pin + rationale

**Modified — `tsconfig.web.json`** (Phase 6)
- `include` gained `src/preload/api.ts` + `src/shared/**/*` (latter required by `composite: true`)

**Modified — `vitest.config.ts`** (Phases 2 + 6)
- Added `resolve: { alias }` mirroring the four existing aliases (Phase 2)
- Extended `main` project `include` pattern to `*.{test,type-test}.ts` (Phase 6)

**Modified in Phase 8 (test files only — behavior of existing tests unchanged)**
- `src/main/ipc/__tests__/safeHandle.test.ts` — now imports from `helpers/makeFakeIpcMain`; added two new tests for `String(e)` coercion branch (string literal, `null`)
- `src/main/ipc/__tests__/stubHandlers.test.ts` — imports from helper
- `src/main/ipc/__tests__/projectHandlers.test.ts` — imports from helper
- `src/main/parser/__tests__/splitHeadings.test.ts` — whitespace-only body test
- `src/main/parser/__tests__/parseNodeMarkdown.test.ts` — whitespace-only body fixture test + tightened empty-string warning assertion
- `src/main/storage/__tests__/appConfig.test.ts` — atomic-write concurrency test via `Promise.all`

## Notes

- **Test count trajectory:** 12 (P1) → 46 (P2) → 89 (P3) → 101 (P4) → 127 (P5) → 142 (P6) → 142 (P7, wire-up only) → 161 (P8). 18 test files total.
- **Aggregate line delta across all phases:** roughly ~2,930 lines added (implementation + tests + fixtures + config tweaks + STACK_VERSIONS row + `src/main/index.ts` wire-up). Per-phase: P1 ~145, P2 ~700, P3 ~445, P4 ~275, P5 ~490, P6 ~310, P7 ~12, P8 ~50 test-file increments.
- **Phase 2 should-fix disposition:** the Phase 2 reviewer recommended asserting `warnings.toHaveLength(0)` on the unknown-enum pass-through test. Phase 8's implementer report confirms this is now covered. (Not explicitly cross-referenced in the Phase 8 report but the Phase 8 reviewer's hard-check #8 says "Already in `parseIndex.test.ts` with `warnings.toHaveLength(0)` assertion. Still passing in this run.")
- **Phase 8 should-fixes not landed:** Two test-quality concerns from the Phase 8 review were acknowledged but not fixed before compact: (a) the residual `safeHandle.test.ts:117` test is misleadingly named — the real `String(e)` branch is covered by the two new tests at lines 63–85, but the residual test at line 117 actually throws an `Error` instance with a `message` property so it takes the `e.message` branch not the `String(e)` branch; (b) the quarantine-filename test uses `.not.toContain(':')` instead of the plan's full ISO-8601 regex `^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$`. Neither blocks shipping; pick up in follow-up polish if desired.
- **`serena:activate` skill failed** during the final check re-run ("Unknown skill: serena:activate"). The checker fell back to standard Bash / Read / Grep / Glob tools per the spawn prompt's fallback clause. Gate outcomes did not depend on serena. Flagged to the team lead for harness investigation.
- **Follow-up for Stage 03 continuity (per implementer notes):**
  - Real `fileSync.startWatching` / `stopWatching` (install `@parcel/watcher` native addon, exact-pinned per `STACK_VERSIONS.md`), 300ms debounce, re-parse, `fileSync.onChanged` push via `webContents.send`.
  - Real `terminal.spawn` / `kill` / data + exit push via `node-pty` (native addon, exact-pinned). Stage 02 already registered no-op `on` subscribers for `terminal.write` / `terminal.resize` so the IPC surface doesn't need churn.
  - Real `health.checkClaude` — claude binary detection + version parsing.
  - `project:switch` currently has the same body as `project:open`; Stage 03 will extend it to tear down and re-set up the file watcher.
  - `@shared` vs `@shared/index` alias quirk could be cleaned up by adding `"@shared": ["src/shared/index.ts"]` to all three mirrored tsconfigs. Out of scope for Stage 02; flagged for future alias refactor.
- **Phase-result header wording:** phases 2–6 and 8 self-declared `Status: COMPLETE` instead of `Status: VERIFIED`. The checker accepted both. Worth tightening in the `/flow:implement` skill template so all phases use the same header.
- **Commit guidance carried from the final check:** commit the working-tree changes (Stage 02 implementation + lint fix), mark Stage 02 done in `.ai-arch/todo-list.md`, then start Stage 03 planning with `/flow:new` or resume directly from an existing brief.
