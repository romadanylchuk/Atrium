# Idea: State Management
_Created: 2026-04-16_
_Slug: state-management_

## Description
Renderer-side Zustand store unifying all app state into one store with 3 logical slices (project, UI, terminal). React Flow owns layout state; Zustand owns domain data, UI state, and terminal lifecycle. Main process pushes `ProjectState` via IPC; a diff hook reconciles incoming data with React Flow. Project switching is a single atomic store action with a positive whitelist terminal guard.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Library: Zustand** — lightweight, no boilerplate, granular subscriptions. Single `useAtriumStore` hook.

2. **One store, 3 slices by naming convention:**
   - **Project slice:** `project: ProjectState | null` — full parsed model from IPC
   - **UI slice:** `selectedNodes: Set<string>`, `tooltipTarget: string | null`, `activePanel: 'project' | 'selection'`
   - **Terminal slice:** `terminal: { id: TerminalId | null, status: 'idle' | 'spawning' | 'active' | 'exited' | 'closing', fullscreen: boolean }`

3. **React Flow ownership split:**
   - React Flow owns layout — positions, edges, viewport, drag, selection are React Flow internal state
   - Zustand feeds React Flow — `nodes[]` and `connections[]` from `ProjectState`
   - Layout persistence: read React Flow state on change, save to `layout.json` in Electron userData
   - No bidirectional sync — React Flow is source of truth for visual state

4. **Diff hook (`useProjectSync`) in the rendering layer:**
   - Watches `store.project` via `useEffect`
   - Diffs old vs new nodes, updates React Flow's node list:
     - New nodes → dagre auto-layout position
     - Existing nodes → keep current React Flow position
     - Removed nodes → removed from React Flow; cleaned up from `selectedNodes` and `tooltipTarget`
   - Store action `setProject` is a simple replace, no diff computation
   - Diff logic is UI reconciliation, not app logic — belongs in a hook, not the store

5. **`switchProject(path)` — single atomic entry point:**
   - Guard: positive whitelist `const canSwitch = terminal.status === 'idle' || terminal.status === 'exited'`
   - If `exited`: auto-dismiss terminal (`exited → closing → idle`) before IPC call
   - IPC: `project.switch(path)` — stops old watcher, starts new, returns `ProjectState`
   - Reset: `project` replaced, `selectedNodes` cleared, `tooltipTarget` null, `activePanel` → `'project'`, `terminal` → idle
   - React Flow gets full reset via diff hook (new nodes, new edges, new layout)

6. **Terminal guard — positive whitelist:**
   ```typescript
   const canSwitch = terminal.status === 'idle' || terminal.status === 'exited'
   ```
   - New state not in whitelist → `canSwitch` is `false` → switch **blocked by default**
   - Safe default for a destructive operation: adding a state requires an explicit decision to allow switch
   - UI disables project switching controls (side panel items + Open button) when `!canSwitch`
   - No auto-kill on switch — user must kill first, wait for `exited`, then switch

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Redux Toolkit | More structure than needed for a single-page app with one store; boilerplate overhead |
| React Context | Re-renders too aggressively for canvas updates; no granular subscriptions |
| Multiple separate Zustand stores | Finer granularity not worth the wiring overhead; slices in one store are simpler |
| Diff logic in the store (middleware/action) | Diff is UI reconciliation (React Flow positions), not domain logic; belongs in the rendering layer |
| Blocklist guard (`status === 'spawning' \|\| status === 'active' \|\| status === 'closing'`) | Unsafe default — new state not in blocklist would allow switch without explicit decision |
| `terminal.status !== 'idle'` (original formulation) | Written before `exited` state existed; doesn't account for switch-during-exited |
| Auto-kill terminal on switch | Destructive without confirmation; user may have clicked accidentally |

### Rationale
Zustand's simplicity matches the app's needs: one store, three slices, granular subscriptions for canvas performance. The React Flow ownership split avoids fighting the library — React Flow manages what it's good at (visual state), Zustand manages what it's good at (domain state). The diff hook bridges them cleanly.

The positive whitelist guard is the critical safety decision: for a destructive operation like project switch (which resets all state), new terminal states must be explicitly opted into. A blocklist would silently allow switch during unknown states — the opposite of safe defaults.

### Implications
- **canvas-ui** — consumes `ProjectState` from store; diff hook calls React Flow's `setNodes`/`setEdges`
- **node-interaction** — reads/writes `selectedNodes`, `tooltipTarget`, `activePanel` from UI slice; reads `terminal.status` for modal button state
- **file-state-sync** — pushes `ProjectState` into store via `setProject`; triggers diff hook
- **cli-engine** — terminal slice mirrors the 5-state lifecycle; IPC events write terminal status
- **project-launcher** — calls `switchProject(path)`; UI disabled when `!canSwitch`
- **electron-ipc** — IPC is the transport; `project.switch` returns `ProjectState`, `fileSync.onChanged` pushes updates
- **testing-strategy** — unit tests for all state transitions, whitelist guard logic, diff hook reconciliation

## Priority
core

## Maturity
decided

## Notes
- `resetForProject` is an internal implementation detail of `switchProject`, not exposed as public API
- File watcher lifecycle (stop old, start new) handled by IPC `project.switch`, not by store actions

## Connections
- canvas-ui: consumes `ProjectState` from store; React Flow owns layout, hook reconciles on update
- node-interaction: reads/writes selectedNodes, tooltipTarget, activePanel from UI slice
- file-state-sync: pushes `ProjectState` into store via `setProject`; hook diffs against React Flow
- data-layer: parsing in main process, store receives the output via IPC
- project-launcher: `switchProject(path)` is the single entry point; blocked while terminal active
- cli-engine: terminal slice tracks lifecycle; terminal guard blocks destructive project switch
- electron-ipc: IPC is the transport; `project.switch` returns new `ProjectState`, `fileSync.onChanged` pushes updates

## History
- 2026-04-16 created — identified as gap; multiple async data sources feed the UI with no defined unification strategy
- 2026-04-16 /architector:explore — chose Zustand with one store + slices; React Flow owns layout, Zustand owns domain/UI/terminal; diff logic in React hook not store; switchProject as single atomic action with terminal guard; switch blocked while terminal active
- 2026-04-16 /architector:explore — synced terminal slice to cli-engine's 5-state lifecycle (added `exited`); switch guard changed to positive whitelist `['idle', 'exited']`; switch during `exited` auto-dismisses terminal modal
- 2026-04-16 /architector:decide — locked in Zustand + one store + 3 slices; React Flow ownership split; diff hook in rendering layer; switchProject atomic action; positive whitelist guard (safe default: new states blocked); blocklist rejected as unsafe
