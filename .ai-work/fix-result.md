# Fix Result: Preload path .mjs extension and redundant ESLint glob
_Date: 2026-04-18_

## Status: VERIFIED

## Issue Addressed
From `review-8-report.md`:
- **Must fix** — `src/main/index.ts:22` hardcoded `'../preload/index.js'` but `npm run build` emits `out/preload/index.mjs`. Production mode (`npm start`) would silently fail to load the preload.
- **Suggestion** — `eslint.config.js:27` listed `'eslint.config.js'` explicitly alongside `'*.config.{js,ts}'`; the wildcard already matches it.

## What Was Changed
- `src/main/index.ts:22` — `../preload/index.js` → `../preload/index.mjs`
- `eslint.config.js:27` — removed redundant `'eslint.config.js'` from `files` array

## Verification
- `npx tsc --noEmit` — OK
- `npx eslint src/ --max-warnings=0` — OK
