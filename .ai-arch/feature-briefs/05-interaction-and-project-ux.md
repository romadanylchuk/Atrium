# Feature Brief: Interaction & Project UX
_Stage: 05_
_Created: 2026-04-16 via /architector:finalize_
_Arch nodes covered: node-interaction, project-launcher_

## Goal
Implement the full user interaction layer: node tooltips, skill toolbar, multi-node selection, terminal modal, Status/Finalize panels, project launch gate, and project side panel. After this stage, the app is feature-complete — a user can open a project, see the architecture graph, click nodes to explore them via Claude Code, switch between projects, and create new ones.

## Context
- Canvas and state management are complete from Stage 04
- Terminal pipeline is complete from Stage 03
- All IPC channels and data parsing from Stage 02
- This stage connects the user to the system — it's the UX layer on top of the infrastructure

## What Needs to Be Built

**Node Interaction:**

*Single-node mode:*
- Click node → tooltip anchored to node position (React Flow coordinates)
- Tooltip shows: node name, maturity, summary, skill buttons (Explore, Decide, Map)
- Click outside to dismiss

*Multi-node mode:*
- Right-click to select/deselect nodes — visual highlight on canvas
- Right-click selected node again to deselect
- Click empty canvas to clear all selection
- Selection panel replaces project panel on right side
- Selection panel shows selected node names + "Clear" button
- `activePanel` in Zustand: `'project' | 'selection'`

*Top toolbar:*
- 5 skill buttons: Explore, Decide, Map, Status, Finalize
- Context-aware: reads `selectedNodes` from Zustand, passes as args when present
- Explore/Decide/Map: call `composeCommand` → `terminal.spawn` → terminal modal opens
- Status: app-rendered panel from `ProjectState` (no terminal), close button
- Finalize: status panel first, "Continue" opens terminal with finalize skill

*Terminal modal (`TerminalModal` React component):*
- Overlay div in same DOM tree as canvas (not separate BrowserWindow)
- xterm.js rendering terminal data from `terminal.onData` ArrayBuffer
- Size: centered, with fullscreen toggle
- Kill button: visible when `terminal.status === 'active'`
- Close button: enabled when `terminal.status === 'exited'`
- Canvas visible and updating behind the modal
- `terminal.write` for keyboard input → main process → pty
- `terminal.resize` on modal size change

**Project Launcher:**

*Launch gate (startup modal):*
- Shows on app startup, cannot be dismissed
- Recent projects list (from `project.getRecents()`, max 5)
- "Open" button → `dialog.openFolder()` → check for `.ai-arch/index.json`:
  - Exists → `project.open(path)` → canvas loads
  - Missing → new project flow
- Health check error surface: if `health.checkClaude()` fails, show error in gate

*Side panel (right side of canvas):*
- Always visible (unless replaced by selection panel during multi-select)
- "Open" button + recent projects list, click to switch
- Switch calls `switchProject(path)` — disabled when `!canSwitch`

*New project flow:*
- Simple form: name, technology, description, target audience (all optional)
- Form generates start prompt string
- `composeCommand({ skill: 'init', prompt, skillsDir })` → terminal modal
- On completion (`.ai-arch/` created): canvas loads, project added to recents
- Init terminal closed without `.ai-arch/`:
  - From gate → returns to gate
  - From panel → stays on current project

**Dependencies (npm):**
- `xterm` + `xterm-addon-fit` (terminal rendering in renderer)

**E2E tests (per testing-strategy — exactly 3):**
1. App launch → health check → project launcher appears
2. Open existing project → canvas renders nodes from `.ai-arch/`
3. Terminal spawn → output visible in xterm → kill

## Dependencies
- Requires: Stage 03 (terminal spawn, skill-orchestration), Stage 04 (canvas, store, diff hook)
- Enables: Stage 06 (app is feature-complete, ready to package)

## Key Decisions Already Made
- **Click for tooltip, right-click for select** — maps to "inspect one" vs "operate on group"
- **Context-aware toolbar** — single place to launch skills, no scattered skill buttons
- **Status/Finalize app-native** — data already parsed locally, no terminal needed
- **TerminalModal owned by node-interaction** — renderer owns component (size, buttons), cli-engine owns lifecycle (spawn, kill), `terminal.status` in Zustand bridges
- **Two-layer launch** — gate on startup (mandatory), panel in-app (optional switching)
- **Single "Open" button** — routes to existing or new based on `.ai-arch/` check
- **Init-without-completion safe fallback** — gate returns to gate, panel stays on current

## Open Technical Questions
- xterm.js theme/styling to match Atrium's visual language
- Tooltip positioning edge cases (node near canvas edge — flip direction?)
- New project form layout and validation UX
- Whether keyboard shortcuts are needed for skill buttons (v1: probably not)

## Out of Scope for This Stage
- electron-builder packaging (Stage 06)
- CI pipeline (Stage 06)
- Auto-update, code signing (deferred beyond v1)

## Notes for /interview
/deep-plan directly — interaction patterns and project launcher flow are fully specified. Open questions are visual/UX polish decisions resolvable during development.
