# Feature Brief: Replace Consultation Chat with Consultation Terminal
_Created: 2026-04-28_

## Goal
Replace the existing `ConsultationPanel` (a custom API-based streaming chat UI) with an
xterm.js terminal pane that spawns `claude` interactively — no `-p` flag — using the same
system prompt and tool restrictions that the consultation chat currently enforces.
The panel's open/close/pin mechanics remain unchanged; only the content area changes from
a message list + input box to a live terminal. The terminal process lives for the lifetime
of the loaded project and is respawned on project change.

## Context
- **Affected renderer**: `ConsultationPanel.tsx`, `ConsultationRegion.tsx`, `EdgeTab.tsx`,
  panel-state hooks, and `MainShell.tsx`
- **Affected store**: `atriumStore.ts` — a new `consultationTerminal` slice is needed
  (`id`, `status`) separate from the existing `terminal` (skill) slice
- **Affected main/IPC**: a new `consultation:spawnTerminal` IPC channel reuses the existing
  `TerminalManager`; the existing consultation API handlers (`registerConsultationHandlers`)
  are removed (dead code once the UI is gone)
- **Affected shared**: `composeCommand.ts` or a sibling — add
  `composeConsultationCommand(projectRoot: string): string[]`
- **Terminal manager**: already ID-based and supports multiple concurrent sessions; no
  structural changes needed
- **No writes to `.ai-arch/`**

## CLI Command
The consultation terminal spawns:
```
claude
  --model            opus
  --permission-mode  dontAsk
  --system-prompt    <CONSULTATION_SYSTEM_PROMPT constant from systemPrompt.ts>
  --add-dir          <project.rootPath>
  --allowedTools     Read Grep Glob
```
No `-p`, no `--output-format`, no `--session-id`/`--resume`, no `--max-budget-usd`.
Model is always `opus` regardless of any selector (the `ModelSelector` component is removed).

The command builder lives in a new pure function
`composeConsultationCommand(projectRoot: string): string[]` in
`src/shared/skill/composeCommand.ts` (or a new sibling file). It imports
`CONSULTATION_SYSTEM_PROMPT` from `src/main/consultation/systemPrompt.ts` — if that import
path is not available from `@shared`, move the constant to `src/shared/consultation/`.

## Expected Behavior

**Opening the panel**
- User clicks the EdgeTab ("Chat" label, unchanged) → panel opens
- On first open after project load: `consultation:spawnTerminal` IPC is invoked with
  `{ cwd: project.rootPath }`, which calls `composeConsultationCommand(projectRoot)` and
  passes the result to `TerminalManager.spawn()`
- The returned terminal ID is stored in `consultationTerminal.id` in the Zustand store
- xterm.js mounts inside the panel and subscribes to `terminal:onData` / `terminal:onExit`
  / `terminal:onError` using that ID — identical to how `TerminalModal` does it

**Panel appearance**
- Same width as current consultation panel: `flex: 0 0 400px`
- Header row: title label only (e.g., "Consultation") — no ModelSelector, no Pin button, no
  Close button; Pin button removal is acceptable since the panel is always persistent
- xterm.js container fills the remaining height
- Terminal background override: `#20202a` (lighter than TerminalModal's `#1a1a1a`, with the
  app's dark-purple tint matching the `#15151a`–`#2a2a32` range used elsewhere)

**Panel close / auto-close timer**
- The panel can still collapse to the EdgeTab via the existing auto-close timer and
  open-unpinned behaviour (nothing changes there)
- When the panel collapses, the terminal **process keeps running** — it is NOT killed
- Re-opening the panel simply re-mounts xterm.js and resubscribes to the same terminal ID;
  prior output is NOT replayed (fresh mount, same process)

**Project change**
- When `project.rootPath` changes (user switches project):
  1. Kill existing consultation terminal via `terminal:kill` IPC (if `id` is not null)
  2. Reset `consultationTerminal` slice to `{ id: null, status: 'idle' }`
  3. On next panel open, spawn a new terminal for the new project root

**Terminal exit**
- If the claude process exits on its own (e.g., user types `/exit`):
  - `consultationTerminal.status` → `'exited'`
  - Panel shows a "Restart" button in the header that re-invokes `consultation:spawnTerminal`
    and remounts xterm.js

## Edge Cases
- **No project open**: EdgeTab is hidden or disabled when `project === null` (consistent with
  current consultation behaviour)
- **Skill terminal active**: the consultation terminal and the skill terminal modal are
  independent — both may be visible simultaneously; the consultation panel sits in the right
  rail, the skill modal overlays the canvas
- **Spawn race**: if the panel opens while a previous spawn is already in-flight
  (`status === 'spawning'`), the second open must be a no-op (guard in the spawn hook)
- **`CONSULTATION_SYSTEM_PROMPT` as argv element**: passed as a direct element in the
  `string[]` args array to node-pty (no shell), so no escaping needed; the string is ~2 KB
  which is within OS argv limits on all target platforms

## Out of Scope
- Removing the consultation IPC service (`consultationService.ts`, `claudeInvoker.ts`,
  storage, stream parser) — leave as dead code for now; remove in a separate cleanup pass
- Changing the EdgeTab label
- Session persistence/replay across restarts (process keeps running while app is open;
  restart gives a fresh session)
- Auto-opening the panel on project load (still requires the EdgeTab click)
- Any changes to the skill terminal modal or `composeCommand()` for existing skills

## Open Questions
- Should the panel auto-open (start pinned) the moment a project loads, skipping the
  EdgeTab click entirely? User said "visible all time from open project till the end" which
  could imply this, but also said "panel behaviour the same as now" (EdgeTab-gated). Lean
  toward EdgeTab-gated unless user confirms otherwise.
- `CONSULTATION_SYSTEM_PROMPT` is currently in `src/main/consultation/systemPrompt.ts`.
  It needs to be importable from `@shared` for `composeConsultationCommand`. Either move it
  to `src/shared/consultation/systemPrompt.ts` or keep it in main and build the command
  in the IPC handler instead of a shared pure function.
