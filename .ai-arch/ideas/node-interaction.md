# Idea: Node Interaction
_Created: 2026-04-15_
_Slug: node-interaction_

## Description
Unified interaction system for the Atrium canvas. Two modes: single-node (click → tooltip with summary + skill buttons) and multi-node (right-click to select → selection panel + context-aware toolbar). Top toolbar provides global access to all 5 architector skills, automatically using selected nodes as arguments. Terminal modal (overlay div) owned by this node as a React component; cli-engine owns the process lifecycle in main. Status and Finalize render app-native panels from index.json without terminal.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Two-mode interaction model:**

   **Single-node (click):**
   - Click node → tooltip anchored to node position
   - Tooltip shows: node name, maturity, summary, skill buttons (Explore, Decide, Map)
   - Click outside to dismiss

   **Multi-node (right-click):**
   - Right-click to select/deselect individual nodes — visual highlight on canvas
   - Right-click selected node again to deselect
   - Click empty canvas to clear all selection
   - Selection panel replaces project panel on right side while nodes are selected
   - Selection panel shows selected node names + "Clear" button, no skill buttons in panel
   - Project panel returns when selection is cleared

2. **Top toolbar — all 5 skills, globally accessible, context-aware:**
   - Explore: with selected node(s) or without
   - Decide: with selected node(s) or without
   - Map: with selected nodes or without (maps everything)
   - Status: app-rendered panel from `index.json` (no Claude, no terminal), close button
   - Finalize: app-rendered status panel first (same as Status view), "Continue" opens terminal with finalize skill, "Close" dismisses. Status panel closes when terminal opens
   - Toolbar reads `selectedNodes` from Zustand — if nodes selected, they become skill arguments automatically

3. **Status/Finalize rendering — app-native, no terminal:**
   - Both render from `ProjectState` in the store (originally parsed by data-layer)
   - Status is pure display — close button only
   - Finalize shows status first, then "Continue" transitions to terminal modal

4. **Panel sharing — right side:**
   - Default: project panel (from project-launcher)
   - During multi-select: selection panel replaces project panel
   - Selection cleared → project panel returns
   - Driven by `activePanel` in Zustand UI slice: `'project' | 'selection'`

5. **Terminal modal ownership — explicit split with cli-engine:**

   **node-interaction owns (renderer):**
   - `TerminalModal` React component (overlay div in same DOM tree)
   - Size, centering, fullscreen toggle
   - Kill button visibility (shown when `terminal.status === 'active'`)
   - Close button enabled/disabled (enabled when `terminal.status === 'exited'`)

   **cli-engine owns (main process):**
   - `spawn`, `kill`, `forceKill` via node-pty
   - `terminal.status` state transitions (`idle → spawning → active → exited → closing`)
   - `onData`, `onExit` handlers

   **Bridge:** `terminal.status` in Zustand store — cli-engine writes via IPC events, node-interaction reads for UI state. Clean separation: main process never knows about modal size or button state, renderer never manages process lifecycle.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Left-click to select, double-click to open tooltip | Double-click feels slow; single-click for tooltip is faster for the common case (inspect a node) |
| Skill buttons in selection panel | Redundant with toolbar; toolbar is already context-aware and picks up selected nodes |
| Separate terminal window (BrowserWindow) | Adds window management complexity; overlay div keeps canvas visible behind modal (decided in cross-platform-shell) |
| Terminal modal owned entirely by canvas-ui | canvas-ui is about the graph surface; terminal modal is an interaction concern triggered by skill buttons |
| Status/Finalize via terminal (Claude renders) | Wasteful — data is already parsed locally; app can render it instantly without spawning a process |
| Right-side panel slides to show details on click | Panel is for persistent state (project switcher, selection list); tooltip is for transient inspection |

### Rationale
The click/right-click split maps to the two natural intentions: "inspect this one node" (click → tooltip) vs. "operate on a group" (right-click → select → toolbar). The toolbar being context-aware means there's exactly one place to launch skills — no skill buttons scattered in multiple locations. The terminal modal ownership split follows the Electron process boundary cleanly: main process manages the pty, renderer manages the UI, Zustand bridges them through `terminal.status`.

### Implications
- **canvas-ui** — provides the React Flow event handlers (onClick, onContextMenu) that node-interaction hooks into; tooltip positioning uses React Flow's node coordinates
- **cli-engine** — writes `terminal.status` to Zustand via IPC; node-interaction reads it for button state. No direct communication between the two.
- **skill-orchestration** — node-interaction calls `composeCommand({ skill, nodes, skillsDir })` and passes the resulting `string[]` to cli-engine's spawn
- **state-management** — UI slice (`selectedNodes`, `tooltipTarget`, `activePanel`) driven entirely by node-interaction; terminal slice read for modal button state
- **project-launcher** — must yield right-side panel space when `activePanel === 'selection'`

## Priority
core

## Maturity
decided

## Notes
- Only one terminal can be open at a time (enforced by cli-engine / state-management, not by node-interaction)
- Canvas updates live behind the modal via file-state-sync — user sees changes as Claude works

## Connections
- cli-engine: terminal modal reads terminal.status from Zustand (written by cli-engine via IPC); skill buttons trigger spawn
- skill-orchestration: composes string[] command for the selected skill + node(s)
- canvas-ui: React Flow event handlers (onClick, onContextMenu); tooltip uses node coordinates; overlay div in same DOM
- state-management: drives UI slice (selectedNodes, tooltipTarget, activePanel); reads terminal slice for modal button state
- data-layer: Status and Finalize panels render from ProjectState in store
- project-launcher: selection panel temporarily replaces project panel during multi-select
- file-state-sync: canvas reflects changes while terminal is still open (indirect — via state-management)

## History
- 2026-04-15 /architector:init — click node to open scoped agent dialog; conversational interaction with individual ideas
- 2026-04-15 /architector:init — (multi-node-context) multi-select nodes to trigger skills with combined context
- 2026-04-16 /architector:explore (cross-platform-shell) — interaction model shifted to embedded Claude Code terminal modal
- 2026-04-16 /architector:explore (cli-engine) — refined: click opens tooltip with summary + skill buttons; right-click to select nodes, selection panel with actions
- 2026-04-16 /architector:explore — added top toolbar with all 5 skills; Status/Finalize app-rendered; selection panel replaces project panel; top toolbar context-aware
- 2026-04-16 /architector:map — merged from node-interaction + multi-node-context; both shared the same toolbar and terminal pattern, differing only in single vs multi-select trigger
- 2026-04-16 /architector:decide — locked in two-mode interaction (click tooltip + right-click select); context-aware toolbar; Status/Finalize app-native; explicit terminal modal ownership split with cli-engine (renderer owns component, main owns lifecycle, Zustand bridges)
