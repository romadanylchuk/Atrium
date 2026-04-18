# Idea: CLI Engine
_Created: 2026-04-15_
_Slug: cli-engine_

## Description
Terminal lifecycle manager in the main process. Spawns a single node-pty process at a time from `string[]` arg arrays (received from skill-orchestration), tracks terminal state through a 5-state machine (`idle → spawning → active → exited → closing → idle`), and exposes spawn/kill/resize via IPC. Terminal stays open after process exit for output reading. Always-visible kill button for hung processes. Startup health check verifies Claude availability. Modal UI (size, position, fullscreen) is NOT owned here — that belongs to the renderer/canvas-ui layer.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Spawn API accepts `string[]`** — arg arrays from skill-orchestration passed directly to node-pty:
   ```typescript
   spawn(args: string[], cwd: string): Result<TerminalId, TerminalErrorCode>
   // Internally: pty.spawn(args[0], args.slice(1), { cwd })
   ```
   No shell involved. Single terminal at a time — spawn rejected if one is already active.

2. **5-state terminal lifecycle with `exited` state:**
   | State | Meaning | Close allowed | Switch allowed | Kill allowed |
   |-------|---------|:---:|:---:|:---:|
   | `idle` | No terminal | N/A | Yes | N/A |
   | `spawning` | node-pty starting | No | No | No |
   | `active` | Process running | No | No | Yes |
   | `exited` | Process exited, terminal visible for reading | Yes | Yes | N/A |
   | `closing` | Terminal being torn down | No | No | No |

   `onExit` from node-pty triggers `active → exited`. User reads output, closes manually. Close triggers `exited → closing → idle`.

3. **Always-visible kill button** — separate from the close button. Sends SIGTERM, then SIGKILL after a timeout if process doesn't exit. Available during `active` state. Triggers `active → exited` (process killed, terminal stays open showing output up to kill point).

4. **Modal UI moved out of cli-engine.** This node owns terminal lifecycle only (spawn, state machine, kill, health check). Modal rendering (fixed size, centered, fullscreen toggle, close/kill button UI) is a React component in the renderer — owned by canvas-ui/node-interaction. cli-engine exposes state via IPC; the renderer decides how to present it.

5. **Startup health check** stays in cli-engine — runs `claude -p "hi"` in a hidden pty on app launch. Returns `Result<ClaudeVersion, HealthErrorCode>` via the `health.checkClaude()` IPC channel. Error surfaced in renderer as a blocking modal.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Auto-close on process exit | Loses Claude's summary output — user can't review what happened |
| Stay open with auto-close timer | Arbitrary timeout; user may still be reading |
| Kill button appears after timeout | Hang detection is unreliable; always-visible is simpler and user always has an escape |
| Kill button in top toolbar | Disconnected from terminal context; kill is a terminal operation, should be near the terminal |
| Keep modal UI in cli-engine | Mixes main process lifecycle with renderer concerns; violates the IPC boundary — main manages process, renderer manages presentation |

### Rationale
The `exited` state cleanly separates "process is running" from "user is reading output." This resolves the cross-cutting gap identified in the architecture review — both the close button and project switch now have a clear, unambiguous rule: blocked during `spawning`/`active`/`closing`, allowed during `idle`/`exited`. The always-visible kill button gives the user an escape hatch without complex hang detection.

Moving modal UI out respects the IPC boundary: main process manages terminal lifecycle, renderer manages presentation. cli-engine doesn't know or care about modal size or fullscreen state.

### Implications
- **state-management** — terminal slice uses the 5-state machine: `{ id, status, fullscreen }` where `fullscreen` is renderer-only state
- **electron-ipc** — `terminal.onExit` triggers `active → exited` in the store; renderer shows close button
- **node-interaction / canvas-ui** — owns the terminal modal React component (size, position, fullscreen, close/kill button rendering)
- **skill-orchestration** — confirmed: passes `string[]`, cli-engine spawns directly

## Priority
blocking

## Maturity
decided

## Notes
- **Single terminal only** — one pty process, one xterm.js modal at a time
- **Working directory:** current project directory from project-launcher/state-management
- **No output parsing** — terminals are opaque, file-state-sync handles all state feedback
- **No session history** — sessions are ephemeral, terminal closes and it's gone
- **Health check on startup** — hidden pty, `claude -p "hi"`, error modal if fails

## Connections
- cross-platform-shell: depends on Electron + node-pty runtime
- skill-orchestration: receives `string[]` arg arrays to spawn
- file-state-sync: the only feedback channel from terminal sessions
- node-interaction: terminal spawned when user clicks a skill button; modal UI component lives here
- electron-ipc: spawn/kill/data/exit flow through IPC channels; health check via `health.checkClaude()`
- state-management: terminal slice tracks 5-state lifecycle; `exited` state enables close/switch

## History
- 2026-04-15 /architector:init — programmatic Claude Code invocation via --bare -p with explicit system prompts, tool restrictions, output capture
- 2026-04-16 /architector:explore (cross-platform-shell) — pivoted from programmatic CLI parsing to terminal-as-modal pattern; now a pty manager, not an output parser
- 2026-04-16 /architector:explore — defined terminal lifecycle: startup health check, single terminal, fixed-size modal with fullscreen toggle, close disabled while active; clarified working directory sources and interaction triggers
- 2026-04-16 /architector:decide — 5-state lifecycle (idle/spawning/active/exited/closing); spawn accepts string[] from skill-orchestration; terminal stays open after exit for reading; always-visible kill button; modal UI moved to renderer layer; health check stays
