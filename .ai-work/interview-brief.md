# Feature Brief: Project Scaffolding (Stage 01)
_Created: 2026-04-17_
_Source: `.ai-arch/feature-briefs/01-project-scaffolding.md` + /interview_

## Goal
Create the Atrium Electron project from scratch: a working skeleton built on Electron + TypeScript + React + electron-vite + Vitest + ESLint 9 (flat) + Prettier, with the typical main/preload/renderer/shared split, strict TypeScript, per-target configs, path aliases, a single initial git commit, and a launchable window that visually proves React mounted and HMR works. Nothing else — all domain functionality (IPC channels, `.ai-arch/` parser, terminal pipeline, canvas, packaging) is explicitly deferred to later stages. This scaffold is the substrate every subsequent stage builds on.

## Context
- **Integration toolchain:** `electron-vite` (chosen over `vite-plugin-electron` and manual setup). Handles main/preload/renderer bundling, dev server, and HMR out of the box.
- **Package manager:** npm. `package-lock.json` is committed.
- **Directory layout:** `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/` (empty dir created now — Stage 02 will populate it with shared IPC types).
- **Git:** The project root `D:\home\Atrium\` currently contains `CLAUDE.md`, `.ai-arch/`, `.claude/`. The `/architector` workflow output is already here; this stage must **not** disturb those files. Detect whether `.git` exists and `git init` if missing; write `.gitignore` **before** running `npm install` so `node_modules/` never gets tracked.
- **No IPC wiring yet:** The preload is a skeleton stub. `contextBridge` surface comes in Stage 02.
- **Terminal-as-modal pattern (Stage 03+):** Not implemented here but must not be blocked by scaffold decisions. `contextIsolation: true`, `nodeIntegration: false`, and a working preload path are wired up now so Stage 02 has somewhere to plug into.

## Expected Behavior

### Stack & version pinning
- **Electron:** exact-pin `41.x.y` (latest stable at implementation time; not 42 even if beta). Check `npm view electron version` at implementation.
- **Node:** exact-pin latest `24.x.y` LTS. Pin via `engines.node` in `package.json` and `.nvmrc`. Check `nvm ls-remote --lts` at implementation.
- **React + react-dom:** `^19.2.x` (same version for both). Caret range acceptable given React minor stability.
- **TypeScript:** `^5.9.x`. **Do NOT** adopt 6.0 — it is a bridge release to the Go-native 7.0 rewrite with no 6.1 planned. Revisit when 7.0 ships stable.
- **electron-vite, vite, electron-builder (when added later), @electron-toolkit/tsconfig, xterm (when added later):** caret ranges, latest stable at implementation time.
- **Native-addon deps (node-pty, @parcel/watcher) — not installed at Stage 01 but when added in later stages: exact-pin.**
- **Record chosen versions in `STACK_VERSIONS.md`** at the repo root so future stages have a durable reference.

### package.json
- `name`: `"atrium"`
- `version`: `"0.1.0"`
- `private`: `true`
- `description`: `"Desktop client for AI-assisted project architecture"`
- `author`: `"Roma"`
- `license`: `"UNLICENSED"`
- `type`: `"module"` (ESM; Electron 41 supports ESM)
- `main`: `"out/main/index.js"` (electron-vite default output)
- `engines.node`: pinned to the chosen Node 24.x version
- **Do NOT include:** `homepage`, `repository`, `keywords`, `files`, `bin`, or `build` (electron-builder) — all deferred to Stage 06.

### Scripts (all must exist at end of Stage 01)
- `dev` → `electron-vite dev` (launches Electron with Vite HMR for renderer)
- `build` → `electron-vite build` (produces `out/`)
- `start` → run the built app (`electron .` or electron-vite equivalent)
- `test` → `vitest run` (one-shot, CI-friendly default)
- `test:watch` → `vitest`
- `test:ui` → `vitest --ui` (slot reserved; `@vitest/ui` installed later when needed)
- `test:coverage` → `vitest run --coverage` (slot reserved; `@vitest/coverage-v8` installed later when needed)
- `lint` → ESLint over `src/`
- `lint:fix` → ESLint with `--fix`
- `format` → Prettier write
- `format:check` → Prettier check
- `typecheck` → `tsc -b` (project references, no emit)

### TypeScript config (per-target, composite)
- **Root `tsconfig.json`:** project references only, no `files`/`include`.
- **`tsconfig.node.json`:** covers `src/main/**` + `src/preload/**`. Extends `@electron-toolkit/tsconfig/tsconfig.node.json`.
- **`tsconfig.web.json`:** covers `src/renderer/**`. Extends `@electron-toolkit/tsconfig/tsconfig.web.json`.
- **All three:** `composite: true`.
- **Strictness flags:** `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `forceConsistentCasingInFileNames: true`, `skipLibCheck: true`.
- **Do NOT enable** `exactOptionalPropertyTypes`. Let ESLint handle unused-vars detection (do not rely on `noUnusedLocals`/`noUnusedParameters`).

### Path aliases
Configured in tsconfigs **and** `electron.vite.config.ts` (both places — must stay in sync):
- `@main/*` → `src/main/*`
- `@preload/*` → `src/preload/*`
- `@renderer/*` → `src/renderer/src/*`
- `@shared/*` → `src/shared/*`

Create empty `src/shared/` directory at Stage 01 (no files yet beyond the smoke test dir).

### ESLint (flat config, ESLint 9+)
- File: `eslint.config.js`.
- Use `typescript-eslint` with `recommendedTypeChecked`.
- **Separate configs per build target** via flat config's `files` globs: one block for `src/main/**` + `src/preload/**` (Node globals), one for `src/renderer/**` (browser globals).
- `eslint-config-prettier` as the **last entry** to disable conflicting formatting rules.
- Do **not** use `eslint-plugin-prettier` (Prettier runs separately).

### Prettier
- `.prettierrc` minimal:
  - `semi: true`
  - `singleQuote: true`
  - `trailingComma: "all"`
  - `printWidth: 100`
- Scripts `format` / `format:check` invoke Prettier directly.

### Vitest
- `vitest.config.ts` with `projects`:
  - **main project:** tests in `src/main/**` + `src/shared/**`, environment `node`.
  - **renderer project:** tests in `src/renderer/**`, environment `jsdom`. (Slot defined now; jsdom NOT installed at Stage 01 — install when the first renderer test is added.)
- **Smoke test:** `src/shared/__tests__/smoke.test.ts` — one trivial passing test so `npm test` exits 0 and the harness is verifiably wired end-to-end.

### Main process (`src/main/index.ts`)
- ESM style. Use `import.meta.dirname` (not `__dirname`).
- Factor window creation into `createMainWindow()` function.
- **BrowserWindow options:**
  - `width: 1400`, `height: 900`
  - `minWidth: 1024`, `minHeight: 640`
  - `title: "Atrium"`
  - `backgroundColor: '#1e1e1e'`
  - `show: false` with a `ready-to-show` handler that calls `window.show()`
  - `autoHideMenuBar: true`
  - `webPreferences`:
    - `contextIsolation: true`
    - `nodeIntegration: false`
    - `sandbox: false`
    - `preload`: path to the compiled preload entry
- **DevTools:** auto-open detached when `!app.isPackaged`.
- **App lifecycle handlers (all required):**
  - `app.requestSingleInstanceLock()` — if another instance exists, quit immediately.
  - `second-instance` handler — focus/restore the existing main window (if minimized, restore; then focus).
  - `window-all-closed` → `app.quit()` **except** on `darwin` (macOS).
  - `activate` (macOS) → re-create the main window if none are open.
- **Menu:** accept the default Electron menu at Stage 01. Do **not** call `Menu.setApplicationMenu(null)` and do **not** build a custom menu.

### Preload (`src/preload/index.ts`)
- Empty stub — just enough for Electron to load it without error. The `contextBridge` API surface is Stage 02's job.

### Renderer (`src/renderer/src/`)
- React 19.2 entry with `React.StrictMode`.
- `<App />` component renders:
  - `<h1>Atrium</h1>`
  - A subtitle: `"Stage 01 · scaffold verified"`
  - Dark theme matching the `#1e1e1e` window background (centered, readable).
- **Inline styles only.** No global CSS file, no CSS module, no styling library at this stage.
- Goal: visually verify React mounts, Vite serves, and HMR propagates before Stage 02 starts adding real UI.

### Git
- Detect whether `D:\home\Atrium\.git` exists. If not, run `git init` first.
- **Create `.gitignore` BEFORE `npm install`** so `node_modules/` is never staged. Entries:
  - `node_modules/`
  - `dist/`
  - `out/`
  - `.vite/`
  - `*.log`
  - `.DS_Store`
  - `.env`
- Commit the scaffold as a **single commit**:
  - Message: `chore: initial Electron + Vite + TypeScript scaffold`
- **Do not** configure git remotes. **Do not** push anywhere.

## Edge Cases
- **Existing files in repo root:** `CLAUDE.md`, `.ai-arch/`, `.claude/` already exist. Scaffold must not modify them. The initial commit includes both the scaffold additions AND these pre-existing files (they are currently untracked if `git init` is fresh).
- **`.git` already exists:** Skip `git init`. Verify no conflicting staged state before committing; if the working tree is dirty in a way that prevents a clean scaffold commit, stop and surface to the user rather than force-adding.
- **`package-lock.json` conflict / lock drift:** After `npm install`, commit the lockfile as-is; do not regenerate or prune.
- **Node version mismatch at implementation time:** If the developer's local Node does not match the chosen 24.x LTS, surface the mismatch (engines warning is fine) rather than silently proceeding with a wrong version.
- **Path alias drift:** Aliases live in both tsconfigs and `electron.vite.config.ts`. Any change must update both — note this explicitly in a comment at each site or in `STACK_VERSIONS.md`.
- **Windows path separators:** Dev is on Windows (`D:\home\Atrium`). Use forward slashes and Node path APIs in config files; never hardcode `\`.
- **Electron ESM + `sandbox: false`:** Preload runs as CJS by default even with `"type": "module"` unless explicitly switched; electron-vite handles this, but verify the preload actually loads (check DevTools console for preload errors) as part of the "proof of life" check.
- **Smoke test only — no renderer tests yet:** Because jsdom is not installed, the renderer project in `vitest.config.ts` is defined but empty. `npm test` must still pass (Vitest handles empty projects gracefully). If it doesn't, either guard the renderer project behind file-exists or remove it until Stage 02.
- **DevTools detached mode on small displays:** Acceptable; user can reposition. Not a blocker.

## Out of Scope (explicit)
- **All IPC channels** (`invoke` / `send` patterns, `contextBridge` API surface) — Stage 02.
- **`.ai-arch/` parser / ProjectState types / data layer** — Stage 02.
- **`node-pty`, `@parcel/watcher`, `xterm.js`** — Stage 02/03. Not even installed.
- **React Flow, dagre, Zustand, canvas UI** — Stage 04.
- **Terminal modal UI, node tooltips, toolbar, project launcher** — Stage 05.
- **`electron-builder` config, NSIS/DMG/AppImage packaging, CI matrix, code signing** — Stage 06.
- **husky + lint-staged pre-commit hooks** — deferred. Revisit when a second developer joins, CI is set up, or broken-lint commits become recurring friction. Scripts (`lint`, `format:check`) must exist so adding hooks later is trivial.
- **`@vitest/ui`, `@vitest/coverage-v8`, `jsdom`** — NOT installed at Stage 01. Script slots reserved.
- **Global CSS, design tokens, CSS modules, Tailwind, styled-components, any styling library** — inline styles only at Stage 01.
- **Custom application menu** — default Electron menu is fine.
- **Playwright / E2E tests** — Stage 06 per architecture.
- **Git remotes, pushes, PRs, CI workflows** — none of this at Stage 01.
- **Windows installer, macOS entitlements, Linux AppImage** — Stage 06.

## Open Questions
_None blocking. All clarifications resolved during interview:_
- Vite-Electron integration: **electron-vite** (not `vite-plugin-electron`, not manual).
- Exact Electron / Node versions: pinned to latest 41.x / 24.x LTS at implementation time; record in `STACK_VERSIONS.md`.
- HMR integration: handled by electron-vite; no manual wiring needed.
