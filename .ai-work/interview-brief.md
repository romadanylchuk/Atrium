# Feature Brief: Sticky Node Layout + Consultation Terminal Clipboard Parity
_Created: 2026-05-13_

## Goal
Fix two independent issues in the renderer:

1. **Layout reset bug.** When any change reaches the canvas after the initial render — `.ai-arch/` file edits picked up by the watcher, architector skill writes that rewrite `.ai-arch/`, or in-app state changes — nodes the user has manually dragged snap back toward dagre-computed defaults. User-placed positions must be sticky across every re-sync path. Dagre runs only on first project open; new nodes added later drop at viewport center; the icon-only Re-layout toolbar button is the single explicit way to re-run dagre afterward.

2. **Consultation terminal clipboard.** The xterm inside `ConsultationPanel` currently pipes all keys straight to the pty, so Ctrl+C / Ctrl+V do nothing useful and multi-line pastes execute line-by-line. It must match `TerminalModal` exactly: Ctrl+C copies on selection (otherwise ^C/SIGINT to claude), Ctrl+V pastes from clipboard with bracketed-paste wrapping for multi-line, Ctrl+Shift+C swallowed when no selection, copy clears the selection.

## Context

### Issue 1 — Layout reset
- **Affected files:**
  - `src/renderer/src/canvas/useProjectSync.ts` — the bug lives here. The `prevNodesRef.current` it uses to build `existingPositions` is only ever updated from `nextRFNodes` *the effect itself wrote*. User drags travel through React Flow's `useNodesState` reducer (`Canvas.tsx:36, 86-98`) and update React Flow's internal node store, but they never reach `prevNodesRef`. So on the next project re-render the seed positions are pre-drag and overwrite live positions.
  - `src/renderer/src/canvas/Canvas.tsx` — owns the React Flow `nodes` state via `useNodesState`. Already passes `setNodes` into `useProjectSync`; needs to also pass (or otherwise expose) the current live `nodes` array so the sync can read live positions instead of a stale ref.
  - `src/renderer/src/canvas/layoutPersistence.ts` — already saves node positions on every `onNodesChange` with a 500 ms debounce; persistence is fine. The bug is purely in the in-session re-sync read path.
  - `src/renderer/src/canvas/dagreLayout.ts` — `computeDagrePositions` accepts an `existingPositions` anchor map; behavior unchanged.
- **Existing mechanisms reused:**
  - `seedPositions` (loaded from disk on project open) — already correctly seeds positions on first render after `layout.load` resolves. Keep as is.
  - `relayoutRequestId` from `useAtriumStore.triggerRelayout` — already wired to the `canvas-ctrl-relayout` button at `CanvasControls.tsx:105-114`. Keep as the single explicit re-layout trigger.
  - `useProjectSync` warning tracker (stale slug, unknown maturity, etc.) — keep.
- **What does NOT change:** layout file format (`LayoutFileV1`), the layout IPC, the dagre algorithm, the React Flow `useNodesState` reducer, or the persistence debounce intervals.

### Issue 2 — Consultation clipboard
- **Affected files:**
  - `src/renderer/src/consultation/ConsultationPanel.tsx` — the xterm creation block at lines 34-76 only wires `xterm.onData` for keystroke passthrough. Needs an `attachCustomKeyEventHandler` block analogous to `TerminalModal.tsx:56-91`.
- **Existing modules reused (no changes expected):**
  - `src/renderer/src/terminal/clipboardKeymap.ts` exports `decideClipboardAction(e, ctx)` returning `'copy-selection' | 'paste' | 'swallow' | 'passthrough'`. Its `KeymapContext.status` is typed as `TerminalStatus = 'idle' | 'spawning' | 'active' | 'exited' | 'closing'`. The consultation slice's `ConsultationTerminalStatus = 'idle' | 'spawning' | 'active' | 'exited'` is a strict subset — the keymap only branches on `status === 'active'` for paste, so consultation status passes through structurally without type widening or duplication.
  - `src/renderer/src/terminal/bracketedPaste.ts` exports `encodeBracketedPaste(text)` returning `\x1b[200~ … \x1b[201~`-wrapped text with CRLF/CR normalized to LF and any embedded markers stripped. Reuse as-is.
- **Store slice read:** `useAtriumStore.getState().consultationTerminal` gives `{ id, status }`. The handler must read from `consultationTerminal`, not `terminal`.
- **IPC reused:** `window.atrium.terminal.write(id, ArrayBuffer)` — same channel the existing `xterm.onData` already uses.

### Technical constraints
- No new dependencies.
- All work is renderer-only — no main process or IPC changes.
- Both fixes must keep passing the existing vitest suites; current tests for `useProjectSync`, `Canvas`, `ConsultationPanel`, and `MainShell` need to be updated or extended to assert the new behavior.

## Expected Behavior

### Issue 1 — Sticky positions

**First open of a project (no saved layout on disk):**
- `layout.load` returns no positions. `seedPositions` is empty.
- `useProjectSync` runs dagre for all nodes and writes their positions into React Flow.
- `layoutPersistence` saves those positions on the first `onNodesChange` tick (initial position propagation counts as a change).

**Second open of a project (saved layout exists):**
- `layout.load` returns the persisted `nodePositions`. `seedPositions` populates.
- `useProjectSync` seeds every known slug from `seedPositions`; dagre is NOT run for any of them.

**During a session — file edit, architector write, or any other project re-parse:**
- A new `ProjectState` flows into `useProjectSync` (same `projectHash`, possibly different `nodes`/`connections`).
- For every node whose slug already exists on the canvas, the position must come from React Flow's live node state — NOT from `prevNodesRef`, NOT from `seedPositions`, NOT from dagre.
- Changes that must NOT cause repositioning of existing nodes: node maturity change, node name change, node description change, connection added, connection removed, connection type changed, panel open/close, selection, hover, tooltip target change, project re-parse.

**Brand-new node slug appears (slug not in current React Flow node list and not in seed positions):**
- Place the node at viewport center. The viewport here means the React Flow current viewport center expressed in flow coordinates (use `useReactFlow().project({ x: width/2, y: height/2 })` or equivalent helper). If multiple new slugs arrive in the same tick, stack them at the same center point — user drags them apart manually.
- Do not invoke dagre, even for the new node.
- Persistence picks up the new position on the next `onNodesChange` tick (the position is a node-add change, which already routes through `onNodesChange`).

**User clicks the Re-layout toolbar button (`canvas-ctrl-relayout`):**
- Current behavior preserved: `triggerRelayout` bumps `relayoutRequestId`; `useProjectSync` clears `existingPositions` for this run and runs dagre over the entire graph. User-placed positions are intentionally overwritten — that is the explicit purpose of the button.
- After re-layout completes, layoutPersistence saves the new dagre positions; subsequent re-syncs keep them sticky again.

**Node removed (slug no longer in project):**
- Removed from React Flow and selection/tooltip state (existing behavior, keep).
- Its persisted position is removed from the layout snapshot on the next save tick (already implicit, since `saveNodes` rebuilds the positions map from the current node list).

**App restart:**
- Positions reload via `layout.load`. No behavior change from today.

### Issue 2 — Consultation clipboard

Inside `ConsultationPanel.tsx`'s xterm creation effect, before the `xterm.onData(...)` input wiring, attach a custom key event handler that calls `decideClipboardAction` with:
- `hasSelection: xterm.hasSelection() && xterm.getSelection().length > 0`
- `status: useAtriumStore.getState().consultationTerminal.status`

Handle each action exactly as `TerminalModal` does:

- **`passthrough`** — return `true`, xterm handles the key (default ^C sends as control byte, ^V is unused by xterm so nothing happens — but the keymap routes ^V to `paste` before this branch is reached).
- **`swallow`** — `e.preventDefault()`, return `false`.
- **`copy-selection`** — `e.preventDefault()`, `navigator.clipboard.writeText(selection).catch(() => {})`, `xterm.clearSelection()`, return `false`.
- **`paste`** — `e.preventDefault()`. Read `navigator.clipboard.readText()`. If empty or no `id` or status is no longer `'active'`, drop. Otherwise wrap with `encodeBracketedPaste(text)`, TextEncode, and call `window.atrium.terminal.write(id, enc.buffer)`. Return `false`.

The existing `xterm.onData` handler (`ConsultationPanel.tsx:62-65`) stays — it still passes regular keystrokes through to the pty after the custom handler returns `true`.

**Concrete cases:**
- User selects text in the consultation xterm, presses Ctrl+C → selection copied to clipboard, selection cleared, claude receives nothing.
- User presses Ctrl+C with no selection → ^C control byte passes through to claude (current `xterm.onData` behavior) and interrupts whatever claude is doing.
- User presses Ctrl+V while status is `'active'` → clipboard text is wrapped in bracketed-paste markers and written to the pty. Multi-line pastes (CR/LF/CRLF anywhere in the clipboard) are wrapped so claude treats them as a single paste, not multiple commands.
- User presses Ctrl+V while status is `'spawning'` or `'exited'` → swallowed; nothing happens. (Mirrors `TerminalModal` behavior.)
- User presses Ctrl+Shift+C with no selection → swallowed; nothing happens.

## Edge Cases

### Issue 1
- **Stale seed slug** (slug present in `seedPositions` from disk but not in the new `ProjectState.nodes`): existing warning behavior in `useProjectSync` is fine — drop the stale slug, warn once per session. No change.
- **All-identical-seed gate** (`useProjectSync.ts:96-99`): keep as is — it detects an auto-layout marker file and skips seed application so dagre runs fresh. Still relevant for the first-open path.
- **StrictMode double-invoke**: the existing single-effect dispose pattern in `Canvas.tsx:44-65` already handles double-invoke. The fix to the sync should not break this — it must remain idempotent under double-mount.
- **Project switch** (different `projectHash`): the existing tracker reset at `useProjectSync.ts:48-55` still applies. Sticky positions from project A must not leak into project B.
- **Concurrent watcher event + user drag**: if a `.ai-arch/` change arrives mid-drag, the re-sync must still preserve the in-flight drag position. React Flow's reducer gives the live position for the dragged node; the new sync read path picks that up.
- **`useNodesState` deps and re-render loops**: the new sync must not include the live `nodes` array in its effect deps in a way that re-runs the effect every time the user drags. Project, seed, and relayout trigger remain the only re-sync triggers.
- **First-render race**: `useProjectSync` runs synchronously on Canvas mount; `seedPositions` resolves later from `window.atrium.layout.load`. The existing two-pass design (`tracker.seedApplied` flag) handles this and must continue to work — on first pass `prevNodesRef` is empty so dagre runs; on second pass `seedPositions` overrides dagre output, then on every subsequent pass live positions win.

### Issue 2
- **`navigator.clipboard` permission denied or unavailable**: both `writeText` and `readText` calls already use `.catch(() => {})` in `TerminalModal`. Mirror that — silent failure, no toast, no console error. (Electron grants clipboard access by default; this is defensive.)
- **`status === 'spawning'`**: paste is swallowed, copy is allowed (since selection only exists once the xterm is rendered with content). Match `TerminalModal`.
- **`status === 'exited'`**: paste is swallowed. Copy still works (user may want to grab the exit message). Match `TerminalModal`.
- **`id === null`**: paste short-circuits (no terminal to write to). Already covered by the keymap's status guard but defend in the paste branch too.
- **Empty clipboard or whitespace-only**: `encodeBracketedPaste` already returns empty for empty input; the paste branch already short-circuits on empty.
- **Bracketed-paste-marker injection in clipboard text**: `encodeBracketedPaste` already strips embedded `\x1b[200~` / `\x1b[201~` sequences from the input. Reuse — no new sanitization needed.
- **Right-click in the xterm**: do nothing special. Browser default (which xterm intercepts) stands. No new context menu.

## Out of Scope
- Do NOT change the layout file format, the layout IPC, or the dagre algorithm.
- Do NOT add a new toolbar button, dialog, or settings toggle for layout behavior. The single Re-layout icon stays unchanged.
- Do NOT add a confirmation dialog to the Re-layout button.
- Do NOT touch the main `TerminalModal` clipboard code. The consultation clipboard reuses the existing modules verbatim.
- Do NOT add a right-click context menu to either terminal.
- Do NOT change how `consultationTerminal.status` transitions or how the spawn hook works.
- Do NOT remove the now-dead consultation service files (still listed as deferred from the prior feature).
- Do NOT touch `composeConsultationCommand` or any IPC.

## Open Questions
None.
