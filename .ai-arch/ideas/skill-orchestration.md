# Idea: Skill Orchestration
_Created: 2026-04-15_
_Slug: skill-orchestration_

## Description
Pure function that composes CLI argument arrays from UI actions and hands them to cli-engine. Returns `string[]` passed directly to node-pty — no shell involved, no escaping needed, fully cross-platform. SKILL.md files referenced via `--append-system-prompt-file` flag pointing to a resolved file path. Skills folder lives next to the app binary, manually updated before builds.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Argument arrays, not command strings.** `composeCommand` returns `string[]` passed directly to `pty.spawn(args[0], args.slice(1), { cwd })`. No shell is involved — the Windows `$(cat ...)` problem dissolves entirely.

2. **`--append-system-prompt-file` for SKILL.md injection.** File path passed as CLI arg, Claude reads the file. No content escaping, no massive inline args.

3. **Pure function API:**
```typescript
function composeCommand(params: {
  skill: SkillName
  nodes?: string[]       // slugs
  prompt?: string        // for init form
  skillsDir: string      // resolved path to skills folder
}): string[]
```

4. **Four command patterns (as arg arrays):**
   - Init: `['claude', '/architector:init <prompt>', '--append-system-prompt-file', '<skillsDir>/init.md']`
   - Single node: `['claude', '/architector:explore canvas-ui', '--append-system-prompt-file', '<skillsDir>/explore.md']`
   - Multi-node: `['claude', '/architector:map node1 node2', '--append-system-prompt-file', '<skillsDir>/map.md']`
   - Free terminal: `['claude']`

5. **Skills path resolution:**
   - Dev: `path.join(app.getAppPath(), 'skills')`
   - Packaged: `path.join(process.resourcesPath, 'skills')` via electron-builder `extraResources`
   - Resolved once at app startup in main process, passed as `skillsDir` parameter

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Shell command strings with `$(cat SKILL.md)` | Bash-only — breaks on Windows cmd.exe and PowerShell. Original approach, abandoned. |
| Read file in Node, pass inline via `--append-system-prompt` | Works but requires shell escaping for quotes/newlines in SKILL.md content. Fragile. |
| Force Git Bash / sh on Windows | External dependency not guaranteed to be installed. |
| Write to temp file, pass temp path | Unnecessary I/O and cleanup when `--append-system-prompt-file` exists. |

### Rationale
Passing `string[]` directly to node-pty bypasses the shell entirely. This eliminates all cross-platform shell expansion issues, all escaping concerns, and all command injection risks. The function is pure (no I/O, no side effects), trivially unit-testable, and the arg array maps 1:1 to what node-pty receives.

### Implications
- **cli-engine** receives `string[]` not `string` — spawn API is `pty.spawn(args[0], args.slice(1), { cwd })`
- **build-distribution** must configure electron-builder `extraResources` to copy skills folder
- **testing-strategy** unit tests feed params and assert array output — no shell mocking needed
- **Windows shell problem is fully resolved** — no shell is ever involved in command composition

## Priority
core

## Maturity
decided

## Notes
- 5 architector skills that use terminals: init, explore, decide, map, finalize
- Status is app-rendered from index.json (no terminal needed, handled by node-interaction)
- SKILL.md files live in a folder next to the app binary — manually updated before each build
- ~~Periodic update checks~~ — removed; skills are manually managed, not auto-updated
- **Cross-platform by design** — no shell, no platform-specific syntax
- **No output parsing** — just compose the args, hand to cli-engine, file-state-sync handles feedback

## Connections
- cli-engine: hands off `string[]` arg arrays to spawn terminals — spawn API updated to accept arrays
- node-interaction: receives skill + node context from tooltip buttons and top toolbar (single and multi-select)
- file-state-sync: state updates come from file watching, not from skill output
- data-layer: Status skill reads index.json directly instead of using terminal
- build-distribution: skills folder copied via `extraResources` in electron-builder config

## History
- 2026-04-15 /architector:init — mapping UI actions to architector skills by injecting SKILL.md + node context into CLI calls
- 2026-04-16 /architector:explore (cross-platform-shell) — simplified to pure command-string composition; no output parsing needed
- 2026-04-16 /architector:explore — SKILL.md bundled with app, periodic update checks from GitHub; four complete command patterns; cross-platform skill files
- 2026-04-16 /architector:decide — chose string[] arg arrays passed directly to node-pty (no shell); --append-system-prompt-file for SKILL.md; pure composeCommand function; skills path resolved at startup via app.getAppPath/process.resourcesPath; Windows shell problem fully eliminated
