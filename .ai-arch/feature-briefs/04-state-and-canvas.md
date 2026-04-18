# Feature Brief: State & Canvas
_Stage: 04_
_Created: 2026-04-16 via /architector:finalize_
_Arch nodes covered: state-management, canvas-ui_

## Goal
Implement the renderer-side state management and the visual canvas. After this stage, the app can receive `ProjectState` from the main process, store it in Zustand, render architectural nodes as a React Flow graph with maturity-based visual encoding, auto-layout new nodes with dagre, persist layout to disk, and live-update the canvas when files change. No interaction yet (that's Stage 05) — just the visual surface.

## Context
- Zustand one store with 3 slices: project, UI, terminal
- React Flow owns layout state; Zustand owns domain/UI/terminal
- Diff hook (`useProjectSync`) bridges Zustand and React Flow
- IPC and data layer are complete from Stage 02; terminal pipeline from Stage 03
- `ProjectState` is the single input shape from main process

## What Needs to Be Built

**State Management (renderer):**
- Zustand store: `useAtriumStore` with 3 slices:
  - Project: `project: ProjectState | null`
  - UI: `selectedNodes: Set<string>`, `tooltipTarget: string | null`, `activePanel: 'project' | 'selection'`
  - Terminal: `{ id: TerminalId | null, status: 'idle' | 'spawning' | 'active' | 'exited' | 'closing', fullscreen: boolean }`
- `setProject(state: ProjectState)` — simple replace, no diff
- `switchProject(path: string)` — atomic action:
  - Guard: `canSwitch = terminal.status === 'idle' || terminal.status === 'exited'`
  - If exited: auto-dismiss (`exited → closing → idle`) before IPC call
  - IPC: `project.switch(path)`
  - Reset all slices atomically
- IPC listeners setup: subscribe to `fileSync.onChanged` → `setProject`, `terminal.onData`/`onExit` → update terminal slice
- Unsubscribe cleanup in `useEffect`

**Diff Hook (`useProjectSync`):**
- Watches `store.project` via `useEffect`
- Diffs old vs new nodes, updates React Flow:
  - New nodes → dagre auto-layout position
  - Existing nodes → keep current React Flow position
  - Removed nodes → remove from React Flow, clean up `selectedNodes` and `tooltipTarget`
  - Maturity changed → appearance updates, position preserved
  - Connections changed → edges update
- React Flow `setNodes` / `setEdges` calls

**Canvas UI (renderer):**
- React Flow canvas component with zoom, pan, drag
- Custom node component with maturity-based visual encoding:
  - raw-idea: gray circle | explored: blue rounded rect | decided: green rect | ready: gold badge
- Custom edge component with relationship-based styling:
  - depends-on: solid red | informs: dashed blue | extends: dotted purple | feeds: solid green | uses: dashed gray
- Dagre auto-layout on first open (no saved positions) and for new nodes
- Layout persistence: save positions + viewport to `layout.json` on change, read on project open
- Canvas occupies main area, right side reserved for panel (Stage 05)

**Unit tests (per testing-strategy):**
- Store slice updates: setProject, selectNode, deselectNode, clearSelection
- Terminal state transitions: full 5-state machine
- switchProject guard: whitelist (idle/exited → allowed), blocklist (spawning/active/closing → blocked), hypothetical 6th state → blocked
- Auto-dismiss: switch during exited triggers closing → idle before IPC
- Diff hook — 8 test cases:
  1. Node added → auto-layout position
  2. Node removed → removed from React Flow
  3. Node removed while selected → selectedNodes cleaned up
  4. Node removed while tooltip open → tooltipTarget cleared
  5. Maturity changed → appearance updates, position preserved
  6. Connection added/removed → edges update
  7. Node ID changed (slug rename) → position resets to auto-layout
  8. Rapid sequential updates → final state matches last ProjectState

## Dependencies
- Requires: Stage 02 (ProjectState type, IPC channels), Stage 03 (terminal events for terminal slice)
- Enables: Stage 05 (interaction layer reads from store, renders on canvas)

## Key Decisions Already Made
- **Zustand over Redux Toolkit** — lighter, no boilerplate, great subscription granularity
- **One store, 3 slices** — finer granularity not worth the wiring overhead
- **React Flow** — purpose-built node graph library, handles zoom/pan/drag/edges
- **Dagre** — standard React Flow pairing for hierarchical DAG layout
- **Diff in hook, not store** — UI reconciliation belongs in rendering layer
- **Positive whitelist guard** — new terminal states blocked by default (safe for destructive operation)

## Open Technical Questions
- Dagre layout options: rankdir (TB vs LR), node separation, rank separation — need visual tuning
- Layout save throttling: save on every drag or debounce? React Flow's `onNodesChange` fires frequently
- Whether to show a loading state while first `ProjectState` is being parsed

## Out of Scope for This Stage
- Tooltip, toolbar, selection panel (Stage 05)
- Terminal modal (Stage 05)
- Project launcher UI (Stage 05)
- Canvas is view-only in this stage — click/right-click handlers added in Stage 05

## Notes for /interview
/deep-plan directly — store shape, diff logic, and visual encoding are fully specified. Dagre layout tuning is a visual iteration task, not an architectural question.
