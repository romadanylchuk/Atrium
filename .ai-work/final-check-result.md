# Final Check: Toolbar additions & canvas-bounded popup geometry
_Date: 2026-04-26 (re-audit)_

## Status: DONE

## Verified

### Toolbar
- [x] 9-button row in exact order: Free Terminal | New | Triage | Explore | Decide | Map | Audit | Status | Finalize (`src/renderer/src/toolbar/Toolbar.tsx:84-204`)
- [x] Free Terminal click → `dispatchSkill('free', cwd)`; project-gated; disabled by `!switchAllowed` (`Toolbar.tsx:84-96`)
- [x] architector:new → `dispatchSkill('new')`; no slugs/prompt; `composeCommand` returns `['claude','/architector:new']` (`composeCommand.ts:26-28`)
- [x] architector:triage → `dispatchSkill('triage')` with optional selected node slugs (Map shape) (`composeCommand.ts:30-33`)
- [x] architector:audit → `dispatchDetachedSkill({skill:'audit'})`; NOT gated by `switchAllowed`; label toggles `Audit` ↔ `Waiting…`; runs in parallel (`Toolbar.tsx:168-177`)
- [x] Audit "Waiting…" text-only label (no spinner) per decision §6
- [x] Free/New/Triage/Explore/Decide/Map/**Finalize** disabled by `!switchAllowed`; Audit + Status remain clickable (Finalize fix applied at `Toolbar.tsx:196`)
- [x] `effectiveError = error ?? lastDetachedError?.message` drives `toolbar-error` paragraph (`Toolbar.tsx:33,207-215`)

### -p IPC infrastructure
- [x] `IPC.skill.runDetached = 'skill:runDetached'` channel registered (`src/main/ipc/skill.ts:49-59`)
- [x] `runDetached()` (`src/main/skill/runDetached.ts`) spawns `claude` with `['-p', '/architector:<skill>']` via node-pty
- [x] Resolves claude binary via `resolveClaudeBin()` with `ATRIUM_E2E_CLAUDE_BIN` override mirroring `healthCheck.ts`
- [x] ANSI-strip on exit; resolves `Result<DetachedRunResult, SkillErrorCode>`
- [x] **Invariant verified**: `runDetached.ts` does NOT import `TerminalManager` (only one comment reference, no `import`)
- [x] `SkillErrorCode.RUN_FAILED` added in `src/shared/errors.ts:118`
- [x] Preload bridge `window.atrium.skill.runDetached(req)` wired in `src/preload/index.ts:180-182`

### Detached-run store slice
- [x] `detachedRuns: Record<DetachedSkillName, DetachedRunState>` initialised to `{audit:idle, status:idle}` (`atriumStore.ts:185, 293`)
- [x] `lastDetachedError` cross-component error channel (`atriumStore.ts:186, 294`)
- [x] `startDetachedRun` returns `err('BUSY')` if already waiting (dedupe) (`atriumStore.ts:490-499`)
- [x] `setDetachedRunError` writes both slice and `lastDetachedError` (`atriumStore.ts:510-518`)
- [x] `closeDetachedResult` (done → idle) and `clearDetachedRunError` (error → idle, clears `lastDetachedError` only on matching skill) (`atriumStore.ts:520-532`)
- [x] Slice independent of `terminal`; does not gate `canSwitch()`

### Popup geometry (canvas-bounded)
- [x] `CanvasRegionHost` rendered inside `data-region="canvas"` wrapper with `position:relative` (`MainShell.tsx:18-25`)
- [x] `<TerminalModal/>` removed from MainShell root; rendered through CanvasRegionHost
- [x] TerminalModal overlay: `position:'absolute'`, `inset: fullscreen ? 0 : '8px'` (`TerminalModal.tsx:225-226`)
- [x] StatusPanel and FinalizePanel overlays: `position:'absolute'; inset:0` (no longer `position:fixed`)
- [x] DetachedResultPopup overlay: `position:'absolute'; inset:0`
- [x] Toolbar overlay state migrated from local `useState` to `toolbarOverlay` store slice (decision §5)
- [x] Tests confirm popups land inside `data-region="canvas"` subtree via `closest('[data-region="canvas"]')`

### More Status button (in StatusPanel)
- [x] `status-panel-more` testid present, toggles to `Waiting…` when `detachedRuns.status.kind === 'waiting'` (`StatusPanel.tsx:93-103`)
- [x] Click → clears prior status error, then `dispatchDetachedSkill({skill:'status', cwd: project.rootPath})`
- [x] Cached node list above remains visible/usable while More Status is in flight

### Detached result popups
- [x] `DetachedResultPopup` renders `<pre>` with `whiteSpace:'pre-wrap'`, `fontFamily:'monospace'`, `fontSize:12`, `maxHeight:'60vh'`, `maxWidth:560` — plain text only, no markdown
- [x] Empty stdout still opens popup with Close button
- [x] Audit popup `zIndex:101` overlays Status panel/popup `zIndex:100` so concurrent runs let user dismiss audit first
- [x] Independent popups for concurrent Audit + More Status (CanvasRegionHost renders both)
- [x] Status result popup persists even if user closes the StatusPanel (rendered from `detachedRuns.status.kind === 'done'`, not gated on overlay slice)

### Edge cases
- [x] Audit/More Status clicked twice quickly → BUSY guard + button disabled
- [x] Audit + More Status concurrent → independent slice keys, both produce visible popups
- [x] -p non-zero exit → `RUN_FAILED` with last-line message → `toolbar-error` (not toast)
- [x] -p spawn failure / claude not on PATH → `RUN_FAILED` with diagnostic message
- [x] Triage with no selected nodes → `['claude','/architector:triage']` (empty slug)
- [x] New with project that already has nodes → button stays enabled; skill decides
- [x] Project not loaded → `handleSkill` and `handleAudit` short-circuit on `!project` (Free Terminal stays project-gated per decision)
- [x] Window resize → CSS-only (`position:absolute; inset:0` inside flex parent), no JS recompute
- [x] Free Terminal exit → reuses TerminalModal exited state with Close/Escape

### Out of scope (confirmed not implemented)
- [x] No markdown rendering of -p output
- [x] No Cancel button for in-flight -p runs
- [x] No toasts for -p errors (uses `toolbar-error` line)
- [x] No streaming -p output
- [x] SidePanel unchanged
- [x] No Free-Terminal-without-project allowance
- [x] No outside-click dismissal of -p popups

### Test suite
- [x] 509/509 tests pass across feature areas (`src/renderer/src/{toolbar,skill,store,canvas,shell,terminal}`, `src/main/{skill,ipc}`, `src/shared/skill`)
- [x] Finalize-disabled-when-active test now asserts the toolbar button is disabled (`Toolbar.test.tsx`)

## Issues
None.

## Regressions
None found.
