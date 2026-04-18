# Idea: Project Launcher
_Created: 2026-04-15_
_Slug: project-launcher_

## Description
Two-layer project management. Layer 1: launch gate modal on app startup — cannot be dismissed without selecting or creating a project. Layer 2: persistent right-side panel on the canvas for switching projects without leaving the workspace. Single "Open" button routes to existing (has `.ai-arch/`) or new project flow. Recent projects list (max 5) managed by main process.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Two-layer structure:**

   **Layer 1 — Launch gate (startup modal):**
   - Shows on app startup, cannot be dismissed without selecting/creating a project
   - Recent projects list (max 5)
   - "Open" button → `dialog.openFolder()` → checks for `.ai-arch/` → routes to existing or new project flow
   - Once project selected/created → gate closes, canvas loads
   - No app functionality available until a project is active

   **Layer 2 — In-app side panel (right side of canvas):**
   - Always visible while working (unless temporarily replaced by selection panel during multi-node select, per node-interaction)
   - "Open" button at top → same routing logic as launch gate
   - Recent projects list, click to switch instantly via `switchProject`
   - Switch disabled when terminal is active (terminal guard from state-management)

2. **Single "Open" button routing:**
   - User clicks Open → `dialog.openFolder()` via IPC → returns path
   - Check: does `<path>/.ai-arch/index.json` exist?
   - Yes → `project.open(path)` or `project.switch(path)` → canvas loads
   - No → new project flow

3. **New project flow:**
   - Simple form: name, technology, description, target audience — all optional
   - Form generates a start prompt string
   - `composeCommand({ skill: 'init', prompt, skillsDir })` → terminal modal opens
   - On completion (Claude creates `.ai-arch/`): canvas loads, project added to recents
   - **Init terminal closed without creating `.ai-arch/`:**
     - From launch gate → returns to launch gate (no active project, app cannot proceed)
     - From side panel → stays on current project (`switchProject` never completed, old state preserved)

4. **Recent projects: 5 items maximum.**
   - `project.getRecents()` manages the list in main process
   - Adds on successful `project.open`/`project.switch`, trims to 5 (FIFO)
   - Renderer receives the list, doesn't manage it — no business logic in renderer
   - Stored in Electron userData app config

5. **Switch behavior:**
   - Instant via `switchProject` in state-management (atomic action)
   - Terminal guard: switch blocked while terminal active, allowed during idle/exited
   - Switch during exited: auto-dismiss terminal modal before switching (decided in state-management)

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| No launch gate — open last project automatically | User may want to switch; no way to handle "last project deleted" gracefully |
| Separate "New" and "Open" buttons | Unnecessary split — "Open" checks for `.ai-arch/` and routes; one button, two paths |
| Recent projects in renderer state | Business logic (add, trim, persist) belongs in main process near the storage layer |
| Unlimited recent projects | Diminishing value past 5; keeps the panel compact |
| Summary cards with node counts in recents | Extra data to keep fresh; name + path is enough for recognition; details visible after opening |
| Kill terminal on project switch | Destructive action without confirmation; user may have clicked accidentally (decided in state-management) |

### Rationale
The two-layer design ensures there's always a project context: the launch gate prevents the app from entering a stateless void, while the side panel enables fast switching during work. The single "Open" button simplifies the UX — the routing logic (existing vs new) is invisible to the user. Recent projects managed in main process keeps the renderer pure and the business logic next to the persistence layer. The init-without-completion edge case has clear, safe fallbacks for both entry points.

### Implications
- **state-management** — `switchProject(path)` is the single entry point; launch gate calls it after initial selection
- **electron-ipc** — `project.open`, `project.switch`, `project.getRecents`, `dialog.openFolder` are all invoke channels
- **cli-engine** — new project flow spawns terminal with init command
- **skill-orchestration** — composes init command from form-generated prompt
- **canvas-ui** — side panel occupies fixed-width right column; canvas flexes
- **node-interaction** — selection panel temporarily replaces project panel during multi-select

## Priority
core

## Maturity
decided

## Notes
- Launch gate also serves as the health check error surface — if `health.checkClaude()` fails, error shown in the gate modal before any project interaction

## Connections
- state-management: switchProject is the single entry point for project switching
- electron-ipc: project.open, project.switch, project.getRecents, dialog.openFolder are invoke channels
- cli-engine: new project flow spawns terminal with init skill
- skill-orchestration: composes the init command with form-generated prompt
- canvas-ui: side panel occupies fixed-width right column; canvas flexes
- node-interaction: selection panel temporarily replaces project panel during multi-select
- data-layer: recent paths from app config in Electron userData

## History
- 2026-04-15 /architector:init — start screen + in-app switcher with summary cards; "New" button for initial brainstorm prompt; switch projects from main screen
- 2026-04-16 /architector:explore — two-layer design: launch gate popup on startup + persistent right-side panel on canvas; single "Open" button routes to existing or new project; new project flow with optional form fields; click to switch projects instantly
- 2026-04-16 /architector:decide — locked in two-layer structure; recent projects max 5 managed by main process; init-without-completion edge case: gate returns to gate, panel stays on current project; single Open button routing via .ai-arch/ check
