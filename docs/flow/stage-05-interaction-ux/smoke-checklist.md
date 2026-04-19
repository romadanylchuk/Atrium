# Stage 5 — Interaction UX: Cross-Platform Smoke Checklist

Manual verification scenarios. Run on each target platform: **Windows**, **macOS**, **Linux**.

Mark each cell: `pass` / `fail` / `skip` (with reason).

---

## Platforms

| Scenario | Windows | macOS | Linux |
|---|---|---|---|
| 1. Boot → gate → health → recents | | | |
| 2. Open via dialog → canvas | | | |
| 3. Node click → tooltip near edge | | | |
| 4. Right-click select → selection panel | | | |
| 5. Explore (no selection) → terminal modal → xterm → kill → close | | | |
| 6. Finalize button → status panel → continue → terminal | | | |
| 7. New-project form → init skill → .ai-arch/ created → canvas | | | |
| 8. Switch project via side panel (idle terminal) | | | |
| 9. Terminal guard blocks switch during active terminal | | | |
| 10. Fullscreen toggle in modal | | | |
| 11. Escape dismisses tooltip | | | |
| 12. Escape closes modal only when exited | | | |

---

## Scenario Detail

### 1. Boot → gate → health → recents

- Launch the app from cold start (no cached project).
- Expect: `LaunchGate` dialog visible, health check runs automatically (spinner then checkmark/error), recent projects list populated if any.

### 2. Open via dialog → canvas

- Click **Open** in the gate.
- Pick a directory that contains `.ai-arch/`.
- Expect: gate dismisses, canvas renders nodes with correct shapes and colors.

### 3. Node click → tooltip near canvas edges

- Open a project with multiple nodes.
- Click a node positioned near the right edge of the canvas.
- Expect: tooltip opens on the *left* side of the node.
- Click a node near the bottom edge.
- Expect: tooltip is top-aligned (does not clip below viewport).

### 4. Right-click select → selection panel replaces project panel

- Right-click (or use the select mechanism) on a node.
- Expect: side panel switches from "Project Panel" to "Selection Panel" listing that node.
- Deselect the node.
- Expect: side panel returns to "Project Panel".

### 5. Explore (no selection) → terminal modal → xterm → kill → close

- With no nodes selected, click **Explore** in the toolbar.
- Expect: terminal modal opens, xterm renders and shows output from `claude`.
- Click **Kill**.
- Expect: terminal transitions to `exited` state, kill button disables/changes label.
- Click **Close**.
- Expect: modal dismisses, toolbar skill buttons re-enable.

### 6. Finalize button → status panel → continue → terminal

- Click **Finalize** in toolbar.
- Expect: FinalizePanel overlay appears with summary.
- Click **Continue**.
- Expect: terminal modal opens and runs finalize skill.

### 7. New-project form → init skill → .ai-arch/ created → canvas loads

- Open a directory that does *not* contain `.ai-arch/`.
- Expect: gate transitions to NewProjectForm.
- Fill in the form and submit.
- Expect: terminal modal opens for `init` skill, and after completion `.ai-arch/` exists and canvas loads the new project.

### 8. Switch project via side panel (idle terminal)

- With a project loaded and terminal idle, click a recent project in the side panel.
- Expect: canvas re-renders with the new project, no error.

### 9. Terminal guard prevents switch during active terminal

- With a skill terminal active (spawning or active state), attempt to switch project.
- Expect: switch is blocked — error message or toast appears, current project remains loaded.

### 10. Fullscreen toggle in modal

- Open terminal modal.
- Click the **Fullscreen** toggle.
- Expect: modal expands to cover the full window.
- Click toggle again.
- Expect: modal returns to normal size.

### 11. Escape dismisses tooltip

- Open a node tooltip.
- Press **Escape**.
- Expect: tooltip closes, no terminal spawned.

### 12. Escape closes modal only when exited

- With a terminal modal open in `active` state, press **Escape**.
- Expect: modal remains open (escape blocked while active).
- Kill the terminal (`exited` state).
- Press **Escape**.
- Expect: modal closes.
