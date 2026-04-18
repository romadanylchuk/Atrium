# Idea: Cross-Platform Shell
_Created: 2026-04-15_
_Slug: cross-platform-shell_

## Description
Cross-platform runtime for Atrium. Electron with TypeScript, React, Vite, and Vitest. Claude Code interaction happens through a terminal-as-modal pattern: xterm.js renders as an overlay div in the main BrowserWindow (not a separate window), node-pty lives in the main process, terminal data flows through IPC. Terminals are opaque — `.ai-arch/` file watching is the only feedback channel.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Runtime: Electron** — single BrowserWindow app with main + renderer process model. Provides Node.js in main (for node-pty, @parcel/watcher, fs access) and Chromium in renderer (for React, xterm.js).

2. **Language: TypeScript** — end-to-end, both main and renderer processes.

3. **UI: React** — component model for canvas (React Flow), panels, toolbar, and terminal modal.

4. **Build: Vite** (dev server + bundler) + **Vitest** (test runner).

5. **Terminal-as-modal pattern:**
   - xterm.js renders in the DOM of the main BrowserWindow as an **overlay div** — NOT a separate BrowserWindow
   - node-pty lives in the **main process**, terminal binary data flows through IPC (`ArrayBuffer` transfer) to xterm.js in the renderer
   - Modal appearance (centered, fullscreen toggle, close/kill buttons) is pure CSS/React — no window management
   - This means the canvas is always behind the modal and updates live via file-state-sync

6. **Linting: ESLint** with TypeScript + React conventions.

7. **Version control: GitHub.**

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Tauri | Rust backend adds learning curve; node-pty has no Rust equivalent with same maturity; ecosystem smaller for this use case |
| Web-only (no Electron) | Can't spawn local processes (node-pty), can't watch filesystem (@parcel/watcher), can't access Claude CLI |
| Native (Swift/C#/GTK) | Three separate codebases; no shared UI framework for canvas rendering; prohibitive effort for a solo developer |
| Separate BrowserWindow for terminal | Adds window management complexity (focus, positioning, z-order); can't overlay on canvas; loses the "modal" metaphor; harder to coordinate state |
| Programmatic CLI parsing (--bare -p) | Loses Claude Code's interactive features (tool approval, follow-ups); output parsing is fragile; terminal gives full Claude experience for free |
| Custom chat UI instead of terminal | Massive effort to replicate Claude Code's UI; would break on every CLI update; terminal is zero-maintenance |

### Rationale
Electron is the only framework that provides all three requirements simultaneously: local process spawning (node-pty for Claude CLI), native filesystem watching (@parcel/watcher for `.ai-arch/`), and rich canvas rendering (React Flow). The terminal-as-modal pattern — xterm.js as an overlay div, not a separate window — is the key architectural insight: it keeps window management trivial (one window), allows live canvas updates behind the modal, and means all Claude interaction is fully featured without any custom chat UI or output parsing.

### Implications
- **cli-engine** — node-pty in main process, terminal state managed there, data sent to renderer via IPC
- **electron-ipc** — terminal data is the hot path; ArrayBuffer transfer keeps it efficient
- **canvas-ui / node-interaction** — terminal modal is a React component in the same DOM tree as the canvas, owned by the renderer layer
- **file-state-sync** — @parcel/watcher runs in main process alongside node-pty
- **build-distribution** — electron-builder packages the Electron app; native deps (node-pty, @parcel/watcher) require per-platform builds
- **testing-strategy** — Vitest for unit/integration, Playwright + Electron for E2E

## Priority
blocking

## Maturity
decided

## Notes
- **Flow:** User triggers action → skill-orchestration builds `string[]` → cli-engine spawns node-pty in main → IPC streams data → xterm.js renders in overlay div → user interacts with Claude directly → closes when done
- **No programmatic CLI parsing** — terminals are opaque, `.ai-arch/` file changes are the only feedback channel
- **No terminal history** — sessions are ephemeral, terminal closes and it's gone
- Cross-platform CLI path resolution (claude command availability) — resolved at startup

## Connections
- cli-engine: node-pty in main process; cli-engine manages lifecycle, IPC streams data to renderer
- skill-orchestration: composes string[] arg arrays; no shell involved
- file-state-sync: @parcel/watcher in main process; primary feedback mechanism since terminals are opaque
- node-interaction: terminal modal is an overlay div in the same DOM, not a separate window
- electron-ipc: defines the main↔renderer boundary that terminal data crosses
- build-distribution: electron-builder packages the app; native deps require per-platform CI
- testing-strategy: Vitest + Playwright from this stack

## History
- 2026-04-15 /architector:init — cross-platform runtime decision needed; must support CLI spawning, fs watching, canvas rendering
- 2026-04-16 /architector:explore — decided Electron + TS + React + Vite stack; discovered terminal-as-modal pattern using xterm.js + node-pty for all Claude interaction; no output parsing needed, .ai-arch/ file watching is the only feedback channel; ESLint with TS/React conventions
- 2026-04-16 /architector:decide — formalized stack + terminal-as-modal; clarified xterm.js renders as overlay div in main BrowserWindow (not separate window), node-pty in main process, data flows through IPC; rejected Tauri, web-only, native, separate BrowserWindow, programmatic CLI parsing, custom chat UI
