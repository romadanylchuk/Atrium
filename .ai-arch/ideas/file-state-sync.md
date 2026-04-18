# Idea: File-State Sync
_Created: 2026-04-15_
_Slug: file-state-sync_

## Description
One-directional real-time sync from `.ai-arch/` files to canvas. @parcel/watcher (native cross-platform) detects file changes, 300ms debounce handles burst writes, then full re-read and re-parse of the entire `.ai-arch/` folder via data-layer. Pushes `ProjectState` to renderer through `fileSync.onChanged` IPC. Atrium never writes to `.ai-arch/` — no conflict resolution needed.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Watcher library: @parcel/watcher** — native OS APIs per platform:
   - Windows: `ReadDirectoryChangesW`
   - Mac: `FSEvents`
   - Linux: `inotify`
   
   Runs in main process. Watches the `.ai-arch/` directory recursively.

2. **Debounce: 300ms** — fixed value, not a range. Claude writes multiple files in quick succession (node MD + index.json in one skill invocation). 300ms is the upper end of the originally considered 200-300ms range — better to skip an extra re-parse than to show intermediate state while Claude is still writing files. Tunable if practice shows Claude makes pauses longer than 300ms between files.

3. **Re-parse strategy: full re-read of entire `.ai-arch/` folder** on each debounced event. No incremental parsing — read all files, parse all, produce a complete `ProjectState`. Simple and safe given node count is small (<50 files). data-layer provides the parsing logic (string splitting for MD, JSON.parse for index).

4. **Data direction: one-directional read-only.** Atrium never writes to `.ai-arch/`. All mutations happen through Claude Code in terminal sessions. No write API, no conflict resolution, no locking.

5. **Watcher lifecycle tied to project:**
   - Start watching on `project.open` or `project.switch` (after IPC returns `ProjectState`)
   - Stop watching on `project.switch` (old project) or app quit
   - `fileSync.startWatching(dir)` and `fileSync.stopWatching()` via IPC (decided in electron-ipc)
   - `project.switch` handles stop-old + start-new atomically

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| `chokidar` | Pure JS, slower than native; @parcel/watcher uses OS-level APIs for lower latency and less CPU |
| `fs.watch` (Node built-in) | Inconsistent cross-platform behavior; no recursive watching on all platforms; known reliability issues |
| Incremental parsing (diff which files changed) | Extra complexity for negligible gain — full re-read of <50 small files is <10ms |
| Shorter debounce (100-150ms) | Risk showing intermediate state (index.json updated but MD file not yet written) |
| Longer debounce (500ms+) | Noticeable lag — user sees Claude writing in terminal but canvas doesn't update for half a second |
| Bidirectional sync (app writes back to .ai-arch/) | Massive complexity (conflict resolution, write ordering, locking) for zero benefit — app has no reason to write |
| Polling instead of watching | Higher CPU, higher latency, no advantage over native watchers |

### Rationale
@parcel/watcher is the most reliable cross-platform native file watcher available in the Node ecosystem. The one-directional read-only constraint (decided in data-layer) makes the entire sync problem trivial: watch → debounce → re-read → push. No conflict resolution, no write ordering, no locking. Full re-parse on every event is viable because the data set is small and parsing is fast (string splitting, not AST). The 300ms debounce balances responsiveness with consistency — Claude typically writes index.json and node MD within the same skill invocation, and 300ms is enough for the burst to settle.

### Implications
- **electron-ipc** — `fileSync.onChanged` pushes complete `ProjectState` via `webContents.send`; `startWatching`/`stopWatching` are `invoke` calls
- **state-management** — receives `ProjectState` from `onChanged`, stores it via `setProject`; diff hook reconciles with React Flow
- **data-layer** — provides the parsing functions called on each debounced event; must be fast (it is — string splitting)
- **testing-strategy** — integration test: start watcher on temp dir, write files, verify debounce (burst → single parse), verify `ProjectState` output

## Priority
core

## Maturity
decided

## Notes
- Layout positions stored separately in Electron userData (decided in data-layer), not watched
- Live updates behind terminal modal — canvas reflects changes as Claude works in the terminal
- Simpler than originally feared — no bidirectional sync needed, no conflict resolution

## Connections
- electron-ipc: onChanged pushes ProjectState via send; startWatching/stopWatching via invoke
- state-management: pushes re-parsed ProjectState into store via setProject
- data-layer: calls data-layer parsing functions on each debounced event
- cli-engine: file-state-sync is the only way the app knows what happened in a terminal session
- canvas-ui: drives live updates to the visual graph (indirect — via state-management → diff hook)
- cross-platform-shell: depends on Electron's Node.js for @parcel/watcher

## History
- 2026-04-15 /architector:init — real-time sync between .ai-arch/ files and canvas; identified as major engineering challenge alongside canvas UI
- 2026-04-16 /architector:explore (cross-platform-shell) — elevated to primary feedback mechanism; terminals are opaque so file watching is the only state channel
- 2026-04-16 /architector:explore — @parcel/watcher for native cross-platform watching; debounce 200-300ms; re-read entire folder on change; one-directional read-only, no conflict resolution needed
- 2026-04-16 /architector:decide — locked in @parcel/watcher + 300ms debounce (pinned from 200-300 range, prefer consistency over speed); full re-read not incremental; watcher lifecycle tied to project open/switch; one-directional confirmed
