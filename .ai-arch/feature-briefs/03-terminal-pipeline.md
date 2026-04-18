# Feature Brief: Terminal Pipeline
_Stage: 03_
_Created: 2026-04-16 via /architector:finalize_
_Arch nodes covered: cli-engine, skill-orchestration, file-state-sync_

## Goal
Implement the terminal feedback loop: compose CLI commands from UI actions, spawn them via node-pty, watch `.ai-arch/` for changes, and push parsed updates to the renderer. After this stage, the app can spawn a Claude Code terminal, track its lifecycle through 5 states, detect file changes Claude makes, and push them as `ProjectState` updates — all without any visible UI (that's Stage 04-05).

## Context
- cli-engine manages terminal lifecycle in main process with a 5-state machine
- skill-orchestration is a pure function returning `string[]` arg arrays — no shell involved
- file-state-sync uses @parcel/watcher with 300ms debounce, full re-read on each event
- IPC channels for terminal and fileSync are defined in Stage 02 — this stage implements the handlers
- Terminal data flows as ArrayBuffer (zero-copy transfer) from main to renderer

## What Needs to Be Built

**CLI Engine (main process):**
- 5-state terminal lifecycle: `idle → spawning → active → exited → closing → idle`
- `spawn(args: string[], cwd: string): Result<TerminalId, TerminalErrorCode>` — calls `pty.spawn(args[0], args.slice(1), { cwd })`
- Single terminal enforcement — spawn rejected if one already active
- `kill(id): Result<void, TerminalErrorCode>` — SIGTERM, then SIGKILL after timeout
- `onExit` handler: `active → exited` (process exits naturally or via kill)
- IPC integration: `terminal.onData` pushes ArrayBuffer to renderer, `terminal.onExit` pushes exit code
- Fire-and-forget handlers: `terminal.write` (renderer → pty), `terminal.resize` (renderer → pty)
- Health check: `health.checkClaude()` — spawn hidden pty with `claude -p "hi"`, return `Result<ClaudeVersion, HealthErrorCode>`

**Skill Orchestration (shared/pure):**
- `composeCommand(params: { skill, nodes?, prompt?, skillsDir }): string[]`
- 4 command patterns:
  - Init: `['claude', '/architector:init <prompt>', '--append-system-prompt-file', '<skillsDir>/init.md']`
  - Single node: `['claude', '/architector:explore canvas-ui', '--append-system-prompt-file', '<skillsDir>/explore.md']`
  - Multi-node: `['claude', '/architector:map node1 node2', '--append-system-prompt-file', '<skillsDir>/map.md']`
  - Free terminal: `['claude']`
- `resolveSkillsPath()`: `app.getAppPath()/skills` (dev) or `process.resourcesPath/skills` (packaged)

**File-State Sync (main process):**
- `@parcel/watcher` subscription on `.ai-arch/` directory
- 300ms debounce — burst writes trigger single re-parse
- On debounced event: call data-layer parsing (from Stage 02), produce `ProjectState`
- Push `ProjectState` via `fileSync.onChanged` IPC channel
- Watcher lifecycle: start on `project.open`/`project.switch`, stop on switch/quit

**Unit tests:**
- skill-orchestration: all 4 command patterns (pure function, trivial to test)

**Integration tests (per testing-strategy):**
- Terminal lifecycle: happy path (spawn → active → natural exit → exited → close → idle)
- Terminal lifecycle: kill path (spawn → active → force kill → exited → close → idle)
- Terminal lifecycle: error cases (process crash → exited, spawn failure → idle)
- File watcher pipeline: start watcher on temp dir, write files, verify 300ms debounce, verify ProjectState output
- IPC messages emitted correctly for onData, onExit at each transition

## Dependencies
- Requires: Stage 02 (IPC channels defined, data-layer parsing functions, ProjectState type)
- Enables: Stage 04 (terminal slice in store needs cli-engine events), Stage 05 (TerminalModal needs terminal state)

## Key Decisions Already Made
- **string[] arg arrays to node-pty directly** — no shell involved, Windows problem eliminated
- **--append-system-prompt-file** for SKILL.md injection — file path as CLI arg, not inline content
- **5-state lifecycle with `exited`** — separates "process running" from "user reading output"
- **Always-visible kill button** — no hang detection, user always has escape
- **@parcel/watcher** — native OS APIs, not chokidar or fs.watch
- **300ms debounce** — upper end of range, prefer consistency over speed
- **Full re-read** — not incremental, <50 small files is <10ms

## Open Technical Questions
- SIGKILL timeout duration after SIGTERM (2s? 5s?)
- Claude CLI binary name/path resolution across platforms (`claude` vs full path)
- Health check: what constitutes a valid response (any output? specific version string?)
- Whether `terminal.write` needs backpressure handling for fast paste operations

## Out of Scope for This Stage
- Terminal modal UI (Stage 05 — node-interaction owns TerminalModal React component)
- Renderer-side state management (Stage 04 — Zustand store)
- Canvas rendering (Stage 04)
- SKILL.md files themselves — assumed to exist in the skills directory

## Notes for /interview
/deep-plan directly — the terminal lifecycle, command composition, and watcher pipeline are fully specified. Open questions are implementation-level details.
