# Review Report: Phase 5
_Date: 2026-04-18_

## Status: HAS_ISSUES

## Must Fix
_None_

## Should Fix

- **src/renderer/index.html + src/renderer/src/App.tsx** — `body` default margin not reset  
  The flex container in `App.tsx` sets `height: '100vh'` but the browser's default `body { margin: 8px }` leaves a thin gap around it. The BrowserWindow `backgroundColor: '#1e1e1e'` masks this visually today (the gap inherits the window background), but this is an implicit coupling: if either colour changes independently the gap will show. It also means the dark fill doesn't technically extend to the viewport edges.  
  → Add a minimal `<style>` reset in `src/renderer/index.html`: `body { margin: 0; padding: 0; overflow: hidden; }`. This is a one-liner global reset, not a styling library, so it stays within the "inline styles only" spirit of Stage 01.

## Suggestions

- **src/renderer/index.html:7** — CSP `'unsafe-inline'` on `script-src` carried into production  
  `'unsafe-inline'` is required in dev for Vite's HMR injections, but the same HTML file is served in production (`win.loadFile`). In production there are no inline scripts, so the directive is permissive beyond what is needed.  
  → Acceptable to leave as-is for Stage 01 (tightening CSP per environment is a Stage 06 hardening concern), but note it in a TODO comment so it isn't forgotten: `<!-- TODO Stage 06: tighten script-src for production build (remove 'unsafe-inline') -->`.

- **src/main/index.ts:39** — `mainWindow` assignment after `loadURL`/`loadFile`  
  `mainWindow = win` is assigned on line 39, after the load calls on lines 33–37. In practice this is fine (the `second-instance` handler can't fire before the OS registers the lock, which is before this point), but reading top-to-bottom it looks like `mainWindow` might not be set when the load resolves.  
  → Move `mainWindow = win` to immediately after the `BrowserWindow` constructor (before any event registration or load calls) for clearer read-order intent.

- **src/renderer/index.html** — missing `<meta name="viewport">`  
  Not strictly needed for a fixed-size desktop window, but omitting it means the renderer uses the browser's default viewport assumptions, which can cause minor zoom/scaling edge cases on high-DPI displays.  
  → Add `<meta name="viewport" content="width=device-width, initial-scale=1" />` to `<head>`.

## Summary
The implementation is correct and follows good Electron patterns. The one item worth fixing before Phase 8's visual proof-of-life check is the missing `body` margin reset — without it the `height: 100vh` dark fill technically floats 8px from the window edges, which currently happens to be invisible only because the BrowserWindow background colour matches. The remaining items are low-risk suggestions for clarity and future-proofing.
