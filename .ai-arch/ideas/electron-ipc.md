# Idea: Electron IPC
_Created: 2026-04-16_
_Slug: electron-ipc_

## Description
Main process ↔ renderer communication contract for Atrium. Preload script exposes a namespaced, typed API via `contextBridge` mirroring internal modules (`terminal`, `fileSync`, `project`, `dialog`, `health`). Two transport patterns: `ipcMain.handle`/`invoke` for request-response calls returning `Result<T, E>`, and `ipcMain.on`/`webContents.send` for streaming and fire-and-forget. `ArrayBuffer` transfer for terminal binary data. All `on*` push listeners return an unsubscribe function. Main process owns all `.ai-arch/` parsing; renderer is a pure display layer.

## Priority
blocking

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Two transport patterns, split by call semantics:**

   **`ipcMain.handle` / `invoke`** — request-response, caller awaits `Result<T, E>`:
   | Channel | Call |
   |---------|------|
   | `terminal` | `spawn(args, cwd)`, `kill(id)` |
   | `project` | `open(path)`, `switch(path)`, `getRecents()` |
   | `fileSync` | `startWatching(dir)`, `stopWatching()` |
   | `dialog` | `openFolder()` |
   | `health` | `checkClaude()` |

   **`ipcMain.on` / `webContents.send`** — fire-and-forget or push events:
   | Direction | Channel | Call |
   |-----------|---------|------|
   | Renderer → Main | `terminal` | `write(id, data: ArrayBuffer)`, `resize(id, cols, rows)` |
   | Main → Renderer | `terminal` | `onData(id, cb)`, `onExit(id, cb)` |
   | Main → Renderer | `fileSync` | `onChanged(cb: ProjectState→void)` |

   **Rule:** if the caller needs a result, use `invoke`; if it's streaming or fire-and-forget, use `send`.

2. **Typed `Result<T, E>` for all invoke calls:**
   ```typescript
   type Result<T, E = string> =
     | { ok: true; data: T }
     | { ok: false; error: { code: E; message: string } }
   ```
   Domain-specific error codes per namespace: `TerminalErrorCode`, `ProjectErrorCode`, `HealthErrorCode`. Machine-readable `code` + human-readable `message`. No thrown strings cross the IPC bridge.

3. **Main process owns all parsing — renderer is pure display:**
   - `ProjectState` is the complete parsed model pushed to renderer:
     ```typescript
     type ProjectState = {
       context: ProjectContext       // from project-context.md
       nodes: NodeData[]             // from index.json + ideas/*.md
       connections: Connection[]     // from index.json
       sessions: Session[]           // from index.json
     }
     ```
   - `NodeData` includes `markdownContent?: string` — raw MD body for hover preview, avoids second round-trip
   - `fileSync.onChanged` and `project.open` both return `ProjectState` — single shape, no fragmentation

4. **Namespaced preload API via `contextBridge`:**
   - `window.atrium.terminal.*`, `window.atrium.fileSync.*`, `window.atrium.project.*`, `window.atrium.dialog.*`, `window.atrium.health.*`
   - `contextIsolation: true`, `nodeIntegration: false` — Electron security best practices
   - Preload is the only bridge — renderer never accesses Node APIs directly

5. **`ArrayBuffer` transfer (not structured clone) for terminal data** — zero-copy for the hot path (`terminal.onData`, `terminal.write`).

6. **`Unsubscribe` pattern for all push listeners:**
   - Every `on*` method returns `() => void`
   - React components call unsubscribe in `useEffect` cleanup — no leaked listeners

7. **`TerminalId` on all terminal operations:**
   - Future-proof for multiple terminals without IPC contract changes
   - One-at-a-time rule enforced at app level (state-management / cli-engine), not in IPC contract

8. **`MessagePort` deferred** — possible optimization for terminal hot path, not MVP. Can be introduced later as a transparent transport swap without API changes.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| `ipcMain.on`/`send` for everything | Loses the ergonomic `await invoke()` pattern for request-response calls; requires manual request ID correlation |
| `ipcMain.handle`/`invoke` for everything | Doesn't fit push events (`onData`, `onChanged`) — invoke is renderer-initiated, but these are main-initiated |
| Thrown exceptions across IPC | Untyped, no machine-readable error codes, inconsistent error shapes between channels |
| Renderer does its own file parsing | Duplicates logic, requires `nodeIntegration` or raw file access through IPC, violates security boundary |
| `MessagePort` for terminal data from day one | Premature optimization; standard `send` with ArrayBuffer transfer is fast enough for a single terminal |
| Single flat namespace (no `window.atrium.*` nesting) | Channel name collisions as surface grows; namespacing mirrors internal modules for discoverability |

### Rationale
The two-pattern split follows naturally from the call semantics: request-response calls need awaitable results with typed errors, while streaming/push events need fire-and-forget sends with listener registration. Mixing these into a single pattern would force either awkward workarounds (manual correlation IDs for invoke-based push) or loss of type safety (thrown errors instead of Result types). The clean split means each channel's implementation is obvious from its signature.

Main-owns-parsing keeps the renderer as a pure display layer — the security boundary is clean, the data shape is consistent, and there's exactly one place where `.ai-arch/` files are read and interpreted.

### Implications
- **cli-engine** — `terminal.spawn` uses `invoke` (returns `Result<TerminalId>`); `terminal.onData`/`onExit` use `send` (push from main)
- **file-state-sync** — `startWatching` uses `invoke`; `onChanged` uses `send` with full `ProjectState`
- **state-management** — receives `ProjectState` from both `project.open` (invoke response) and `fileSync.onChanged` (push); same shape, same store action
- **data-layer** — all parsing stays in main process; `ProjectState` type is the contract between data-layer and the rest of the app
- **testing-strategy** — integration tests verify both patterns: invoke calls return correct `Result`, push events deliver correct payloads; `Unsubscribe` cleanup verified

## Maturity
decided

## Notes
- No config namespace — recent projects via `project.getRecents()`, window state via Electron built-in `BrowserWindow` state restore, user preferences folded into `project` namespace if needed later
- `terminal.spawn` signature is `spawn(args: string[], cwd: string)` — receives `string[]` from skill-orchestration, matching cli-engine's spawn API

## Connections
- cross-platform-shell: defines the Electron security and process model
- cli-engine: terminal spawn/kill/data flows through IPC; TerminalId enables future multi-terminal
- file-state-sync: `onChanged` pushes full ProjectState from main → renderer
- data-layer: parsing lives in main process, ProjectState is the output shape
- node-interaction: skill button clicks trigger terminal.spawn via renderer → main
- project-launcher: project.open/switch triggers watcher teardown/setup + returns ProjectState
- state-management: receives ProjectState from IPC, stores it; Unsubscribe pattern prevents leaks

## History
- 2026-04-16 created — identified as missing architectural gap; every feature crosses the main↔renderer boundary but no node defined the contract
- 2026-04-16 /architector:explore — defined full IPC contract: 5 namespaces mirroring modules, standard ipcMain+webContents.send with ArrayBuffer transfer, typed Result<T,E> for all returns, Unsubscribe for all listeners, main owns parsing and pushes ProjectState (including markdownContent in NodeData), TerminalId for future multi-terminal, MessagePort deferred
- 2026-04-16 /architector:decide — locked in two-pattern transport split: invoke for request-response (all Result<T,E> calls), send for streaming/push (terminal data, file change events); clarified spawn takes string[] matching cli-engine; main-owns-parsing confirmed as security boundary
