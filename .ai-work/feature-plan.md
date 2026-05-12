# Plan: Replace Consultation Chat Panel with Consultation Terminal
_Brief: `.ai-work/interview-brief.md`_
_Created: 2026-04-28_

## Overview

Replace the `ConsultationPanel` streaming chat UI with an xterm.js pane that spawns `claude`
interactively as a persistent PTY process (no `-p`, always opus, read-only tools). The panel's
open/close/pin mechanics, `EdgeTab`, `ConsultationRegion`, `usePanelState`, and
`useAutoCloseTimer` remain unchanged. Changes are: (1) a new shared system-prompt constant,
(2) a new pure `composeConsultationCommand()` function, (3) a new `consultation:spawnTerminal`
IPC channel backed by `TerminalManager`, (4) a simplified store slice that replaces the
thread/stream fields with a `consultationTerminal: { id, status }` slice, and (5) a rewritten
`ConsultationPanel.tsx` with inline xterm setup. Old consultation service class files
(`consultationService.ts`, `claudeInvoker.ts`, `consultationStorage.ts`, `streamParser.ts`,
`errorMapper.ts`, `constants.ts`) remain on disk as dead code; only registration is removed.

## Affected Files

| File | Change Type | Reason |
|------|-------------|--------|
| `src/shared/consultation/systemPrompt.ts` | create | Move `CONSULTATION_SYSTEM_PROMPT` to shared so `composeConsultationCommand` can import it without a main-process dependency |
| `src/shared/skill/composeCommand.ts` | modify | Add and export `composeConsultationCommand(projectRoot: string): string[]` |
| `src/shared/skill/__tests__/composeCommand.test.ts` | modify | Add tests for `composeConsultationCommand` |
| `src/shared/ipc.ts` | modify | Add `consultation.spawnTerminal: 'consultation:spawnTerminal'` to the IPC constants object |
| `src/main/ipc/consultation.ts` | rewrite | Replace the four old `registerConsultationHandlers` invoke handlers with a single `registerConsultationSpawnHandler(terminalManager, ipcMainLike?)` |
| `src/main/ipc/register.ts` | modify | Swap `registerConsultationHandlers(consultationService)` → `registerConsultationSpawnHandler(terminalManager)`; remove `consultationService` from `managers` type |
| `src/main/index.ts` | modify | Remove `ConsultationService` instantiation and all `consultationService.*` call sites |
| `src/main/ipc/__tests__/wiredHandlers.test.ts` | modify | Replace old 4-handler consultation describe block with a single `consultation:spawnTerminal` test |
| `src/preload/api.ts` | modify | Replace old `consultation` API block with `consultation: { spawnTerminal(args: { cwd: string }): Promise<Result<TerminalId, TerminalErrorCode>> }` |
| `src/preload/index.ts` | modify | Replace old consultation bridge block with `consultation.spawnTerminal` invoke |
| `src/renderer/src/store/atriumStore.ts` | modify | Remove `consultation` thread/stream fields and 9 message actions; add `consultationTerminal` slice and 4 new actions; update `setProject` (remove `loadConsultationForProject` call and preview auto-show) and `switchProject` (swap consultation cancel logic for `clearConsultationTerminal()`) |
| `src/renderer/src/store/__tests__/atriumStore.test.ts` | modify | Remove old consultation message/stream tests; add `consultationTerminal` slice transition tests |
| `src/renderer/src/consultation/hooks/useConsultationTerminal.ts` | create | Effect hook: when panel opens and `status === 'idle'`, fires `consultation:spawnTerminal` IPC; guards on `status === 'spawning'` to prevent race |
| `src/renderer/src/consultation/ConsultationPanel.tsx` | rewrite | Replace chat UI with xterm.js pane: inline Terminal + FitAddon, ResizeObserver, `onData`/`onExit`/`onError` subscriptions keyed on `consultationTerminal.id`; "Restart" button when status is `'exited'` |
| `src/renderer/src/consultation/hooks/useConsultation.ts` | delete | Dead — stream subscription hook for old chat API |
| `src/renderer/src/consultation/ChatInput.tsx` | delete | Dead |
| `src/renderer/src/consultation/MessageList.tsx` | delete | Dead |
| `src/renderer/src/consultation/MessageBubble.tsx` | delete | Dead |
| `src/renderer/src/consultation/ModelSelector.tsx` | delete | Dead |
| `src/renderer/src/consultation/NewSessionButton.tsx` | delete | Dead |
| `src/renderer/src/consultation/__tests__/useConsultation.test.tsx` | delete | Dead |
| `src/renderer/src/consultation/__tests__/ModelSelector.test.tsx` | delete | Dead |
| `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx` | rewrite | New tests: xterm container mounts when id is non-null; Restart button appears when status='exited'; auto-close timer props unchanged |
| `src/renderer/src/consultation/ConsultationRegion.tsx` | modify | Add project-null guard: return null when `project === null` (hides EdgeTab when no project loaded) |

## Changed Contracts

### 1. `AtriumAPI.consultation` (preload surface)
**Before:** `{ loadThread, sendMessage, newSession, cancel, onStreamChunk, onStreamComplete, onStreamError }`  
**After:** `{ spawnTerminal(args: { cwd: string }): Promise<Result<TerminalId, TerminalErrorCode>> }`  
**Consumers:** `atriumStore.ts` (all old callers removed), `ConsultationPanel.tsx` (rewritten).

### 2. `AtriumStore` shape
**Removed from `consultation` slice:** `thread`, `pending`, `inFlight`, `lastError`, `selectedModel` and types
`ConsultationPendingThread`, `ConsultationInFlightMessage`, `ConsultationErrorBubble`.  
**Removed actions:** `sendConsultationMessage`, `cancelConsultationInFlight`, `retryLastConsultationError`,
`startNewConsultationSession`, `handleConsultationStreamChunk`, `handleConsultationStreamComplete`,
`handleConsultationStreamError`, `loadConsultationForProject`, `setConsultationModel`.  
**Added:** `consultationTerminal: ConsultationTerminalSlice` and four actions (see Phase 4).  
**Kept unchanged:** `consultation.panel`, `consultation.pinState`, `openConsultationPanel`,
`closeConsultationPanel`, `toggleConsultationPin`, `enterConsultationPreview`.  
**Consumers of removed actions:** `ConsultationPanel.tsx` (rewritten), `useConsultation.ts` (deleted),
`switchProject` action (updated in-place).

### 3. `registerIpc` signature
**Before:** `managers: { terminalManager, watcherManager, consultationService }`  
**After:** `managers: { terminalManager, watcherManager }`  
**Consumers:** `src/main/index.ts` (updated).

### 4. `IPC.consultation`
**Added:** `spawnTerminal: 'consultation:spawnTerminal'`  
**Old channels kept** in the constants object (dead — never registered) to avoid type errors in any
downstream file that still imports them (the dead-code service files).

## Decision Log

**System prompt location** — Moved to `src/shared/consultation/systemPrompt.ts` so
`composeConsultationCommand` is a pure, side-effect-free shared function testable in Vitest
without Electron imports. Alternative: keep in `src/main/consultation/systemPrompt.ts` and build
the command inside the IPC handler. Chose shared because pure functions have simpler tests and
the constant is not sensitive. `src/main/consultation/systemPrompt.ts` is left untouched (dead
code still used by the dead `ConsultationService`).

**New IPC handler file** — Rewrote `src/main/ipc/consultation.ts` (replacing its content) rather
than adding the handler to `skill.ts`. Reason: keeps the consultation namespace isolated; avoids
coupling skill dispatch and consultation dispatch in one file; the file name remains semantically
accurate.

**xterm mount strategy** — Xterm mounts/unmounts based on `consultationTerminal.id` (not on
`status`). When `id` is null (idle or spawning) the container div is rendered but xterm is not
attached. When id becomes non-null (active), xterm mounts. When `clearConsultationTerminal()`
resets id to null (restart), xterm unmounts; the new spawn produces a new id and xterm remounts.
Alternative: key on `status ∈ {active, exited}`. Chosen approach is simpler — id is the natural
identity for IPC subscriptions.

**`pinState` retention** — `consultation.pinState` is kept in the store (always `false` in
practice now that the Pin button is removed). Alternative: remove `pinState` and `open-pinned`
from the panel state. Keeping it avoids changing `usePanelState` and `ConsultationRegion` which
are otherwise untouched; dead code in an accessed-but-never-mutated field is acceptable.

**`ConsultationService` removal** — `ConsultationService` instantiation and `setWindow` calls
are removed from `src/main/index.ts`. The class files remain on disk (per brief). The
`managers` param of `registerIpc` no longer needs `consultationService`; this is a type-safe
change that avoids carrying a dead reference.

---

## Phases

### Phase 1: Shared System Prompt Constant
**Goal:** `CONSULTATION_SYSTEM_PROMPT` importable from `@shared/consultation/systemPrompt`
**Files:** `src/shared/consultation/systemPrompt.ts` (create)

#### Steps:
1. Create `src/shared/consultation/systemPrompt.ts`. Copy `CONSULTATION_SYSTEM_PROMPT_VERSION`
   and `CONSULTATION_SYSTEM_PROMPT` string verbatim from `src/main/consultation/systemPrompt.ts`.
   Export both. No other changes — `src/main/consultation/systemPrompt.ts` is left untouched.

**Completion Criterion:** `import { CONSULTATION_SYSTEM_PROMPT } from '@shared/consultation/systemPrompt'`
resolves in a Vitest test (or in `composeCommand.ts`) without errors; the exported string starts
with `"You are a co-architect"`.

---

### Phase 2: `composeConsultationCommand` Pure Function + Tests
**Goal:** A pure shared function that returns the full argv for the consultation terminal
**Files:** `src/shared/skill/composeCommand.ts` (modify), `src/shared/skill/__tests__/composeCommand.test.ts` (modify)
**Dependency:** Phase 1 complete

#### New type/signature:
```typescript
export function composeConsultationCommand(projectRoot: string): string[]
```
Returns exactly:
```
['claude', '--model', 'opus', '--permission-mode', 'dontAsk',
 '--system-prompt', CONSULTATION_SYSTEM_PROMPT,
 '--add-dir', projectRoot,
 '--allowedTools', 'Read', 'Grep', 'Glob']
```
Total: 11 elements.

#### Steps:
1. In `composeCommand.ts`, add the import:
   ```typescript
   import { CONSULTATION_SYSTEM_PROMPT } from '@shared/consultation/systemPrompt';
   ```
2. Add and export `composeConsultationCommand(projectRoot: string): string[]` returning the array
   above. No branching logic — the function is a straight array literal with `projectRoot` and the
   constant interpolated.
3. In `composeCommand.test.ts`, add a `describe('composeConsultationCommand')` block with tests:
   - `result[0]` is `'claude'`
   - result contains `'--model'` followed by `'opus'`
   - result contains `'--permission-mode'` followed by `'dontAsk'`
   - result contains `'--system-prompt'` followed by the constant (string identity, not snapshot)
   - result contains `'--add-dir'` followed by the `projectRoot` argument
   - result contains `'--allowedTools'` followed by `'Read'`, `'Grep'`, `'Glob'` as separate elements
   - result has exactly 11 elements

**Completion Criterion:** `composeConsultationCommand('/some/path')` returns a 11-element array
with all flags in correct positions; `vitest run` on the test file passes.

---

### Phase 3: IPC Channel + Main-Process Handler
**Goal:** `consultation:spawnTerminal` channel registered; old consultation handlers removed
**Files:**
- `src/shared/ipc.ts` (modify)
- `src/main/ipc/consultation.ts` (rewrite)
- `src/main/ipc/register.ts` (modify)
- `src/main/index.ts` (modify)
- `src/main/ipc/__tests__/wiredHandlers.test.ts` (modify)
**Dependency:** Phase 2 complete

#### New handler signature:
```typescript
export function registerConsultationSpawnHandler(
  terminalManager: TerminalManager,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void
```
Handler body: casts second arg to `{ cwd: string }`, calls
`composeConsultationCommand(cwd)`, then `terminalManager.spawn(args, cwd)`, returns the
`Result<TerminalId, TerminalErrorCode>` directly.

#### Steps:
1. `src/shared/ipc.ts`: in the `consultation` block, add `spawnTerminal: 'consultation:spawnTerminal'` as const.
2. `src/main/ipc/consultation.ts`: delete all old content. The new file exports only
   `registerConsultationSpawnHandler`. Imports: `IPC` from `@shared/ipc`,
   `composeConsultationCommand` from `@shared/skill/composeCommand`, `TerminalManager` from
   `@main/terminal`, `safeHandle` and `IpcMainLike` from `./safeHandle`,
   `ipcMain as defaultIpcMain` from `./ipcModule`. Register `IPC.consultation.spawnTerminal`
   with a handler that spawns and returns the result.
3. `src/main/ipc/register.ts`:
   - Replace `import { registerConsultationHandlers } from './consultation'` with
     `import { registerConsultationSpawnHandler } from './consultation'`.
   - Remove `ConsultationService` import.
   - Remove `consultationService` from the `managers` parameter type.
   - Replace `registerConsultationHandlers(consultationService)` with
     `registerConsultationSpawnHandler(terminalManager)`.
4. `src/main/index.ts`:
   - Remove `import { ConsultationService } from '@main/consultation/consultationService'`.
   - Remove `const consultationService = new ConsultationService()`.
   - Remove `consultationService.setWindow(win)` and `consultationService.setWindow(null)`.
   - Remove `consultationService` from the `registerIpc(...)` call's managers object.
5. `src/main/ipc/__tests__/wiredHandlers.test.ts`:
   - Replace `import { registerConsultationHandlers } from '../consultation'` with
     `import { registerConsultationSpawnHandler } from '../consultation'`.
   - Replace the `describe('consultation wired handlers', …)` block (4 tests) with a single test:
     `'consultation:spawnTerminal delegates to terminalManager.spawn'` — constructs a fake
     terminalManager returning `ok('t_abc')`, calls `registerConsultationSpawnHandler`,
     invokes the channel with `{ cwd: '/tmp/proj' }`, asserts `manager.spawn` called once with
     an args array starting with `'claude'` and `cwd = '/tmp/proj'`, asserts result is `ok('t_abc')`.

**Completion Criterion:** `wiredHandlers.test.ts` passes; the old 4 consultation tests are gone;
the new single test passes; TypeScript compiles without error in `@main` scope.

---

### Phase 4: Preload API + Bridge
**Goal:** Renderer can invoke `window.atrium.consultation.spawnTerminal({ cwd })`
**Files:** `src/preload/api.ts` (modify), `src/preload/index.ts` (modify)
**Dependency:** Phase 3 complete (IPC channel constant exists in `@shared/ipc`)

#### New type block in `api.ts`:
```typescript
consultation: {
  spawnTerminal(args: { cwd: string }): Promise<Result<TerminalId, TerminalErrorCode>>;
};
```
No `ConsultationFile`, `ConsultationModel`, or `ConsultationErrorCode` imports needed.

#### Steps:
1. `src/preload/api.ts`:
   - Remove imports: `ConsultationFile`, `ConsultationModel`, `ConsultationErrorCode`.
   - Replace the `consultation` block in `AtriumAPI` with the single `spawnTerminal` method above.
2. `src/preload/index.ts`:
   - Remove import of `ConsultationErrorCode`.
   - Replace the entire `consultation:` block in the `api` object with:
     ```typescript
     consultation: {
       spawnTerminal(args) {
         return ipcRenderer.invoke(IPC.consultation.spawnTerminal, args);
       },
     },
     ```

**Completion Criterion:** `api.ts` and `index.ts` compile without error; no references to old
consultation methods remain in either file.

---

### Phase 5: Store Slice Replacement
**Goal:** `consultationTerminal` slice in store; all old message/stream actions removed
**Files:** `src/renderer/src/store/atriumStore.ts` (modify), `src/renderer/src/store/__tests__/atriumStore.test.ts` (modify)
**Dependency:** Phase 4 complete

#### New types (add above store factory):
```typescript
export type ConsultationTerminalStatus = 'idle' | 'spawning' | 'active' | 'exited';

export type ConsultationTerminalSlice = {
  id: TerminalId | null;
  status: ConsultationTerminalStatus;
};

function defaultConsultationTerminalSlice(): ConsultationTerminalSlice {
  return { id: null, status: 'idle' };
}
```

#### New actions (add to `AtriumStore` type and implementation):
```typescript
setConsultationTerminalSpawning(): void;          // { status: 'spawning' }
setConsultationTerminalActive(id: TerminalId): void; // { id, status: 'active' }
setConsultationTerminalExited(): void;            // { status: 'exited' }
clearConsultationTerminal(): void;               // kills id if non-null (fire+forget), → { id: null, status: 'idle' }
```

#### Steps:
1. **Add `ConsultationTerminalSlice` types** above the store factory.
2. **Prune `ConsultationSlice`**: remove `thread`, `pending`, `inFlight`, `lastError`,
   `selectedModel` fields. Keep only `panel: ConsultationPanelState` and `pinState: boolean`.
   Update `defaultConsultationSlice()` accordingly. Remove the `ConsultationPendingThread`,
   `ConsultationInFlightMessage`, `ConsultationErrorBubble` interfaces.
3. **Prune type imports** from `@shared/index`: remove `ConsultationFile`, `ConsultationMessage`,
   `ConsultationModel`, `ConsultationThread`, `ConsultationErrorCode`.
4. **Add `consultationTerminal` to `AtriumStore`** type and initial state.
5. **Add four new actions** to `AtriumStore` type and implementation:
   - `setConsultationTerminalSpawning()`: `set(s => ({ consultationTerminal: { ...s.consultationTerminal, status: 'spawning' } }))`.
   - `setConsultationTerminalActive(id)`: `set({ consultationTerminal: { id, status: 'active' } })`.
   - `setConsultationTerminalExited()`: `set(s => ({ consultationTerminal: { ...s.consultationTerminal, status: 'exited' } }))`.
   - `clearConsultationTerminal()`: if `id !== null`, fire-and-forget `window.atrium.terminal.kill(id)` (swallow result); then `set({ consultationTerminal: defaultConsultationTerminalSlice() })`.
6. **Remove nine old consultation actions** from the `AtriumStore` type and implementation:
   `sendConsultationMessage`, `cancelConsultationInFlight`, `retryLastConsultationError`,
   `startNewConsultationSession`, `handleConsultationStreamChunk`,
   `handleConsultationStreamComplete`, `handleConsultationStreamError`,
   `loadConsultationForProject`, `setConsultationModel`. Also remove the `rotateForSessionLost`
   internal function and `readMessages` / `readActiveModel` / `nextAssistantId` helpers.
7. **Update `setProject`**: remove the `void get().loadConsultationForProject(state.rootPath)` call
   and the preview auto-transition block entirely. The panel stays `closed` on project load.
8. **Update `switchProject`**: remove the old consultation `inFlight` cancel block (the
   `await window.atrium.consultation.cancel(...)` call). Replace with a synchronous
   `get().clearConsultationTerminal()` call before `window.atrium.project.switch(path)`.
9. **Update tests** in `atriumStore.test.ts`:
   - Remove all consultation message/stream tests.
   - Add tests for the four new actions: `setConsultationTerminalSpawning` transitions to
     spawning, `setConsultationTerminalActive` stores id and transitions to active,
     `setConsultationTerminalExited` transitions to exited, `clearConsultationTerminal` resets
     to idle and fires `terminal.kill` when id was non-null.

**Completion Criterion:** `atriumStore.ts` and its test compile; `vitest run` on
`atriumStore.test.ts` passes; no old consultation action names remain in the store file.

---

### Phase 6: Renderer Components — Rewrite and Delete
**Goal:** `ConsultationPanel` renders xterm terminal; dead chat components removed; tests updated
**Files:** See affected files table.
**Dependency:** Phase 5 complete

#### New hook: `useConsultationTerminal(projectRoot: string | null): void`

```typescript
export function useConsultationTerminal(projectRoot: string | null): void {
  const status = useAtriumStore(s => s.consultationTerminal.status);
  const panelKind = useAtriumStore(s => s.consultation.panel.kind);
  const setSpawning = useAtriumStore(s => s.setConsultationTerminalSpawning);
  const setActive = useAtriumStore(s => s.setConsultationTerminalActive);
  const setExited = useAtriumStore(s => s.setConsultationTerminalExited);

  const isOpen = panelKind !== 'closed';

  useEffect(() => {
    if (!isOpen || !projectRoot || status !== 'idle') return;

    let cancelled = false;
    setSpawning();
    void window.atrium.consultation.spawnTerminal({ cwd: projectRoot }).then(result => {
      if (cancelled) return;
      if (result.ok) setActive(result.data);
      else setExited();
    });
    return () => { cancelled = true; };
  }, [isOpen, projectRoot, status, setSpawning, setActive, setExited]);
}
```

#### Rewritten `ConsultationPanel.tsx` structure:

```tsx
export function ConsultationPanel(): JSX.Element {
  const { state, close } = usePanelState();
  const projectRoot = useAtriumStore(s => s.project?.rootPath ?? null);
  const { id, status } = useAtriumStore(s => s.consultationTerminal);
  const clearConsultationTerminal = useAtriumStore(s => s.clearConsultationTerminal);

  const panelRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const setExited = useAtriumStore(s => s.setConsultationTerminalExited);

  useConsultationTerminal(projectRoot);

  useAutoCloseTimer(panelRef, {
    enabled: state.kind === 'open-unpinned' || state.kind === 'preview',
    onExpire: close,
  });

  // Mount/unmount xterm keyed on id
  useEffect(() => {
    if (!id || !containerRef.current) return;

    const xterm = new Terminal({
      theme: { ...XTERM_THEME, background: '#20202a' },
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: 13,
      cursorStyle: 'block',
      allowTransparency: false,
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);
    fitAddon.fit();
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    const offData = window.atrium.terminal.onData(id, data => {
      xterm.write(new Uint8Array(data));
    });
    const offExit = window.atrium.terminal.onExit(id, code => {
      xterm.write(`\r\n[process exited with code ${code ?? 'null'}]\r\n`);
      setExited();
    });
    const offError = window.atrium.terminal.onError(id, err => {
      xterm.write(`\r\n[error: ${err.message}]\r\n`);
      setExited();
    });
    const disposeInput = xterm.onData(data => {
      const enc = new TextEncoder().encode(data);
      window.atrium.terminal.write(id, enc.buffer);
    });

    return () => {
      offData(); offExit(); offError(); disposeInput.dispose(); xterm.dispose();
      xtermRef.current = null; fitAddonRef.current = null;
    };
  }, [id, setExited]);

  // ResizeObserver
  useEffect(() => {
    if (!id || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
      if (xtermRef.current) {
        window.atrium.terminal.resize(id, xtermRef.current.cols, xtermRef.current.rows);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [id]);

  const isPreview = state.kind === 'preview';

  return (
    <aside ref={panelRef} data-region="consultation-panel" data-panel-kind={state.kind}
      style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column',
               background: '#15151a', borderLeft: '1px solid #2a2a32',
               opacity: isPreview ? 0.92 : 1 }}>
      <header data-testid="consultation-header"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                 borderBottom: '1px solid #2a2a32', background: '#1a1a1f' }}>
        <span style={{ fontSize: 12, color: '#e6e6e6', fontWeight: 500 }}>Consultation</span>
        {status === 'exited' && (
          <button type="button" data-testid="consultation-restart-button"
            aria-label="Restart consultation"
            onClick={() => clearConsultationTerminal()}
            style={{ marginLeft: 'auto', background: 'transparent',
                     border: '0.5px solid #3a3a42', borderRadius: 4,
                     color: '#8a8a92', fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                     fontFamily: 'inherit' }}>
            Restart
          </button>
        )}
      </header>
      {status === 'spawning' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#5a5a6a', fontSize: 12 }}>
          Connecting…
        </div>
      )}
      <div ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', padding: 4, background: '#20202a',
                 display: status === 'spawning' ? 'none' : 'block' }}
        data-testid="consultation-xterm-container" />
    </aside>
  );
}
```

#### Steps:
1. Create `src/renderer/src/consultation/hooks/useConsultationTerminal.ts` as specified above.
2. Rewrite `src/renderer/src/consultation/ConsultationPanel.tsx` as specified above.
   Import `XTERM_THEME` and `XTERM_FONT_FAMILY` from `@renderer/terminal/xtermTheme` (same as
   `TerminalModal`). Import `Terminal` from `'xterm'`, `FitAddon` from `'xterm-addon-fit'`.
3. Delete: `hooks/useConsultation.ts`, `ChatInput.tsx`, `MessageList.tsx`, `MessageBubble.tsx`,
   `ModelSelector.tsx`, `NewSessionButton.tsx`, `__tests__/useConsultation.test.tsx`,
   `__tests__/ModelSelector.test.tsx`.
4. Rewrite `__tests__/ConsultationPanel.test.tsx` with three tests:
   - When `consultationTerminal.id` is null and status is `'idle'`, the xterm container is
     rendered but xterm is not attached (no `xterm` instance).
   - When `consultationTerminal.status` is `'spawning'`, the "Connecting…" indicator is visible.
   - When `consultationTerminal.status` is `'exited'`, the "Restart" button is visible.
5. Update `src/renderer/src/consultation/ConsultationRegion.tsx`: add a `project` selector from
   the store. If `project === null`, return `null` (hides both EdgeTab and panel when no project
   is loaded). This is a 3-line change; `ConsultationRegion` gains one `useAtriumStore` call.
6. Confirm `src/renderer/src/consultation/EdgeTab.tsx` compiles without changes (it only calls
   `openConsultationPanel`, which stays).

**Completion Criterion:** `vitest run` passes for all consultation test files; `ConsultationPanel`
renders without errors; "Restart" button visible when `status='exited'`; xterm container present
with `data-testid="consultation-xterm-container"` when `status='active'`; auto-close timer behavior
unchanged (panel still collapses via EdgeTab after idle timeout).

---

## Edge Cases in Implementation

| Edge case | Handling |
|-----------|----------|
| No project open (`project === null`) | `ConsultationRegion` returns null (EdgeTab hidden); even if panel state were open, `useConsultationTerminal` guards on `!projectRoot` — no spawn |
| Spawn race (panel opens twice fast) | `status === 'spawning'` blocks re-entry in `useConsultationTerminal` |
| Panel closes while terminal active | Panel hides; terminal process keeps running; `clearConsultationTerminal` NOT called on panel close |
| Terminal exits on its own (`/exit`) | `onExit` handler → `setConsultationTerminalExited()` → Restart button in header |
| Project switch | `switchProject` calls `clearConsultationTerminal()` before IPC; terminal killed (fire+forget); slice reset; next panel open spawns fresh |
| Skill terminal active simultaneously | Independent IDs; consultation panel in right rail, skill modal overlays canvas — no conflict |
| Restart from exited state | Restart button calls `clearConsultationTerminal()` → id=null, status=idle; xterm unmounts; `useConsultationTerminal` effect triggers new spawn |
| System prompt as argv element | Passed as a single element in `string[]`; node-pty receives it directly — no shell escaping needed |

## What Is NOT Implemented

- Removing `src/main/consultation/` service files from disk (dead code, deferred per brief)
- Session persistence or replay of prior terminal output on panel re-open
- Auto-opening the panel on project load (still requires EdgeTab click)
- Clipboard paste support (Ctrl+V) — may be added in a follow-up; current xterm renders
  keystrokes directly without the clipboard keymap used by TerminalModal
- Changing the EdgeTab label ("Chat" → "Consultation" or similar)
- `ModelSelector` (removed; model is always opus, hard-coded in `composeConsultationCommand`)
- Pin button in header (removed; panel is always open-unpinned)
- Close button in header (removed per brief)
