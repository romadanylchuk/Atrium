# Toolbar additions & canvas-bounded popup geometry
_Completed: 2026-04-27_

## Goal
Extend the toolbar with Free Terminal, architector:new, architector:triage, and architector:audit buttons (plus a "More Status" action inside the Status popup) backed by a new non-interactive `claude -p` IPC, and confine every modal/popup to the canvas region so SidePanel and Chat columns stay visible.

## Implementation Summary
- **Skill name expansion** — Widened `SkillName` to include `'new' | 'triage' | 'audit' | 'status'`; added dispatch cases in `composeCommand`; expanded `VALID_SKILLS` in main IPC.
- **Detached `-p` runner** — New `runDetached()` in main process spawns `claude -p /architector:<skill>` via `node-pty` (binary resolved by `resolveClaudeBin()`, ANSI-stripped on exit), independent of `TerminalManager` and the single terminal slot. Wired through `IPC.skill.runDetached`, preload bridge, `DetachedRunRequest`/`DetachedRunResult` shared types, and `SkillErrorCode.RUN_FAILED`.
- **Detached-run store slice** — `detachedRuns: { audit, status }` per-skill state machine (`idle → waiting → done | error`) with BUSY dedupe, plus cross-component `lastDetachedError`. New `dispatchDetachedSkill` helper drives the slice from the renderer.
- **Canvas-region overlay host** — New `CanvasRegionHost` rendered inside `data-region="canvas"`; owns TerminalModal, StatusPanel, FinalizePanel, and DetachedResultPopup rendering via the new `toolbarOverlay` store slice. Overlays migrated from `position: fixed` (viewport) to `position: absolute; inset: 0|8px` (canvas region).
- **Toolbar reshape** — 9-button row: Free Terminal | New | Triage | Explore | Decide | Map | Audit | Status | Finalize. Free/New/Triage/Explore/Decide/Map/Finalize gated by `!switchAllowed`; Audit and Status remain clickable in parallel. Audit toggles label `Audit ↔ Waiting…` (text-only, no spinner). `lastDetachedError` surfaces on the existing `toolbar-error` line.
- **More Status** — New button inside StatusPanel that dispatches a detached `status` run; cached node list stays usable while it's in flight.
- **DetachedResultPopup** — Plain-text monospace `<pre>` (12px, `whiteSpace: pre-wrap`, `maxHeight: 60vh`, `maxWidth: 560`), independent popups for concurrent Audit + Status, Audit z-index 101 above Status z-index 100. Empty stdout still opens with a Close button.
- **Tests** — 509/509 pass. New suites: `runDetached.test.ts`, `dispatchDetachedSkill.test.ts`, `CanvasRegionHost.test.tsx`, `DetachedResultPopup.test.tsx`. Existing suites updated for 9-button layout, store-driven overlays, and `position: absolute` assertions.

## Key Decisions
- **Audit not gated by `canSwitch`** — Audit and More Status (`-p` mode) run in parallel with the regular terminal slot; only same-skill rapid clicks are deduped via the BUSY guard.
- **Plain text only, no markdown** — `-p` output is rendered verbatim in a monospace `<pre>`, matching terminal appearance.
- **No streaming, no Cancel, no toasts** — `-p` runs surface only on completion; errors flow to the existing `toolbar-error` red line, not the toast system.
- **Overlay state moved to store** — Toolbar's local `useState<ToolbarOverlayLocal>` was replaced by `toolbarOverlay` slice so CanvasRegionHost (rendered outside Toolbar) can drive popup visibility.
- **Status popup persists across panel close** — DetachedResultPopup for status renders from `detachedRuns.status.kind === 'done'` independently of the StatusPanel overlay slice.
- **Finalize fix mid-flight** — Initial implementation left Finalize enabled when `!switchAllowed`; corrected via a follow-up fix that added `disabled={!switchAllowed}` and pass-through to `tabStyle`.

## Files Changed
**Shared**
- `src/shared/skill/composeCommand.ts`
- `src/shared/skill/__tests__/composeCommand.test.ts`
- `src/shared/skill/detached.ts` (new)
- `src/shared/ipc.ts`
- `src/shared/errors.ts`

**Main process**
- `src/main/ipc/skill.ts`
- `src/main/ipc/__tests__/wiredHandlers.test.ts`
- `src/main/skill/runDetached.ts` (new)
- `src/main/skill/__tests__/runDetached.test.ts` (new)

**Preload**
- `src/preload/api.ts`
- `src/preload/index.ts`

**Renderer**
- `src/renderer/src/store/atriumStore.ts`
- `src/renderer/src/store/__tests__/atriumStore.test.ts`
- `src/renderer/src/skill/dispatchDetachedSkill.ts` (new)
- `src/renderer/src/skill/__tests__/dispatchDetachedSkill.test.ts` (new)
- `src/renderer/src/canvas/CanvasRegionHost.tsx` (new)
- `src/renderer/src/canvas/__tests__/CanvasRegionHost.test.tsx` (new)
- `src/renderer/src/shell/MainShell.tsx`
- `src/renderer/src/shell/__tests__/MainShell.test.tsx`
- `src/renderer/src/terminal/TerminalModal.tsx`
- `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx`
- `src/renderer/src/toolbar/Toolbar.tsx`
- `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx`
- `src/renderer/src/toolbar/StatusPanel.tsx`
- `src/renderer/src/toolbar/__tests__/StatusPanel.test.tsx`
- `src/renderer/src/toolbar/FinalizePanel.tsx`
- `src/renderer/src/toolbar/__tests__/FinalizePanel.test.tsx`
- `src/renderer/src/toolbar/DetachedResultPopup.tsx` (new)
- `src/renderer/src/toolbar/__tests__/DetachedResultPopup.test.tsx` (new)

## Gaps/Notes
- No `feature-docs.md` was produced; `/document-work-result` was not run for this feature, so no `mental-model.md` / `decision-log.md` / `dependency-map.md` are copied.
- One mid-implementation gap (Phase 2 mock state leakage in `wiredHandlers.test.ts`) was fixed inline with a `mockRunDetached.mockClear()` at the start of the unknown-skill test.
- One post-final-check fix landed (Finalize toolbar button disabled state) — verified separately and re-confirmed in the re-audit.
- Open questions from the brief landed at their default assumptions: Free Terminal stays project-gated; no `-p` timeout; explicit Close button only (no outside-click dismissal); text-only "Waiting…" label; 560px max-width plain-text popup.
