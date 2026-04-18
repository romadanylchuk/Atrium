# Review Report: Phase 8 (Scaffold — Phases 1–7 source files)
_Date: 2026-04-18_

## Status: HAS_ISSUES

> Phase 8 produced no code. This review covers all scaffold source files created in Phases 1–7:
> `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx`,
> `src/shared/__tests__/smoke.test.ts`, `eslint.config.js`, `vitest.config.ts`, `electron.vite.config.ts`.

---

## Must Fix

- **`src/main/index.ts:22`** — Preload path hardcoded as `'../preload/index.js'`, but `npm run build` produces `out/preload/index.mjs`. Running `npm start` (production mode) will silently fail to load the preload because `out/preload/index.js` does not exist.
  → Change the path to `'../preload/index.mjs'`:
  ```ts
  preload: path.join(import.meta.dirname, '../preload/index.mjs'),
  ```
  Phase 8 dev verification passed because electron-vite dev mode rebuilds files in-process; the production binary path was never actually exercised with `npm start`.

---

## Should Fix

_(none)_

---

## Suggestions

- **`eslint.config.js:27`** — `'eslint.config.js'` is listed explicitly in the `files` glob alongside `'*.config.{js,ts}'`. The wildcard already matches it; the explicit entry is redundant.
  → Remove `'eslint.config.js'` from the array, leaving just `['*.config.{js,ts}']`.

---

## Summary

The scaffold is clean and well-structured overall — configs are tight, the Electron lifecycle is correct, aliases are consistently mirrored with drift-warning comments, and linting/formatting rules are in good shape. One production-only bug slipped through because Phase 8 verification tested only `npm run dev` (where electron-vite rebuilds the preload internally) and not `npm start` against the built output. The `.mjs` extension mismatch in the preload path must be fixed before Phase 9 commits the scaffold.
