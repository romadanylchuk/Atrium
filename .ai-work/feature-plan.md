# Plan: Toolbar additions & canvas-bounded popup geometry
_Brief: `.ai-work/interview-brief.md`_
_Created: 2026-04-26_

## Overview
Extend the Atrium toolbar with four new buttons (Free Terminal, architector:new, architector:triage, architector:audit) and a "More Status" action inside the existing Status popup, reorder the tab row to `Free Terminal | New | Triage | Explore | Decide | Map | Audit | Status | Finalize`, add a non-interactive `claude -p` IPC pipeline so Audit and More Status can run in parallel with the single-slot terminal, and reshape every popup (TerminalModal, StatusPanel, FinalizePanel, Audit/Status result popups) so it stays strictly inside the canvas region — never overlapping SidePanel or Chat columns.

## Affected Files

| File | Change Type | Reason |
|------|-------------|--------|
| `src/shared/skill/composeCommand.ts` | modify | Extend `SkillName` with `'new' \| 'triage' \| 'audit'`; add command composition. |
| `src/shared/skill/__tests__/composeCommand.test.ts` | modify | Cover the three new skills. |
| `src/main/ipc/skill.ts` | modify | Add the new skills to `VALID_SKILLS`. |
| `src/main/ipc/__tests__/wiredHandlers.test.ts` | modify | Cover newly wired skills + new `skill:runDetached` channel. |
| `src/main/skill/runDetached.ts` | create | One-shot `claude -p /architector:<skill>` runner; captures stdout/stderr; resolves with `Result<DetachedRunResult, DetachedRunErrorCode>`. Independent of `TerminalManager`. |
| `src/main/skill/__tests__/runDetached.test.ts` | create | Unit tests for the runner (success, non-zero exit, spawn failure, multiple concurrent calls). |
| `src/main/ipc/skill.ts` | modify | Register a second handler for `IPC.skill.runDetached`. |
| `src/shared/ipc.ts` | modify | Add `skill.runDetached` channel constant. |
| `src/shared/errors.ts` | modify | Extend `SkillErrorCode` with `RUN_FAILED` (covers spawn failures, non-zero exit, no-claude-on-PATH, and INVALID_SKILL is reused). |
| `src/shared/skill/detached.ts` | create | Shared types: `DetachedSkillName = 'audit' \| 'status'`, `DetachedRunRequest`, `DetachedRunResult`. |
| `src/preload/api.ts` | modify | Add `skill.runDetached(req)` to the `AtriumAPI` surface. |
| `src/preload/index.ts` | modify | Wire `skill.runDetached` to `ipcRenderer.invoke(IPC.skill.runDetached, …)`. |
| `src/renderer/src/store/atriumStore.ts` | modify | Add `detachedRuns` slice + actions (`startDetachedRun`, `setDetachedRunResult`, `setDetachedRunError`, `closeDetachedResult`); keep these orthogonal to the single-slot terminal. |
| `src/renderer/src/store/__tests__/atriumStore.test.ts` | modify | Cover the new slice transitions. |
| `src/renderer/src/skill/dispatchDetachedSkill.ts` | create | Renderer-side helper that calls the IPC, updates the store slice, and surfaces success/error. |
| `src/renderer/src/skill/__tests__/dispatchDetachedSkill.test.ts` | create | Cover happy path, error path, dedupe. |
| `src/renderer/src/canvas/CanvasRegionHost.tsx` | create | Renders inside the canvas column with `position: relative`; hosts all canvas-bounded popups (TerminalModal, StatusPanel, FinalizePanel, AuditResultPopup, StatusResultPopup) using `position: absolute; inset: 0` overlays. |
| `src/renderer/src/shell/MainShell.tsx` | modify | Wrap `<Canvas />` in the new `CanvasRegionHost` container; remove `<TerminalModal />` from the shell root. |
| `src/renderer/src/shell/__tests__/MainShell.test.tsx` | modify | Assert popups render inside the canvas column, not at the shell root. |
| `src/renderer/src/terminal/TerminalModal.tsx` | modify | Drop `position: fixed; inset: 5vh 5vw`; use `position: absolute; inset: <canvas-bounded-margin>`; same fullscreen toggle now expands inside the canvas region (still bounded). |
| `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx` | modify | Update geometry assertions; assert popup is inside `CanvasRegionHost`. |
| `src/renderer/src/toolbar/StatusPanel.tsx` | modify | Drop `position: fixed`; switch to `position: absolute; inset: 0` overlay + centered card. Add "More Status" button (dispatches `'status'` detached skill, shows "Waiting…" while running). |
| `src/renderer/src/toolbar/__tests__/StatusPanel.test.tsx` | modify | Cover the new button + waiting state. |
| `src/renderer/src/toolbar/FinalizePanel.tsx` | modify | Same geometry change as StatusPanel. |
| `src/renderer/src/toolbar/__tests__/FinalizePanel.test.tsx` | modify | Geometry assertion update (if file exists; otherwise create minimal coverage). |
| `src/renderer/src/toolbar/DetachedResultPopup.tsx` | create | Shared popup for Audit/Status `-p` output: 560px max width, scrollable monospace body, plain text, Close button. |
| `src/renderer/src/toolbar/__tests__/DetachedResultPopup.test.tsx` | create | Render, close, empty-stdout, error-not-shown. |
| `src/renderer/src/toolbar/Toolbar.tsx` | modify | Reorder buttons; add Free Terminal/New/Triage/Audit; convert `overlay` from local `useState` to the existing `toolbarOverlay` store slice; surface detached errors on the existing red error line; show "Waiting…" on Audit while in flight. |
| `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx` | modify | Cover reorder, new buttons, dispatch wiring (interactive vs detached), waiting state, error surface. |

## Changed Contracts

### `SkillName` (src/shared/skill/composeCommand.ts)
Before:
```ts
export type SkillName = 'init' | 'explore' | 'decide' | 'map' | 'finalize' | 'free';
```
After:
```ts
export type SkillName =
  | 'init' | 'explore' | 'decide' | 'map' | 'finalize' | 'free'
  | 'new' | 'triage' | 'audit';
```
Consumers to update: `composeCommand` (handles cases), `VALID_SKILLS` set in `src/main/ipc/skill.ts`, `composeCommand.test.ts`. The renderer side imports the type by name only (`import type { SkillName } from '@shared/skill/composeCommand'`); no further consumer needs explicit changes for the union widening, but Toolbar's `TabName` uses `SkillName` and naturally absorbs the new members.

### `composeCommand` (same file)
New cases:
```ts
// 'new' — no slugs, no prompt
return ['claude', '/architector:new'];

// 'triage' — optional list of slugs (same shape as map)
const slugs = p.nodes && p.nodes.length > 0 ? ` ${p.nodes.join(' ')}` : '';
return ['claude', `/architector:triage${slugs}`];

// 'audit' — interactive form is unused, but keep symmetric for tests / future
return ['claude', '/architector:audit'];
```
**Note:** `'audit'` exists in `SkillName` only so the IPC's `VALID_SKILLS` check accepts the renderer's detached-run requests routed through a future shared validator. The Audit toolbar button never goes through `dispatchSkill` / interactive `composeCommand` — it goes through `dispatchDetachedSkill`, which builds `['-p', '/architector:audit']` directly inside `runDetached.ts`. We keep the case in `composeCommand` purely for symmetry & to cover the `INVALID_SKILL` path consistently in `runDetached`'s validation.

### Detached-run types (src/shared/skill/detached.ts — new)
```ts
import type { SkillName } from './composeCommand';
import type { Result } from '../result';

export type DetachedSkillName = Extract<SkillName, 'audit' | 'status'>;
// Only 'audit' and 'status' are dispatched as -p runs. Other architector skills
// stay interactive. Adding new detached skills means widening this Extract<>.
// Note: 'status' requires adding it to SkillName. See decision §1.

export interface DetachedRunRequest {
  skill: DetachedSkillName;
  cwd: string;
}

export interface DetachedRunResult {
  exitCode: number;          // always 0 on the success path
  stdout: string;            // captured, ANSI-stripped
}
```

### `SkillErrorCode` (src/shared/errors.ts)
Add `RUN_FAILED: 'RUN_FAILED'` (covers `claude -p` non-zero exit, spawn failure, claude-not-found). Existing `INVALID_SKILL`, `COMPOSE_FAILED`, `SPAWN_FAILED` retained for the interactive path.

### `IPC` (src/shared/ipc.ts)
Add:
```ts
skill: {
  spawn: 'skill:spawn',
  runDetached: 'skill:runDetached',
}
```

### `AtriumAPI.skill` (src/preload/api.ts)
Add:
```ts
skill: {
  spawn(req: SkillSpawnRequest): Promise<Result<TerminalId, SkillErrorCode>>;
  runDetached(req: DetachedRunRequest): Promise<Result<DetachedRunResult, SkillErrorCode>>;
};
```

### `runDetached` (src/main/skill/runDetached.ts — new)
```ts
export const RUN_DETACHED_TIMEOUT_MS: number | null = null; // see decision §3

export async function runDetached(
  req: DetachedRunRequest,
): Promise<Result<DetachedRunResult, SkillErrorCode>>;
```
Behavior:
- Resolve `claude` binary via `resolveClaudeBin()` (mirrors `healthCheck.ts`); honor `ATRIUM_E2E_CLAUDE_BIN`.
- Spawn `claude` (resolved abs path) with args `['-p', `/architector:${req.skill}`]`, cwd = `req.cwd`, no shell, via `node-pty`.
  - Rationale for `node-pty` (matches `healthCheck.ts`): consistent binary resolution semantics, works across platforms, no shim issues on Windows.
- Accumulate stdout via `pty.onData`. ANSI-strip with the same regex used in `healthCheck.ts`.
- On `pty.onExit`:
  - exitCode === 0 → resolve `ok({ exitCode: 0, stdout: cleaned })`.
  - exitCode !== 0 → resolve `err(SkillErrorCode.RUN_FAILED, <last-line-of-stdout || 'claude -p exited with code N'>)`.
- On spawn error (try/catch around `ptySpawn`) → resolve `err(SkillErrorCode.RUN_FAILED, <message>)`.
- On unresolvable claude binary → resolve `err(SkillErrorCode.RUN_FAILED, "'claude' not on PATH")`.
- **Invariant:** must NEVER touch `TerminalManager`, must not consume the single terminal slot, must not emit on `IPC.terminal.*` channels.

### `AtriumStore.detachedRuns` slice (src/renderer/src/store/atriumStore.ts)
```ts
type DetachedRunState =
  | { kind: 'idle' }
  | { kind: 'waiting'; startedAt: number }
  | { kind: 'done'; output: string; finishedAt: number }
  | { kind: 'error'; message: string; finishedAt: number };

type DetachedSlice = Record<DetachedSkillName, DetachedRunState>;

// store fields
detachedRuns: DetachedSlice;
startDetachedRun: (skill: DetachedSkillName) => Result<void, 'BUSY'>;
setDetachedRunResult: (skill: DetachedSkillName, output: string) => void;
setDetachedRunError: (skill: DetachedSkillName, message: string) => void;
closeDetachedResult: (skill: DetachedSkillName) => void; // 'done' → 'idle'
clearDetachedRunError: (skill: DetachedSkillName) => void; // 'error' → 'idle'
```
- `startDetachedRun` returns `err('BUSY')` if current state is `'waiting'` (dedupe; second click is a no-op).
- The slice is initialised to `{ audit: { kind: 'idle' }, status: { kind: 'idle' } }`.
- The slice is **independent** of `terminal` — does not block project switching, does not gate `canSwitch()`.

### `dispatchDetachedSkill` (src/renderer/src/skill/dispatchDetachedSkill.ts — new)
```ts
export async function dispatchDetachedSkill(req: {
  skill: DetachedSkillName;
  cwd: string;
}): Promise<Result<DetachedRunResult, SkillErrorCode | 'BUSY'>>;
```
Behavior:
1. Call `useAtriumStore.getState().startDetachedRun(req.skill)` — returns `err('BUSY')` if already in flight.
2. Call `window.atrium.skill.runDetached(req)`.
3. On `ok` → `setDetachedRunResult(skill, stdout)`; return ok.
4. On `err` → `setDetachedRunError(skill, message)`; return err.

## Decision Log

### §1 — Add `'status'` and `'audit'` to `SkillName`
**Decision:** Extend `SkillName` to include `'new'`, `'triage'`, `'audit'`, `'status'`. The detached-run union is `DetachedSkillName = Extract<SkillName, 'audit' | 'status'>` — only those two are routed through `runDetached`.
**Alternatives:**
- Keep `'status'`/`'audit'` out of `SkillName` and use a separate string union — but then `runDetached` can't share `composeCommand`'s validation centrally. `'new'`/`'triage'` must already be in `SkillName` to flow through `dispatchSkill`/`composeCommand`; aligning the detached pair with the same union avoids two parallel namespaces.
**Why this approach:** single source of truth for skill names; `VALID_SKILLS` covers all of them; the `composeCommand` "interactive form" for `'status'`/`'audit'` is unused at runtime but is exercised by tests for symmetry.

### §2 — `node-pty` (not `child_process.spawn`) for `runDetached`
**Decision:** Use `node-pty` mirroring `healthCheck.ts`.
**Alternatives:**
- `child_process.spawn` would be simpler and would cleanly capture stdout/stderr separately.
- `execFile` would block.
**Why this approach:** `claude` is sometimes a `.cmd` shim on Windows that fails when launched via `child_process` without `shell: true` (and `shell: true` opens command-injection risk for arbitrary args). Reusing the `resolveClaudeBin` + `node-pty` path keeps platform behavior identical to the proven `healthCheck.ts` and avoids re-litigating the shell-quoting question. ANSI-stripping is the only extra cost and we already have the regex.

### §3 — No timeout for `-p` runs
**Decision:** No timeout. The `-p` runs may legitimately take minutes for a deep audit.
**Alternatives:**
- 60-second timeout — too short for `architector:audit` on large `.ai-arch/`.
- 5-minute timeout — arbitrary; if exceeded the user can't retry without window restart because the slot is locked.
**Why this approach:** matches the brief's default assumption. A future enhancement can add a "Cancel" affordance once we know what reasonable runtime looks like.

### §4 — Canvas-region popup confinement: render into a `position: relative` canvas-column wrapper, no portals
**Decision:** Add `CanvasRegionHost` as a sibling of `<Canvas />` inside the canvas column wrapper. The wrapper gets `position: relative; flex: 1 1 auto; min-width: 0`. All bounded popups render inside `CanvasRegionHost` with `position: absolute; inset: 0` for the dim overlay and a centered card.
**Alternatives:**
- React portal into a dedicated overlay container plus `getBoundingClientRect`/`ResizeObserver` to track the canvas region — works but requires recomputing geometry on every layout change and risks lag during resize.
- Keep `position: fixed` and compute `left`/`width` from the canvas region's bounding rect, updated on `ResizeObserver` — same problems plus more JS on every frame.
- CSS `clip-path` on a viewport-fixed overlay — clips visuals but click-through still hits SidePanel/Chat columns.
**Why this approach:** CSS does the bounding work. Resize is automatic. No portal indirection in tests. The canvas column already has a flex parent; adding `position: relative` to that wrapper is a 1-line change. This also lets us drop `position: fixed` from TerminalModal/StatusPanel/FinalizePanel uniformly.

### §5 — Toolbar overlay state moves from local `useState` to `toolbarOverlay` store slice
**Decision:** Use the existing-but-unused `toolbarOverlay` slice (`'status' | 'finalize' | null`) as the source of truth. Toolbar buttons call `setToolbarOverlay(...)`. `CanvasRegionHost` reads the slice and renders the appropriate panel.
**Alternatives:**
- Lift overlay state to `MainShell` via a new context — more wiring, no net benefit; the store already exposes the slice and an action.
- Keep popups rendered inside `Toolbar.tsx` (current behavior) — but the popups must live inside the canvas column, not under `Toolbar`. Splitting render location from owner of state via the store is the cleanest route.
**Why this approach:** zero new abstractions; the store fields already exist; CanvasRegionHost stays presentational.

### §6 — Audit "Waiting…" UX: text replacement only
**Decision:** While `detachedRuns.audit.kind === 'waiting'`, the Audit button renders the literal text `Waiting…` and is disabled. No spinner glyph.
**Alternatives:**
- Animated spinner — extra CSS, but inconsistent with the rest of the toolbar which is text-only.
- Keep the label and add a leading dot — visually subtle but easy to miss.
**Why this approach:** matches the brief's default assumption; consistent with toolbar's monochromatic text style.

### §7 — Detached-run errors surface via existing `toolbar-error` line, not toasts
**Decision:** When `dispatchDetachedSkill` returns an error, Toolbar's local `error` state is set with the error message. The Status popup's "More Status" button does the same — its onError callback calls back into Toolbar via the store error channel.
**Implementation refinement:** rather than callback, use a small `lastDetachedError: { skill: DetachedSkillName; message: string } | null` slice that Toolbar subscribes to. `clearDetachedRunError` clears it. This lets the error survive the user closing the Status popup mid-run.
**Why this approach:** the brief explicitly forbids toasts for `-p` errors and reuses the existing `toolbar-error` surface.

## Phases

### Phase 1: Skill name expansion + composeCommand
**Goal:** `SkillName` includes the four new names; `composeCommand` produces correct args; IPC accepts them.
**Files:**
- `src/shared/skill/composeCommand.ts`
- `src/shared/skill/__tests__/composeCommand.test.ts`
- `src/main/ipc/skill.ts`
- `src/main/ipc/__tests__/wiredHandlers.test.ts`

#### Steps
1. In `src/shared/skill/composeCommand.ts`, widen `SkillName` to include `'new' | 'triage' | 'audit' | 'status'`.
2. In `composeCommand`, add cases:
   - `'new'` → `['claude', '/architector:new']`.
   - `'triage'` → `['claude', '/architector:triage' + slugsOrEmpty]` (same shape as `map`).
   - `'audit'` → `['claude', '/architector:audit']`.
   - `'status'` → `['claude', '/architector:status']`.
3. In `src/main/ipc/skill.ts`, expand `VALID_SKILLS` to include `'new'`, `'triage'`, `'audit'`, `'status'`.
4. In `src/shared/skill/__tests__/composeCommand.test.ts`, add cases mirroring the existing structure for each new skill (with-slugs / without-slugs where applicable).
5. In `src/main/ipc/__tests__/wiredHandlers.test.ts`, extend the existing parameterised test to assert `skill:spawn` accepts each of `new`, `triage`, `audit`, `status` (the only path through the registered handler).

**Completion Criterion:** `npx vitest run src/shared/skill src/main/ipc/__tests__` passes; all new skills are exercised; previously green tests remain green.

---

### Phase 2: `-p` runner + IPC channel + preload bridge
**Goal:** Renderer can call `window.atrium.skill.runDetached({ skill, cwd })` and receive `Result<DetachedRunResult, SkillErrorCode>`. The runner does not touch `TerminalManager`.
**Dependency:** Phase 1 (uses widened `SkillName` for type imports).
**Files:**
- `src/shared/ipc.ts`
- `src/shared/errors.ts`
- `src/shared/skill/detached.ts` (new)
- `src/main/skill/runDetached.ts` (new)
- `src/main/skill/__tests__/runDetached.test.ts` (new)
- `src/main/ipc/skill.ts`
- `src/main/ipc/__tests__/wiredHandlers.test.ts`
- `src/preload/api.ts`
- `src/preload/index.ts`

#### Steps
1. In `src/shared/ipc.ts`, add `runDetached: 'skill:runDetached'` under `skill`.
2. In `src/shared/errors.ts`, add `RUN_FAILED: 'RUN_FAILED'` to `SkillErrorCode`.
3. Create `src/shared/skill/detached.ts` exporting `DetachedSkillName`, `DetachedRunRequest`, `DetachedRunResult` per the contracts above.
4. Create `src/main/skill/runDetached.ts` implementing the function described in **Changed Contracts**:
   - `resolveClaudeBin()` (with `ATRIUM_E2E_CLAUDE_BIN` override identical to `healthCheck.ts`).
   - `ptySpawn(claudePath, ['-p', `/architector:${skill}`], { cwd, env, cols: 120, rows: 30, name: 'xterm-256color' })`.
   - Accumulate `pty.onData` into `buffer`.
   - On `pty.onExit({exitCode})`: ANSI-strip the buffer; if `exitCode === 0` resolve `ok({ exitCode: 0, stdout: clean })`; else `err(RUN_FAILED, …)`.
   - try/catch around `ptySpawn` → `err(RUN_FAILED, message)`.
   - **Forbid TerminalManager imports** — no import statement from `@main/terminal/terminalManager` or `@main/terminal/state`.
5. Create `src/main/skill/__tests__/runDetached.test.ts` covering:
   - Success path (mock `node-pty` to emit data + exitCode 0).
   - Non-zero exit (returns `err(RUN_FAILED)` with stderr-ish message).
   - `ptySpawn` throws → `err(RUN_FAILED)`.
   - Two concurrent calls do not interfere (each gets its own pty mock).
   - Confirm `runDetached` does not import `TerminalManager` (static check via reading the source file).
6. In `src/main/ipc/skill.ts`, register a second handler:
   ```ts
   safeHandle(IPC.skill.runDetached, async (_event, rawReq) => {
     const req = rawReq as DetachedRunRequest;
     if (!VALID_SKILLS.has(req.skill)) {
       return err(SkillErrorCode.INVALID_SKILL, `unknown skill: ${req.skill}`);
     }
     return runDetached(req);
   }, ipcMainLike);
   ```
7. In `src/main/ipc/__tests__/wiredHandlers.test.ts`, assert `IPC.skill.runDetached` is registered and that an unknown skill returns `INVALID_SKILL`.
8. In `src/preload/api.ts`, extend `AtriumAPI.skill` with `runDetached(req: DetachedRunRequest): Promise<Result<DetachedRunResult, SkillErrorCode>>`.
9. In `src/preload/index.ts`, add `runDetached(req) { return ipcRenderer.invoke(IPC.skill.runDetached, req); }`.

**Completion Criterion:** `npx vitest run src/main/skill src/main/ipc src/shared` is green; the new test that asserts `runDetached` does not touch `TerminalManager` passes; `npx tsc --noEmit` is clean across main + preload.

---

### Phase 3: Renderer detached-run slice + dispatch helper
**Goal:** Store tracks per-skill detached state with dedupe; renderer code can dispatch a detached run with one call.
**Dependency:** Phase 2 (uses preload IPC).
**Files:**
- `src/renderer/src/store/atriumStore.ts`
- `src/renderer/src/store/__tests__/atriumStore.test.ts`
- `src/renderer/src/skill/dispatchDetachedSkill.ts` (new)
- `src/renderer/src/skill/__tests__/dispatchDetachedSkill.test.ts` (new)

#### Steps
1. In `atriumStore.ts`, add the `DetachedRunState` type and `detachedRuns: Record<DetachedSkillName, DetachedRunState>` field initialised to `{ audit: { kind: 'idle' }, status: { kind: 'idle' } }`. Also add `lastDetachedError: { skill: DetachedSkillName; message: string } | null`.
2. Add actions:
   - `startDetachedRun(skill)` — guards against `'waiting'`, transitions `idle/done/error → waiting`, returns `Result<void, 'BUSY'>`.
   - `setDetachedRunResult(skill, output)` — `waiting → done`.
   - `setDetachedRunError(skill, message)` — `waiting → error`; sets `lastDetachedError = { skill, message }`.
   - `closeDetachedResult(skill)` — `done → idle`.
   - `clearDetachedRunError(skill)` — `error → idle`; if `lastDetachedError?.skill === skill` clears it too.
3. In `atriumStore.test.ts`, cover each transition + the BUSY guard + the error sets/clears `lastDetachedError`.
4. Create `src/renderer/src/skill/dispatchDetachedSkill.ts`:
   ```ts
   export async function dispatchDetachedSkill(req: { skill: DetachedSkillName; cwd: string }) {
     const start = useAtriumStore.getState().startDetachedRun(req.skill);
     if (!start.ok) return start; // BUSY no-op
     const r = await window.atrium.skill.runDetached(req);
     if (r.ok) {
       useAtriumStore.getState().setDetachedRunResult(req.skill, r.data.stdout);
     } else {
       useAtriumStore.getState().setDetachedRunError(req.skill, r.error.message);
     }
     return r;
   }
   ```
5. Test it: success calls `setDetachedRunResult`; error calls `setDetachedRunError`; BUSY returns without calling IPC (assert `runDetached` mock was not called).

**Completion Criterion:** `npx vitest run src/renderer/src/store src/renderer/src/skill` green; `lastDetachedError` is observable from any selector subscribing to the slice.

---

### Phase 4: Canvas-region overlay host + popup geometry overhaul
**Goal:** All popups render inside a single container that is bounded to the canvas region; SidePanel and Chat are never overlapped or dimmed. Toolbar overlay state moves to the store.
**Dependency:** Phase 3 (no direct, but easier to test the new slice in conjunction).
**Files:**
- `src/renderer/src/canvas/CanvasRegionHost.tsx` (new)
- `src/renderer/src/canvas/__tests__/CanvasRegionHost.test.tsx` (new)
- `src/renderer/src/shell/MainShell.tsx`
- `src/renderer/src/shell/__tests__/MainShell.test.tsx`
- `src/renderer/src/terminal/TerminalModal.tsx`
- `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx`
- `src/renderer/src/toolbar/StatusPanel.tsx`
- `src/renderer/src/toolbar/__tests__/StatusPanel.test.tsx`
- `src/renderer/src/toolbar/FinalizePanel.tsx`
- `src/renderer/src/toolbar/__tests__/FinalizePanel.test.tsx` (create if missing)
- `src/renderer/src/toolbar/Toolbar.tsx` (only the overlay-state migration; new buttons are Phase 5)

#### Steps
1. In `MainShell.tsx`, change the canvas column wrapper to:
   ```tsx
   <div data-region="canvas" style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
     <Canvas />
     <CanvasRegionHost />
   </div>
   ```
   Remove the existing `<TerminalModal />` from the shell root.
2. Create `src/renderer/src/canvas/CanvasRegionHost.tsx`. It subscribes to:
   - `terminal` (renders `<TerminalModal />` when status is `spawning|active|exited`).
   - `toolbarOverlay` (renders `<StatusPanel />` or `<FinalizePanel />` depending on value).
   - `detachedRuns.audit.kind === 'done'` → renders `<DetachedResultPopup skill="audit" output=… onClose=…/>` (Phase 6).
   - `detachedRuns.status.kind === 'done'` → renders `<DetachedResultPopup skill="status" .../>`.
   It does NOT render the dim overlay itself; each popup component owns its overlay so styles match today's StatusPanel/FinalizePanel pattern.
3. In `TerminalModal.tsx`, change `overlayStyle.position` to `'absolute'` and `inset` to `0` (always full canvas region). Drop `5vh 5vw` margins — the canvas region is already smaller than the viewport. Fullscreen toggle: when `fullscreen`, keep `inset: 0` plus `border: 'none'`; when not, add `inset: '8px'` for a small breath. Z-index can stay (200) — only inside this stacking context.
4. In `StatusPanel.tsx` and `FinalizePanel.tsx`, change the wrapper from `position: 'fixed'; top:0; left:0; right:0; bottom:0` to `position: 'absolute'; inset: 0`. Keep `display: 'flex'; alignItems: 'flex-start'; justifyContent: 'center'; paddingTop: 80`.
5. In `Toolbar.tsx`, replace the local `useState<ToolbarOverlayLocal>` with `const overlay = useAtriumStore((s) => s.toolbarOverlay)` and `setToolbarOverlay`. Remove the inline `<StatusPanel/>` and `<FinalizePanel/>` renders from Toolbar (CanvasRegionHost handles them). Tab `data-active` and `activeTab` local state can stay for visual highlighting (it's purely cosmetic).
6. Update tests:
   - `MainShell.test.tsx`: assert no `terminal-modal` testid is direct child of `main-shell`; assert it appears inside `[data-region="canvas"]`.
   - `TerminalModal.test.tsx`: assert overlay style has `position: 'absolute'`.
   - `StatusPanel.test.tsx` & `FinalizePanel.test.tsx`: assert `position: 'absolute'; inset: 0`.
   - `CanvasRegionHost.test.tsx` (new): set store state to drive each overlay condition and assert the corresponding panel renders inside the host.
   - `Toolbar.test.tsx`: replace any assertion that the panel renders inside the toolbar with a store-state assertion (`toolbarOverlay === 'status'` after click).

**Completion Criterion:**
- For each of `TerminalModal`, `StatusPanel`, `FinalizePanel`: a test asserts the rendered overlay element has computed `style.position === 'absolute'` and does NOT have `'fixed'` (verifies geometry change is in place).
- `CanvasRegionHost.test.tsx` and `MainShell.test.tsx` assert that when each overlay is active, its `data-testid` element is found inside the `[data-region="canvas"]` subtree (`screen.getByTestId('terminal-modal').closest('[data-region="canvas"]')` returns truthy).
- `MainShell.test.tsx` asserts `<TerminalModal />` is no longer a direct child of `[data-testid="main-shell"]`.
- `npx vitest run src/renderer/src` and `npx tsc --noEmit` are clean.

---

### Phase 5: Toolbar buttons (Free Terminal, New, Triage, Audit) + reorder + More Status
**Goal:** All nine buttons appear in the specified order with correct dispatch wiring; Audit button shows "Waiting…" while in flight; More Status button inside StatusPanel runs the `-p` status skill.
**Dependency:** Phase 1 (skill expansion), Phase 3 (detached slice + dispatch helper), Phase 4 (overlay store-driven).
**Files:**
- `src/renderer/src/toolbar/Toolbar.tsx`
- `src/renderer/src/toolbar/__tests__/Toolbar.test.tsx`
- `src/renderer/src/toolbar/StatusPanel.tsx`
- `src/renderer/src/toolbar/__tests__/StatusPanel.test.tsx`

#### Steps
1. In `Toolbar.tsx`, replace the buttons row with the new order:
   `Free Terminal | New | Triage | Explore | Decide | Map | Audit | Status | Finalize`.
   Each button (except Audit) follows the existing pattern: clicking sets `activeTab` to the button's tab name, which drives `data-active` and the highlighted style. Audit is a special case — see step 3.
2. Define data-testids for the new buttons:
   - `toolbar-btn-free`
   - `toolbar-btn-new`
   - `toolbar-btn-triage`
   - `toolbar-btn-audit`
3. Wire each button:
   - **Free Terminal** → `handleSkill('free')` (uses existing `dispatchSkill`); disabled when `!switchAllowed`; project-gated via `if (!project) return;` inside `handleSkill`.
   - **New** → `handleSkill('new')`; disabled when `!switchAllowed`; project-gated.
   - **Triage** → `handleSkill('triage')`; sends current `selectedNodes` (already done by `handleSkill`); disabled when `!switchAllowed`; project-gated.
   - **Audit** → calls a new `handleAudit()`:
     ```ts
     async function handleAudit() {
       if (!project) return;
       const r = await dispatchDetachedSkill({ skill: 'audit', cwd: project.rootPath });
       if (!r.ok && r.error !== 'BUSY') setError(r.error.message);
     }
     ```
     **Not** gated by `switchAllowed`; disabled only when `detachedRuns.audit.kind === 'waiting'`. Label switches to `Waiting…` while waiting.
     **Visual semantics:** Audit click does NOT mutate `activeTab`, so it always renders `data-active="false"`. Audit is a fire-and-forget action, not a tab.
4. Subscribe to `detachedRuns.audit.kind` to drive the Audit button's label & disabled state.
5. Subscribe to `lastDetachedError` to populate the existing `toolbar-error` line. Reading the slice clears any prior local `error` so behaviors don't double up. Add a `Dismiss` mechanism: clicking the Audit/More-Status button again clears the corresponding error via `clearDetachedRunError(skill)` before dispatching the new run.
6. In `StatusPanel.tsx`:
   - Add a `More Status` button (testid `status-panel-more`).
   - When clicked: if `detachedRuns.status.kind === 'waiting'` → no-op (button disabled); otherwise call `dispatchDetachedSkill({ skill: 'status', cwd: project.rootPath })`.
   - Read `detachedRuns.status.kind` from the store to render `Waiting…` label and disable the button.
   - The cached node list above stays untouched.
7. Update tests:
   - `Toolbar.test.tsx`:
     - Order assertion updated to the 9 buttons.
     - Each new button dispatches the right skill or detached call (mock `window.atrium.skill.spawn` and `runDetached`).
     - Audit button is **enabled** when terminal is `active` (regression test).
     - Audit button is **disabled** when `detachedRuns.audit.kind === 'waiting'`; label is `Waiting…`.
     - Setting `lastDetachedError` in the store renders text in `toolbar-error`.
     - Clicking Audit while error is showing dispatches a fresh run (and clears prior error).
   - `StatusPanel.test.tsx`:
     - `More Status` button present, dispatches `runDetached({skill:'status'})`.
     - Setting `detachedRuns.status.kind` to `'waiting'` shows `Waiting…` label and disables the button.

**Completion Criterion:**
- All 9 buttons appear in the exact order in the rendered DOM.
- Audit/More Status flow updates the store and surfaces errors via `toolbar-error`.
- Single-slot terminal rules unchanged for interactive buttons (covered by existing + updated tests).
- `npx vitest run src/renderer/src/toolbar src/renderer/src/skill` green.

---

### Phase 6: Detached result popups (Audit + Status)
**Goal:** When a detached run completes successfully, a result popup opens inside the canvas region; user closes it and the slice returns to `idle`.
**Dependency:** Phase 4 (CanvasRegionHost), Phase 5 (dispatch wired).
**Files:**
- `src/renderer/src/toolbar/DetachedResultPopup.tsx` (new)
- `src/renderer/src/toolbar/__tests__/DetachedResultPopup.test.tsx` (new)
- `src/renderer/src/canvas/CanvasRegionHost.tsx` (extend to render the popups)

#### Steps
1. Create `DetachedResultPopup.tsx`:
   ```tsx
   type Props = {
     title: 'Audit' | 'Status';
     output: string;
     onClose: () => void;
     testid: string;
   };
   ```
   Layout mirrors `StatusPanel.tsx`: `position: absolute; inset: 0` overlay, centered card, `maxWidth: 560`, body is `<pre style={{whiteSpace:'pre-wrap', maxHeight:'60vh', overflow:'auto', fontFamily: 'monospace', fontSize: 12, margin: 0}}>{output}</pre>`. Close button (testid `${testid}-close`).
   Empty `output` → render the same `<pre>` with no text; the close button is still present.
2. Update `CanvasRegionHost.tsx` to render:
   ```tsx
   {detachedRuns.audit.kind === 'done' && (
     <DetachedResultPopup
       title="Audit"
       output={detachedRuns.audit.output}
       onClose={() => closeDetachedResult('audit')}
       testid="audit-result-popup"
     />
   )}
   {detachedRuns.status.kind === 'done' && (
     <DetachedResultPopup
       title="Status"
       output={detachedRuns.status.output}
       onClose={() => closeDetachedResult('status')}
       testid="status-result-popup"
     />
   )}
   ```
3. Test `DetachedResultPopup.tsx`:
   - Renders supplied output verbatim (no markdown rendering — assert the raw text appears, including any `*` characters).
   - `onClose` called when close button clicked.
   - Empty output renders without crashing and Close still works.
4. Update `CanvasRegionHost.test.tsx` to:
   - Setting `detachedRuns.audit = { kind: 'done', output: 'hello', finishedAt: 0 }` in the store renders `audit-result-popup` with the text `hello`.
   - Same for `status`.
   - Setting both to `done` renders both popups (Audit + Status concurrent).
5. Test ownership for the click → popup chain is split, not duplicated:
   - `dispatchDetachedSkill.test.ts` (Phase 3) owns: click-equivalent dispatch → IPC mock resolves → store slice transitions to `done` with the captured stdout.
   - `CanvasRegionHost.test.tsx` (this phase, step 4) owns: store slice in `done` state → corresponding popup is rendered with the right testid and content.
   - `Toolbar.test.tsx` does NOT need to assert popup rendering; it only asserts that clicking Audit invokes `runDetached` and that the button reflects the slice's `kind`.
   This keeps each test focused on one boundary and avoids over-coupling.

**Completion Criterion:**
- After a successful Audit or More Status run, the corresponding popup is visible inside the canvas region.
- Closing the popup returns the slice to `idle`, re-enabling the button.
- Concurrent Audit + Status produce two visible popups.
- Empty stdout still produces a popup.
- `npx vitest run` whole suite green; manual end-to-end recorded in PR description.

---

## Edge Cases in Implementation

| Brief edge case | Handled by |
|---|---|
| Project not loaded → all interactive skill buttons gated | `handleSkill` already short-circuits on `!project`; new buttons (Free/New/Triage) follow the same path. Audit's `handleAudit` also short-circuits on `!project`. |
| Free Terminal pre-project | Stays project-gated (default assumption). |
| Single-slot blocked → Free/New/Triage/Explore/Decide/Map/Finalize disabled | Each button's `disabled={!switchAllowed}` covers it (Phase 5 step 3). |
| Single-slot blocked → Audit / More Status remain clickable | Audit button is disabled only by `detachedRuns.audit.kind === 'waiting'`, never by `switchAllowed` (Phase 5 step 3). Same for More Status. |
| Audit clicked twice quickly | `startDetachedRun` returns `BUSY` on second call; `dispatchDetachedSkill` no-ops (Phase 3 step 4). Button is also visually disabled. |
| More Status clicked twice quickly | Same mechanism, separate slice key. |
| Audit + More Status concurrent | Independent slice keys (`audit`, `status`); both produce independent `done` states; both popups render in CanvasRegionHost (Phase 6 step 2). |
| `-p` non-zero exit | `runDetached` returns `err(RUN_FAILED, message)`; `dispatchDetachedSkill` calls `setDetachedRunError`; Toolbar shows the message in `toolbar-error`; button re-enables (slice is `'error'`, not `'waiting'`). |
| `-p` spawn failure (claude not on PATH) | `runDetached` catches and returns `err(RUN_FAILED, "'claude' not on PATH …")`. |
| `-p` timeout | Not implemented (decision §3); the run stays `waiting` until claude exits. The user can close the app to release. |
| `-p` empty stdout | `runDetached` returns `ok({ exitCode: 0, stdout: '' })`; `setDetachedRunResult` writes `''`; popup renders an empty `<pre>` with Close (Phase 6 step 1). |
| Close behaviour of `-p` popups | Explicit Close button only (decision matches existing modals; brief default assumption). |
| Triage with no selected nodes | `composeCommand({skill:'triage', nodes: []})` → `['claude', '/architector:triage']` (Phase 1 step 2). |
| New with project that already has nodes | `handleSkill('new')` runs unconditionally; the skill itself decides what to do. |
| Window resize while popup open | Popup is `position: absolute; inset: 0` inside a flex-sized container — CSS handles it; no JS recompute. |
| Canvas region unusually small | Same — popup shrinks with the container. The card has `maxWidth: 560` but no `minWidth`, so it fits. |
| Multiple `-p` runs across buttons | Independent slice keys. |
| Free Terminal exit | Same as other terminals — TerminalModal already handles the `exited` state and Close/Escape. |

## What Is NOT Implemented

(From the brief — confirming scope.)

- Markdown rendering of `-p` output (plain text only).
- Cancel button while `-p` run is in progress.
- Toasts for `-p` errors (uses existing `toolbar-error` line).
- Streaming live output for `-p` runs (captured in full, shown on completion).
- Resizable terminal-area divider / dock-style layout.
- Replacing the canvas with an embedded terminal panel (terminal stays a popup).
- SidePanel changes.
- Changes to existing skills (`init`, `explore`, `decide`, `map`, `finalize`) beyond ordering and the geometry change to FinalizePanel.
- Hiding SidePanel/Chat to expand popup width.
- Per-`-p`-skill timeout values.
- Free Terminal availability without a project (stays project-gated).
- Outside-click dismissal of `-p` result popups (Close button only).
