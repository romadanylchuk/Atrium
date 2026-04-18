# Project Scaffolding (Stage 01)

_Completed: 2026-04-18_

## Goal

Bootstrap the Atrium Electron desktop app from zero into a running skeleton — `electron-vite` + TypeScript + React 19 + Vitest + ESLint 9 (flat) + Prettier with `src/{main,preload,renderer,shared}` layout, strict composite TS configs, mirrored path aliases, a smoke test, and a launchable window that visually proves React+HMR work. No domain functionality; this is the substrate every subsequent stage plugs into.

## Implementation Summary

Delivered in 9 sequential phases, each independently verified:

1. **Repo baseline** — `git init`, `.gitignore` (before any install), `.nvmrc` (`24.15.0`), `STACK_VERSIONS.md` with pin rationale.
2. **`package.json` + install** — exact-pin Electron `41.2.1`, caret-range React/Vite/Vitest/ESLint/Prettier/TS, all 12 required scripts, `type: "module"`, `engines.node >=24.15.0 <25`. `npm install` generated `package-lock.json`; 273 packages installed.
3. **TypeScript configs** — root references config + `tsconfig.node.json` (main/preload/shared) + `tsconfig.web.json` (renderer with `jsx: "react-jsx"`), both composite, all 6 strict flags, identical path alias blocks, mirror-warning header comments.
4. **electron-vite config** — `electron.vite.config.ts` with `@vitejs/plugin-react` for renderer, four path aliases mirrored from tsconfigs via `resolve(import.meta.dirname, ...)`.
5. **Source files** — `src/main/index.ts` (`createMainWindow()`, exact BrowserWindow options, full lifecycle handlers, single-instance lock, `import.meta.dirname` throughout); `src/preload/index.ts` empty stub; `src/renderer/index.html` with CSP + body reset; React 19 `StrictMode` entry; `App.tsx` with inline-styled centered dark UI.
6. **ESLint 9 flat + Prettier** — `projectService: true`, per-target globals (node/browser), `disableTypeChecked` for config files, `prettierConfig` last. Auto-format pass normalized pre-existing files.
7. **Vitest** — `projects` config with `main` (node) + `renderer` (jsdom slot); smoke test at `src/shared/__tests__/smoke.test.ts` exits 0.
8. **Proof-of-life** — `typecheck`, `lint`, `format:check`, `test`, `build` all exit 0; `npm run dev` opened an Electron window with the expected UI; HMR propagated within ~1s; single-instance lock verified.
9. **Initial commit** — 67 files staged explicitly (scaffold + pre-existing `.ai-arch/`, `.claude/`, `.ai-work/`, `CLAUDE.md`). Commit `63c53eb chore: initial Electron + Vite + TypeScript scaffold`. No remote configured.

## Key Decisions

- **Preload output extension** — plan said `../preload/index.js`; electron-vite actually emits `.mjs`. Caught in Phase 8 review, fixed in `fix-result.md`: main process loads `../preload/index.mjs`. Production `npm start` now succeeds.
- **Body CSS reset in `index.html`** — a 4-line `<style>` block (`body { margin: 0; padding: 0; overflow: hidden; }`) was added after Phase 5 review noted the default 8px body margin floated the dark fill away from the window edges. Accepted as "within the spirit" of inline-styles-only because it's not a CSS file/module/library.
- **`projectService: true` over legacy `project: [...]`** (D7) — auto-discovers tsconfig per file; avoids "file not in project" errors on `eslint.config.js` itself.
- **`import.meta.dirname` throughout** — no `__dirname`, no `createRequire` dance. Requires Node 24 ESM, which is pinned.
- **`sandbox: false` on the preload** — carried from brief; Stage 02 needs Node module resolution in the preload bundle.
- **`src/shared/` tracked via smoke test** — no `.gitkeep` needed.
- **Node version mismatch non-blocking** — local dev machine ran Node `v22.21.1` throughout implementation; `engines` warning surfaced but install proceeded per brief's edge case guidance.

## Files Changed

**Created (root configs):**

- `.gitignore`, `.nvmrc`, `.prettierrc`, `.prettierignore`
- `STACK_VERSIONS.md`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- `electron.vite.config.ts`
- `eslint.config.js`
- `vitest.config.ts`

**Created (source):**

- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/index.html`
- `src/renderer/src/main.tsx`
- `src/renderer/src/App.tsx`
- `src/shared/__tests__/smoke.test.ts`

**Untouched (pre-existing, included in initial commit):**

- `CLAUDE.md`, `.ai-arch/`, `.claude/`, `.ai-work/`

## Gaps/Notes

- No `feature-docs.md` from `/document-work-result` — documentation step was not run for this stage; mental-model / decision-log / dependency-map files are therefore not archived. Decision context lives in `feature-plan.md` §Decision Log (D1–D7) and in this summary's Key Decisions.
- Local Node at implementation time did not satisfy `engines.node`. Not blocking per brief; should be corrected before Stage 02 begins so `npm install` runs under the pinned runtime.
- Renderer Vitest project exists as a slot only (no `jsdom` installed). First renderer test in Stage 02 must install `jsdom` and verify the project actually runs rather than silently skipping.
- `script-src 'unsafe-inline'` in `index.html` CSP is carried into production HTML. Acceptable for Stage 01; flagged for Stage 06 hardening.
