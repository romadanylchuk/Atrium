# Feature Brief: Toolbar additions & canvas-bounded popup geometry
_Created: 2026-04-26_

## Goal
Extend the Atrium toolbar with four new actions (Free Terminal, architector:new, architector:triage, architector:audit) and a "More Status" action inside the existing Status popup. Add infrastructure for non-interactive `claude -p` runs whose results display in a separate popup. Reshape all modal/popup geometry so the Chat panel (and SidePanel) stay visible: every popup must be confined to the canvas region only and must not overlap chat or side-panel columns.

## Context

**Affected systems:**
- `src/renderer/src/toolbar/Toolbar.tsx` — add four new tab buttons, change ordering.
- `src/renderer/src/toolbar/StatusPanel.tsx` — add "More Status" button + result popup.
- `src/renderer/src/toolbar/` — new `AuditPanel` (or equivalent) for Audit result popup.
- `src/renderer/src/terminal/TerminalModal.tsx` — replace full-viewport `position: fixed; inset: 5vh 5vw` overlay with canvas-region-bounded geometry.
- `src/renderer/src/toolbar/FinalizePanel.tsx` — same geometry change.
- `src/renderer/src/shell/MainShell.tsx` — provide a canvas-region anchor / bounding rect that popups can position against.
- `src/shared/skill/composeCommand.ts` — extend `SkillName` with `'new'`, `'triage'`, `'audit'`; add command composition for each.
- `src/main/ipc/skill.ts` — extend `VALID_SKILLS` set; wire the new skills.
- `src/main/ipc/` — **new IPC channel** for non-interactive `claude -p` runs (request → captured stdout / error). Independent of the existing single-slot terminal pipeline.
- `src/main/terminal/` — implementation of `-p` runs (likely a one-shot spawn similar to `healthCheck.ts`, not via `TerminalManager`).
- `src/preload/api.ts`, `src/preload/index.ts` — surface the new `-p` IPC to the renderer.
- `src/renderer/src/store/atriumStore.ts` — track per-skill `-p` run state (idle / waiting / done / error) for duplicate prevention and button disabled-state.
- `src/renderer/src/skill/dispatchSkill.ts` — extend or split for `-p` dispatch path.

**Existing mechanisms used:**
- `composeCommand()` already supports a `'free'` skill that returns `['claude']` — the Free Terminal button reuses this.
- The single-terminal-slot lifecycle (`idle → spawning → active → exited → idle`) and `canSwitch()` gating are unchanged for interactive skills.
- The toolbar's existing red error line (`data-testid="toolbar-error"`) is the surface for `-p` errors.
- Existing toast system is **not** used for `-p` errors.

**Technical constraints:**
- `-p` runs must run in parallel with regular terminals — they do not occupy the single terminal slot.
- Per-skill duplicate prevention: only one Audit `-p` run at a time and only one Status `-p` run at a time, but Audit + Status can run concurrently.
- All popups must stay strictly inside the canvas region (not over SidePanel column, not over Chat column). When Chat is closed (EdgeTab visible), popups still stay only over the canvas region.

## Expected Behavior

### Toolbar
- Buttons appear in this order, left to right: **Free Terminal | New | Triage | Explore | Decide | Map | Audit | Status | Finalize**.
- "Free Terminal", "New", "Triage" follow the existing skill-button pattern (block switching when terminal is active, use the single terminal slot).
- "Audit" runs in parallel: clicking it does **not** spawn an interactive terminal; it dispatches a non-interactive `-p` run.

### Free Terminal button
- Click → `dispatchSkill({ skill: 'free', cwd: project.rootPath })`.
- Spawns `claude` with no slash command in the existing terminal modal.
- Disabled when `canSwitch(terminalStatus) === false` (same as Explore/Decide/Map).

### architector:new button
- Click → `dispatchSkill({ skill: 'new', cwd: project.rootPath })`.
- `composeCommand` returns `['claude', '/architector:new']` — no node slugs, no prompt arg.
- **Always enabled** when a project is loaded, even if the project already has nodes (the skill can add new nodes later).
- Disabled when `canSwitch(terminalStatus) === false` (single-slot rule still applies).

### architector:triage button
- Click → `dispatchSkill({ skill: 'triage', nodes: selectedNodes, cwd: project.rootPath })`.
- `composeCommand` returns `['claude', '/architector:triage' + (slugs ? ' ' + slugs.join(' ') : '')]` — selected nodes are optional, same pattern as Map.
- Disabled when `canSwitch(terminalStatus) === false`.

### architector:audit button (`-p` mode)
- Click → dispatches a non-interactive `claude -p /architector:audit` run.
- While running: the Audit button itself shows "Waiting…" label (or equivalent visual) and is disabled.
- Audit button is **not** gated by `canSwitch` — it runs in parallel with any active regular terminal.
- On success: a new popup opens, centered over the canvas region, displaying the captured stdout as plain text (no markdown rendering), with a close button. Same visual style as existing modal popups.
- On error: the existing red error line under the toolbar tabs displays the error message; popup does not open; the button re-enables so the user can retry.

### More Status button (inside existing Status popup)
- A new button is added inside `StatusPanel.tsx`.
- Click → dispatches a non-interactive `claude -p /architector:status` run.
- While running: the More Status button shows "Waiting…" and is disabled. The rest of the Status popup (cached node list) remains visible and usable.
- Runs in parallel with the regular terminal slot and with an Audit run.
- On success: a separate popup opens (does **not** replace the Status popup), centered over the canvas region, with the captured stdout as plain text and a close button.
- On error: the existing toolbar red error line displays the message; the button re-enables for retry.

### `-p` IPC infrastructure
- A new main-process IPC channel runs `claude` with `['-p', '/architector:<skill>']` non-interactively.
- Captures stdout (and stderr on failure) and resolves with a `Result<string, ErrorCode>`.
- One-shot spawn similar to `healthCheck.ts` — does not touch `TerminalManager`, does not allocate a `TerminalId`, does not occupy the single terminal slot.
- Renderer-side state tracks `idle | waiting | done | error` per `-p` skill (one slot per skill name) for duplicate prevention.

### Popup geometry (all modals)
- Applies to: Terminal modal, StatusPanel, Audit result popup, "More Status" result popup, FinalizePanel.
- Each popup is positioned within the **canvas region only** — bounded by the canvas DOM rect, not by the viewport.
- The popup's overlay (the dimmed background) is also confined to the canvas region; SidePanel and Chat are not dimmed.
- Behavior is identical whether Chat is open, closed (EdgeTab), or pinned — popups never expand into chat or sidepanel columns.

## Edge Cases

- **Project not loaded**: all toolbar buttons except Free Terminal behave as today (skill buttons require a project). Free Terminal is allowed to spawn even without `.ai-arch/`? — **Open Question**, see below.
- **Single-slot blocked**: If a regular terminal is `active` or `spawning`, all interactive skill buttons (Free Terminal, New, Triage, Explore, Decide, Map, Finalize) are disabled. Audit and More Status (`-p` mode) remain clickable.
- **Audit clicked twice quickly**: second click is a no-op while first is in flight (button is disabled).
- **More Status clicked twice quickly**: same — second click is a no-op while first is in flight.
- **Audit + More Status concurrent**: both run, both show "Waiting…" on their own buttons, both produce independent result popups.
- **`-p` run errors**:
  - Non-zero exit code → toolbar red error line shows the captured stderr or a generic message; no popup opens; button re-enables.
  - Spawn failure (e.g., `claude` not on PATH) → same surface, generic error.
  - Timeout (if implemented) → same surface.
- **`-p` result popup with empty stdout**: still open the popup, show empty content with close button (treat as success).
- **Close behavior of `-p` result popups**: same as existing modals — close button + Escape key + clicking outside (if outside-click-to-close is the existing pattern; otherwise just close button + Escape).
- **Triage with no selected nodes**: command runs as `claude /architector:triage` (no slugs appended), same as Map's existing behavior.
- **architector:new with project loaded that has existing nodes**: button still enabled; the skill itself decides what to do with existing nodes.
- **Window resize while popup open**: popup re-bounds to the new canvas region rect.
- **Canvas region is unusually small** (e.g., user shrunk window aggressively): popup still confines itself to whatever the canvas region rect is; no minimum-size enforcement specified.
- **Multiple `-p` runs queued by rapid clicks across different buttons**: Audit + More Status are independent; rapid identical clicks are deduped per button via the disabled state.
- **Free Terminal exit**: same behavior as other terminals — modal shows "(exited)" and waits for Close / Escape.

## Out of Scope

- Markdown rendering of `-p` output. Output is shown as plain text exactly as it would appear in the terminal.
- A "Cancel" button while a `-p` run is in progress. The button stays disabled until the run completes or errors out.
- Toasts for `-p` errors. The existing toolbar red error line is the only error surface.
- Streaming live output for `-p` runs. Output is captured fully and shown only when the run completes.
- Resizable terminal-area divider / dock-style layout. Popups remain centered modals (just confined to the canvas region).
- Replacing the canvas with an embedded (non-modal) terminal panel. Terminal stays a popup.
- Side-panel changes. SidePanel layout/visibility is unchanged.
- Changes to existing skills (`init`, `explore`, `decide`, `map`, `finalize`) beyond ordering and the geometry change to FinalizePanel.
- Hiding SidePanel or Chat to expand popup width. Popups are always bounded to the canvas region only.
- Per-`-p`-skill timeout values. (Mentioned in edge cases but not specified — see Open Questions.)

## Open Questions

- **Free Terminal availability without a project**: today the toolbar tabs require `project` to be set (`if (!project) return;` in `handleSkill`). Should Free Terminal be allowed pre-project (e.g., from the launch gate) for ad-hoc `claude` use, or stay project-gated like other skills? Default assumption: project-gated, same as today.
- **Timeout for `-p` runs**: should there be a default timeout (e.g., 60s, 5min) after which the run is killed and surfaced as an error? Default assumption: no explicit timeout — rely on `claude -p` to terminate naturally.
- **Outside-click dismissal of `-p` result popups**: existing modals (StatusPanel, FinalizePanel) close only via the explicit Close button. Apply the same to new popups, or also support outside-click? Default assumption: explicit Close button only, matching existing behavior.
- **Visual indicator for "Waiting…" state on the Audit toolbar button**: text replacement ("Audit" → "Waiting…"), spinner glyph, or both? Default assumption: text-only "Waiting…" inside the same button to keep consistent with existing toolbar style.
- **Where exactly the `-p` result popup is anchored**: centered over the canvas region (same as other popups) — confirmed. But should it also respect a maximum width / max height (e.g., the existing 560px max for StatusPanel) or scale freely with the canvas region? Default assumption: similar 560px max width with scrollable body, plain text monospace.
- **Selected nodes for Triage**: take all currently selected nodes (the `Set<string> selectedNodes`), same shape as Map. Confirmed.
