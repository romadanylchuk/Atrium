# Idea: Data Layer
_Created: 2026-04-15_
_Slug: data-layer_

## Description
Read-only parser for `.ai-arch/` in the main process. Atrium never writes to `.ai-arch/` — all mutations happen through Claude Code in terminal sessions. Parses `index.json` via `JSON.parse`, `ideas/*.md` via string splitting on `## ` headings, and `project-context.md`. Outputs `ProjectState` (defined in electron-ipc) for transport to the renderer. Canvas layout and app config stored separately in Electron userData.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Strictly read-only** — Atrium never writes to `.ai-arch/`. All mutations happen through Claude Code in terminal sessions. No write API, no conflict resolution needed.

2. **Parsing approach: string splitting on `## ` headings (no AST parser).**
   - `index.json` → `JSON.parse` (standard, no custom logic)
   - `ideas/*.md` → split on `## ` headings, extract sections by name
   - `project-context.md` → same string splitting approach
   - **Precondition:** `.ai-arch/` file structure is controlled by Claude skills, not edited by users manually. Heading format is predictable because Claude generates it consistently via the architector plugin's skill templates.
   - **Risk:** If this precondition is violated (user edits files manually, other tools write to `.ai-arch/`), string splitting may produce unexpected results without error. Accepted risk for current scope.

3. **Layout storage in Electron userData:**
   - `projects/<project-hash>/layout.json` — node positions (x, y), viewport state (zoom, pan)
   - Separate from `.ai-arch/` — layout is app-local, not part of the architecture data
   - Standard Electron paths: `~/.config/atrium` (Linux), `~/AppData/Roaming/atrium` (Windows), `~/Library/Application Support/atrium` (Mac)

4. **App config in Electron userData:**
   - Recent projects list, window size/position, preferences
   - Same Electron userData directory as layout

5. **Output shape: `ProjectState`** — defined in electron-ipc decision. data-layer produces it, IPC transports it, state-management stores it. Single type, no fragmentation.

6. **Free terminal button** — spawns plain `claude` session in project directory with no skill/prompt injection, using the same cli-engine spawn mechanism.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Markdown AST parser (remark/unified) | Heavier dependency, slower, no benefit when heading structure is predictable and controlled by Claude skills |
| Bidirectional read/write to `.ai-arch/` | Introduces conflict resolution complexity; Claude in terminal is the single writer, app has no reason to write |
| Layout stored inside `.ai-arch/` | Layout is app-specific (window positions), not architecture data; would pollute the plugin's format and cause git noise |
| Layout stored in `.ai-arch/.atrium/` subdirectory | Still couples app state to the architecture directory; moving projects would carry stale layout |
| Renderer does its own parsing | Violates the IPC security boundary (decided in electron-ipc); main process owns all file access |

### Rationale
The `.ai-arch/` format is defined by the architector plugin with predictable structure. String splitting is the simplest parser that works — no dependencies, fast, trivially testable. The read-only constraint eliminates an entire class of problems (conflicts, locking, write ordering). Separating layout into Electron userData keeps the architecture data clean and portable.

The explicit precondition about Claude-controlled file structure makes the string splitting tradeoff transparent: it's not a general-purpose markdown parser, it's a parser for a specific, controlled format.

### Implications
- **file-state-sync** — calls data-layer parsing on every debounced fs event; parsing must be fast (string splitting is)
- **electron-ipc** — `ProjectState` output shape is the contract between data-layer and the rest of the app
- **canvas-ui** — receives parsed data via state-management; layout positions from separate userData file
- **testing-strategy** — most unit-testable component: feed MD strings, assert parsed output; edge cases include `## ` in code blocks, malformed files, partial writes mid-save

## Priority
blocking

## Maturity
decided

## Notes
- Format defined by architector plugin — `index.json` contains: nodes (slug, name, priority, maturity, file, summary), connections, sessions
- If app config format changes between releases, graceful fallback to defaults (don't crash on outdated config)

## Connections
- file-state-sync: data-layer provides the parsing logic, file-state-sync triggers re-parsing on fs changes
- electron-ipc: data-layer output shape IS the ProjectState type that IPC transports
- canvas-ui: parsed data drives the canvas rendering via state-management
- project-launcher: recent projects list read from app config
- cli-engine: free terminal button uses the same spawn mechanism without skill injection
- state-management: initial data load populates store with ProjectState
- testing-strategy: most unit-testable component (pure parsing functions)

## History
- 2026-04-15 /architector:init — .ai-arch/ format defined by architector plugin; app reads/writes JSON index + MD node files natively
- 2026-04-16 /architector:explore — strictly read-only, no writes to .ai-arch/; simple string splitting for MD parsing; layout in Electron userData; free terminal button for general Claude sessions
- 2026-04-16 /architector:decide — locked in string splitting with explicit precondition (Claude-controlled format); read-only confirmed; layout in userData separate from .ai-arch/; output shape is ProjectState from electron-ipc; accepted risk of manual edits breaking parser
