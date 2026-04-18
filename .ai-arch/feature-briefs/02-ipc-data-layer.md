# Feature Brief: IPC & Data Layer
_Stage: 02_
_Created: 2026-04-16 via /architector:finalize_
_Arch nodes covered: electron-ipc, data-layer_

## Goal
Implement the main process ↔ renderer communication contract and the `.ai-arch/` file parser. After this stage, the app can open a folder, parse `.ai-arch/` files into a typed `ProjectState`, and transport it to the renderer via IPC. This is the data backbone that every feature depends on.

## Context
- Two IPC transport patterns decided: `ipcMain.handle`/`invoke` for request-response, `ipcMain.on`/`webContents.send` for streaming/push
- 5 namespaced channels: `terminal`, `fileSync`, `project`, `dialog`, `health`
- Main process owns all `.ai-arch/` parsing — renderer is pure display
- `ProjectState` is the single data shape transported to the renderer
- Parsing uses string splitting on `## ` headings (not AST) — precondition: Claude-controlled format

## What Needs to Be Built

**Electron IPC:**
- Preload script with namespaced API: `window.atrium.terminal.*`, `window.atrium.fileSync.*`, `window.atrium.project.*`, `window.atrium.dialog.*`, `window.atrium.health.*`
- TypeScript types: `Result<T, E>`, `ProjectState`, `NodeData`, `Connection`, `Session`, `ProjectContext`, domain error codes (`TerminalErrorCode`, `ProjectErrorCode`, `HealthErrorCode`)
- `invoke` handlers for: `project.open`, `project.switch`, `project.getRecents`, `dialog.openFolder`, `fileSync.startWatching`, `fileSync.stopWatching`, `health.checkClaude`, `terminal.spawn`, `terminal.kill`
- `send` channels for: `terminal.onData`, `terminal.onExit`, `fileSync.onChanged`
- Fire-and-forget: `terminal.write`, `terminal.resize`
- Unsubscribe pattern for all `on*` listeners

**Data Layer:**
- `index.json` parser: `JSON.parse` + typed extraction of nodes, connections, sessions
- `ideas/*.md` parser: string splitting on `## ` headings, section extraction by name
- `project-context.md` parser: same string splitting approach
- `ProjectState` assembly: combine parsed index + MD files + context into single typed object
- `NodeData.markdownContent` — raw MD body included for hover preview
- Layout storage: read/write `layout.json` from Electron userData (`projects/<project-hash>/`)
- App config: recent projects list in Electron userData, max 5 items
- `project.open(path)` implementation: check for `.ai-arch/`, parse, return `ProjectState`
- `project.getRecents()` implementation: read from app config, return list

**Unit tests (per testing-strategy):**
- MD parser: heading splitting, `## ` in code blocks, malformed files, partial writes
- index.json parser: valid JSON, missing fields, corrupted mid-write
- IPC integration tests: mock handlers, verify `Result<T, E>` messages, verify Unsubscribe cleanup

## Dependencies
- Requires: Stage 01 (Electron project skeleton, preload script structure)
- Enables: Stage 03 (terminal channels used by cli-engine), Stage 04 (ProjectState consumed by store)

## Key Decisions Already Made
- **Two-pattern IPC** — invoke for request-response, send for streaming/push. Rule: if caller needs a result, use invoke.
- **Main owns parsing** — renderer never touches `.ai-arch/` files. Security boundary: `contextIsolation: true`.
- **String splitting for MD** — no AST parser. Precondition: Claude-controlled format. Accepted risk for manual edits.
- **Result<T, E>** — `{ ok: true, data: T } | { ok: false, error: { code: E, message: string } }`. No thrown strings cross IPC.
- **Recent projects: max 5** — managed in main process, renderer doesn't manage list logic.

## Open Technical Questions
- `<project-hash>` algorithm for layout.json path — simple hash of absolute path, or slug-based?
- Graceful fallback when app config format changes between releases (don't crash on outdated config)
- Whether `fileSync.stopWatching()` needs to return a Result or can be fire-and-forget

## Out of Scope for This Stage
- Terminal spawn/kill implementation (Stage 03 — channels are defined here but handlers are stubs)
- File watcher implementation (Stage 03 — `startWatching` channel defined but watcher not implemented)
- Health check implementation (Stage 03 — channel defined, handler is stub)
- Renderer UI (Stage 04-05)

## Notes for /interview
/deep-plan directly — the IPC contract and parsing approach are fully specified. The open questions are minor implementation details resolvable during development.
