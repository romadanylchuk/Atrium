# Plan: Sticky Node Layout + Consultation Terminal Clipboard Parity
_Brief: `interview-brief.md`_
_Created: 2026-05-13_

## Overview
Two independent renderer-only fixes shipped as two phases. Phase 1 fixes the layout-reset bug in `useProjectSync` by reading existing node positions from the live React Flow store (via a `getLiveNodes` callback injected by `Canvas`) instead of the stale `prevNodesRef`, and changes the "new slug" code path so dagre runs only on first-open or explicit re-layout — all other in-session adds land at viewport center. Phase 2 brings `ConsultationPanel` to clipboard parity with `TerminalModal` by attaching the same `decideClipboardAction`-driven custom key event handler, reusing `clipboardKeymap.ts` and `bracketedPaste.ts` verbatim and reading from the `consultationTerminal` store slice.

## Affected Files
| File | Change Type | Reason |
|------|-------------|--------|
| `src/renderer/src/canvas/useProjectSync.ts` | modify | Replace `prevNodesRef`-based existing-position read with `getLiveNodes()` call; replace dagre-for-all-added-slugs with first-open / re-layout gated branch (viewport center otherwise). |
| `src/renderer/src/canvas/Canvas.tsx` | modify | Acquire `useReactFlow()`, wire `getLiveNodes` and `getViewportCenter` callbacks (using the existing wrapper div ref) into `useProjectSync`. |
| `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx` | modify | Update harness to supply `getLiveNodes` / `getViewportCenter` stubs; add live-position read tests and viewport-center add tests; rewrite case 7 (slug rename) to expect viewport-center placement instead of dagre. |
| `src/renderer/src/canvas/__tests__/Canvas.test.tsx` | modify | Existing tests must still pass against the new `useProjectSync` signature (Canvas wires the new callbacks internally; no API surface change at the Canvas level). Touch only if a test breaks; otherwise no edit. |
| `src/renderer/src/consultation/ConsultationPanel.tsx` | modify | Add `attachCustomKeyEventHandler` block before the existing `xterm.onData` wiring; reuse `decideClipboardAction`, `encodeBracketedPaste`. Read from `consultationTerminal` store slice. |
| `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx` | modify | Extend xterm mock to expose `attachCustomKeyEventHandler`, `hasSelection`, `getSelection`, `clearSelection`; add tests for the four clipboard actions against `consultationTerminal` status. |

## Changed Contracts

### `useProjectSync` params (additive — required new fields)
**Before:**
```ts
export interface UseProjectSyncParams {
  project: ProjectState | null;
  seedPositions?: Map<string, NodePosition>;
  setNodes: (nodes: RFNode[]) => void;
  setEdges: (edges: RFEdge[]) => void;
  relayoutRequestId?: number;
}
```

**After:**
```ts
export interface UseProjectSyncParams {
  project: ProjectState | null;
  seedPositions?: Map<string, NodePosition>;
  setNodes: (nodes: RFNode[]) => void;
  setEdges: (edges: RFEdge[]) => void;
  relayoutRequestId?: number;
  /** Returns React Flow's current live node array (positions reflect user drags). */
  getLiveNodes: () => RFNode[];
  /** Returns the viewport center expressed in flow coordinates. Returns `{x:0,y:0}` if the container has no measurable rect. */
  getViewportCenter: () => NodePosition;
}
```

**Only consumer:** `Canvas.tsx` (`CanvasInner`). No other file imports `useProjectSync`.

### `ConsultationPanel` xterm key handling (behavioral)
- New: `xterm.attachCustomKeyEventHandler(e => …)` attached inside the mount/unmount effect, before the existing `xterm.onData` wiring.
- Handler closes over the live `id` and reads `consultationTerminal.status` from the store at event time (not at effect time) — same pattern as `TerminalModal.tsx:58`.
- No prop or store changes. Reuses `decideClipboardAction` (which already accepts `ConsultationTerminalStatus` structurally, since it is a strict subset of `TerminalStatus`).

## Decision Log

### D1 — How `useProjectSync` reads live node positions
**Decided:** Inject a `getLiveNodes: () => RFNode[]` callback from `Canvas`, where Canvas wires it to `useReactFlow().getNodes`.

**Alternatives considered:**
- *Call `useReactFlow()` inside `useProjectSync` directly.* Rejected: it forces every test of `useProjectSync` to wrap `renderHook` in `<ReactFlowProvider>` and somehow populate the React Flow store, which is awkward (the store is normally populated only by mounting `<ReactFlow>`). The callback approach keeps the hook decoupled from React Flow's provider, so tests pass a `() => RFNode[]` stub.
- *Pass the live `nodes` array as a prop.* Rejected: causes the effect dep list to depend on `nodes`, which re-runs the effect on every drag and would either reset positions again or require complex equality checks. A stable callback that reads-on-call avoids the dep churn.
- *Keep `prevNodesRef` and sync it via `onNodesChange`.* Rejected: doubles bookkeeping and still drifts vs. React Flow's internal store, which is the actual source of truth.

**Why this wins:** single source of truth (React Flow's own store), no effect re-run on drags, trivially testable with a stub.

### D2 — Where to compute the viewport center
**Decided:** Canvas owns `containerRef` (its existing outer wrapper div at `Canvas.tsx:105`) plus the `useReactFlow()` instance and exposes a `getViewportCenter` callback. The callback reads `containerRef.current?.getBoundingClientRect()` at call time and calls `rf.project({ x: rect.width/2, y: rect.height/2 })`; if the rect is unavailable or both dimensions are zero (jsdom / pre-mount), returns `{x:0, y:0}`.

**Alternatives considered:**
- *Compute inside `useProjectSync` via `useReactFlow()`.* Same testability issue as D1 — and `useProjectSync` would also need access to a DOM ref, mixing concerns.
- *Use `window.innerWidth/innerHeight`.* Incorrect — the canvas region is not the full window once side panels and consultation pane are visible.

**Why this wins:** Canvas already holds both the DOM ref and the React Flow instance; the callback hides those details from `useProjectSync`.

### D3 — When dagre runs for added slugs
**Decided:** Use a derived predicate, not a new tracker field:
```ts
const isFirstSync = prevNodesRef.current.length === 0 && !tracker.seedApplied;
const useDagreForAdded = isRelayoutTrigger || (isFirstSync && (!seedPositions || seedPositions.size === 0));
```
- `useDagreForAdded === true` → call `computeDagrePositions` for added slugs (existing behavior path).
- `useDagreForAdded === false` → place every added slug at `getViewportCenter()`.

**Alternatives considered:**
- *Add an `initialLayoutDone` flag to the tracker.* Rejected: derivable from existing tracker state plus `prevNodesRef.current.length`; no new state needed.
- *Always use viewport center for added slugs and only call dagre under `isRelayoutTrigger`.* Rejected: first project open with no saved layout would produce N nodes stacked at flow origin (zero rect in mount frame) — a poor initial experience. The brief explicitly says dagre runs on first project open.

**Why this wins:** preserves first-open dagre, preserves re-layout dagre, and makes every other case viewport-center — exactly what the brief states.

## Phases

### Phase 1: Sticky positions in `useProjectSync` + Canvas wiring
**Goal:** User-placed node positions survive every in-session re-sync (file edit, architector write, maturity change, etc.). Dagre runs only on first project open with no saved layout, and on Re-layout button click. New slugs added mid-session land at viewport center.

**Files:**
- `src/renderer/src/canvas/useProjectSync.ts` (modify)
- `src/renderer/src/canvas/Canvas.tsx` (modify)
- `src/renderer/src/canvas/__tests__/useProjectSync.test.tsx` (modify)
- `src/renderer/src/canvas/__tests__/Canvas.test.tsx` (touch only if a test breaks)

**Estimated context:** ~70K tokens
- Baseline 8K + plan ~8K + four files above ~42K (source 12K + tests 30K) + reference reads (dagreLayout 2K, layoutPersistence 2K, atriumStore relevant slice 4K) + 30% headroom ≈ 70K.

#### Steps

1. **`src/renderer/src/canvas/useProjectSync.ts`:**
   - Add two required params to `UseProjectSyncParams`: `getLiveNodes: () => RFNode[]` and `getViewportCenter: () => NodePosition`. Destructure both in the hook body.
   - Inside the effect (after the early `project === null` return), call `const liveNodes = getLiveNodes();` once at the top and build `const liveById = new Map(liveNodes.map(n => [n.id, n] as const));`.
   - Replace the `existingPositions` build loop. Drop the `prevNodes`-derived loop entirely. After the relayout-trigger check, when `!isRelayoutTrigger`, iterate over `nextSlugs` and copy positions from `liveById.get(slug)?.position` into `existingPositions`. Stale liveNodes (slugs not in `nextSlugs`) are simply ignored — they will be removed by `setNodes(nextRFNodes)` below.
   - Keep `prevNodesRef` for slug-diffing only: continue computing `prevSlugs` and `addedSlugs`/`removedSlugs` against it. The bug is only in the position-read path; slug diffing was correct.
   - Compute `const isFirstSync = prevNodesRef.current.length === 0 && !tracker.seedApplied;` after the tracker reset.
   - Compute `const useDagreForAdded = isRelayoutTrigger || (isFirstSync && (!seedPositions || seedPositions.size === 0));`.
   - Rework the dagre block: if `addedSlugs.size > 0`, branch on `useDagreForAdded`:
     - `true` → call `computeDagrePositions(...)` as today, store result in `addedPositions`.
     - `false` → `const center = getViewportCenter();` then for each `slug` in `addedSlugs` that is not already in `existingPositions`, set `addedPositions.set(slug, { x: center.x, y: center.y });`.
   - Rename the local variable `dagrePositions` → `addedPositions` to reflect the broader role. Update the per-node position fallback: `existingPositions.get(slug) ?? addedPositions.get(slug) ?? { x: 0, y: 0 }`.
   - Keep the seed-application loop, the all-identical-seed gate, the staleLayoutSlugs warning, the `tracker.seedApplied` flip — unchanged in logic.
   - Add `getLiveNodes`, `getViewportCenter` to the `useEffect` deps array.

2. **`src/renderer/src/canvas/Canvas.tsx`:**
   - Import `useReactFlow` from `'reactflow'` (alongside the existing imports).
   - Add a `containerRef = useRef<HTMLDivElement | null>(null);` and attach it to the outer wrapper `<div>` that currently has the `width: 100%, height: 100%` style at `Canvas.tsx:105`.
   - Inside `CanvasInner`, after the other hooks: `const rf = useReactFlow();`.
   - Define stable callbacks:
     - `const getLiveNodes = useCallback(() => rf.getNodes(), [rf]);`
     - `const getViewportCenter = useCallback((): NodePosition => { const rect = containerRef.current?.getBoundingClientRect(); if (!rect || (rect.width === 0 && rect.height === 0)) return { x: 0, y: 0 }; return rf.project({ x: rect.width / 2, y: rect.height / 2 }); }, [rf]);`
   - Pass both callbacks into `useProjectSync({ ... })`.
   - Import `NodePosition` from `@shared/layout` if not already imported (it is — `Canvas.tsx:14`).

3. **`src/renderer/src/canvas/__tests__/useProjectSync.test.tsx`:**
   - Update the `renderSync` harness to construct and pass `getLiveNodes` and `getViewportCenter`. Default behavior:
     - `getLiveNodes`: returns the last `setNodes` call's argument (i.e., mirrors what the hook last emitted) — this preserves all existing test invariants (cases 1–8 still work because in the old code `prevNodesRef.current` was assigned from `nextRFNodes`).
     - `getViewportCenter`: returns `{ x: 500, y: 300 }` by default (non-origin so viewport-center placements are detectable in tests).
   - Allow each test to optionally inject a custom `getLiveNodes` to simulate user-drag state.
   - **Update case 7 (slug renamed):** the old assertion `Number.isFinite(newNode.position.x)` still holds (`{x:500,y:300}` is finite), but make the assertion explicit: `expect(newNode!.position).toEqual({ x: 500, y: 300 });` and rename the test to `case 7: slug renamed → new slug placed at viewport center`.
   - **Add `case H — sticky-position read from getLiveNodes`:** First render emits a project. Override `getLiveNodes` to return the emitted nodes but with `alpha` repositioned to `{x: 555, y: 666}`. Re-render the same project. Assert the next `setNodes` call has `alpha` at `{x: 555, y: 666}`, not at the original dagre position.
   - **Add `case I — maturity change preserves drag position`:** Same as case H but the second render uses a project where `alpha.maturity` changed. Assert position is still `{x: 555, y: 666}`.
   - **Add `case J — new slug mid-session lands at viewport center, not dagre`:** First render with `[alpha]`. Capture `alpha`'s dagre position. Re-render with `[alpha, beta]`. Assert `alpha`'s position is preserved (from getLiveNodes) and `beta`'s position equals `getViewportCenter()` return value (`{x: 500, y: 300}`), not whatever dagre would emit.
   - **Add `case K — multiple new slugs in same tick stack at center`:** First render `[alpha]`. Re-render `[alpha, beta, gamma]`. Assert `beta.position === gamma.position === {x: 500, y: 300}`.
   - **Add `case L — relayout still runs dagre even when getLiveNodes has positions`:** Seed positions for a, b, c. Render. Drag (override `getLiveNodes` to return `{a:{x:1,y:1}, b:{x:2,y:2}, c:{x:3,y:3}}`). Bump `relayoutRequestId`. Assert positions are NOT the dragged ones and NOT identical (dagre ran).
   - **Update case G (relayoutRequestId increment):** currently asserts positions changed from seed values. Now also assert positions changed from the live (drag) values. Inject a `getLiveNodes` returning dragged positions to make this assertion meaningful.
   - **Verify case B (drag survives second emit):** still passes with the new harness — `getLiveNodes` mirrors `setNodes` output by default, so the second render reads alpha's first-render seeded position back as the live position, which seeds-don't-re-override because `seedApplied=true`.
   - **Verify case F (all-identical seeds → dagre runs):** still passes — first sync, seeds gate skip flips seedApplied=true but skips seed application; addedSlugs = nextSlugs; isFirstSync=true; seedPositions.size > 0 BUT all-identical → we hit the dagre path. Wait — re-check predicate: `useDagreForAdded = isRelayoutTrigger || (isFirstSync && (!seedPositions || seedPositions.size === 0))`. With `seedPositions.size > 0`, `useDagreForAdded` is false, so viewport center would be used. That breaks case F. **Fix:** widen the predicate to also treat all-identical-seeds as "no usable seeds": `useDagreForAdded = isRelayoutTrigger || (isFirstSync && (!seedPositions || seedPositions.size === 0 || allIdenticalSeeds))`. Hoist the `allIdenticalSeeds` computation above the predicate. Update the corresponding step in (1) above to reflect this.
   - All other existing tests (cases 1–6, 8, markerEnd, warning tracker, seed precedence A–E) should pass unchanged. Re-run the suite before declaring the phase done.

4. **`src/renderer/src/canvas/__tests__/Canvas.test.tsx`:**
   - No source edits expected — Canvas wires the new callbacks internally. If `vi.mock('reactflow', ...)` is needed because `useReactFlow()` isn't satisfied by the existing test setup, add a partial mock that exposes `getNodes: () => []` and `project: (p) => p`. Check first: the existing tests do `render(<Canvas />)` which wraps in `<ReactFlowProvider>` (the real one, since the test doesn't mock reactflow), and `useReactFlow()` in that context returns a working instance whose `getNodes()` returns the empty internal store. So no mock should be needed. If a test fails due to `rf.project` not being callable in jsdom, add a `containerRef` zero-rect fallback assertion (no DOM rect in jsdom → `{x:0,y:0}` path).

**Completion Criterion:**
- All existing tests in `useProjectSync.test.tsx` and `Canvas.test.tsx` pass.
- New tests H, I, J, K, L pass.
- Manually verifiable scenarios (smoke test in dev mode):
  - Open a project, drag a node, edit a node's description in its `.ai-arch/` file, watch the canvas re-sync — node stays where dragged.
  - Add a new node entry to `.ai-arch/` while project is open — node appears at viewport center, others unchanged.
  - Click Re-layout — all nodes snap to dagre output.
- `npm run typecheck` and `npm run lint` both clean.

---

### Phase 2: Consultation panel clipboard parity
**Dependency:** Phase 1 complete and verified (independent functionally, but landing both in sequence keeps the test suite green between phases).

**Goal:** Ctrl+C, Ctrl+V, Ctrl+Shift+C in `ConsultationPanel`'s xterm behave identically to `TerminalModal`. Multi-line pastes are wrapped in bracketed-paste markers.

**Files:**
- `src/renderer/src/consultation/ConsultationPanel.tsx` (modify)
- `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx` (modify)

**Estimated context:** ~50K tokens
- Baseline 8K + plan ~8K + phase-1-result ~5K + files ~9K + reference reads (TerminalModal 11K, clipboardKeymap 1K, bracketedPaste 0.5K, atriumStore consultation slice 2K) + 30% headroom ≈ 50K.

#### Steps

1. **`src/renderer/src/consultation/ConsultationPanel.tsx`:**
   - Add imports next to the existing terminal imports: `import { decideClipboardAction } from '@renderer/terminal/clipboardKeymap';` and `import { encodeBracketedPaste } from '@renderer/terminal/bracketedPaste';`.
   - Inside the mount/unmount effect (the one keyed on `id`), after `xterm.open(containerRef.current); fitAddon.fit();` and before the existing `xterm.onData(...)` wiring (currently `ConsultationPanel.tsx:62`), insert:
     ```ts
     xterm.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
       const selection = xterm.hasSelection() ? xterm.getSelection() : '';
       const { id: currentId, status: currentStatus } =
         useAtriumStore.getState().consultationTerminal;
       const action = decideClipboardAction(e, {
         hasSelection: selection.length > 0,
         status: currentStatus,
       });
       switch (action.kind) {
         case 'passthrough':
           return true;
         case 'swallow':
           e.preventDefault();
           return false;
         case 'copy-selection':
           e.preventDefault();
           void navigator.clipboard.writeText(selection).catch(() => {});
           xterm.clearSelection();
           return false;
         case 'paste':
           e.preventDefault();
           void navigator.clipboard
             .readText()
             .then((text) => {
               if (!text || !currentId) return;
               if (
                 useAtriumStore.getState().consultationTerminal.status !== 'active'
               )
                 return;
               const wrapped = encodeBracketedPaste(text);
               if (!wrapped) return;
               const enc = new TextEncoder().encode(wrapped);
               window.atrium.terminal.write(currentId, enc.buffer);
             })
             .catch(() => {});
           return false;
         default: {
           const _exhaustive: never = action;
           void _exhaustive;
           return true;
         }
       }
     });
     ```
   - The existing `xterm.onData(...)` wiring at line 62 stays exactly as-is — regular keystrokes still flow through to the pty when the custom handler returns `true`.
   - No other changes to the file.

2. **`src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx`:**
   - Extend the `xterm` mock at the top of the file so the `Terminal` class also exposes:
     ```ts
     attachCustomKeyEventHandler = vi.fn();
     hasSelection = vi.fn().mockReturnValue(false);
     getSelection = vi.fn().mockReturnValue('');
     clearSelection = vi.fn();
     ```
   - Track the handler the panel registers. Inside the test that constructs a Terminal, retrieve the registered handler from `Terminal.prototype.attachCustomKeyEventHandler.mock.calls[0][0]` (or store via `instance.attachCustomKeyEventHandler` if accessible — adjust based on how vi captures it).
   - Add a test group `describe('clipboard handler')` with the following cases. Each sets `useAtriumStore.setState({ consultationTerminal: { id: 'term-1', status: 'active' } })` before invoking the handler, unless noted.
     - **`copy-selection on Ctrl+C with selection`**: stub `hasSelection → true`, `getSelection → 'selected text'`. Stub `navigator.clipboard.writeText`. Invoke handler with `{ type: 'keydown', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, code: 'KeyC', preventDefault: vi.fn() }`. Assert: `preventDefault` called; `writeText` called with `'selected text'`; `clearSelection` called; handler returned `false`.
     - **`passthrough Ctrl+C with no selection`**: `hasSelection → false`. Invoke handler. Assert: returned `true`; `preventDefault` not called; `writeText` not called.
     - **`swallow Ctrl+Shift+C with no selection`**: `hasSelection → false`. Invoke handler with `shiftKey: true, code: 'KeyC'`. Assert: returned `false`; `preventDefault` called; no clipboard interaction.
     - **`paste on Ctrl+V when status active wraps and writes`**: `consultationTerminal: { id: 'term-1', status: 'active' }`. Stub `navigator.clipboard.readText → 'line1\nline2'`. Stub `window.atrium.terminal.write`. Invoke handler with `code: 'KeyV'`. Await microtask. Assert: `terminal.write` called with `'term-1'` and a `Uint8Array` buffer whose decoded text begins with `\x1b[200~` and ends with `\x1b[201~` and contains `line1\nline2`.
     - **`paste swallowed when status spawning`**: `consultationTerminal: { id: null, status: 'spawning' }`. Invoke handler with Ctrl+V. Assert: returned `false`; `preventDefault` called; `readText` not called (`decideClipboardAction` returns `swallow` because status !== 'active').
     - **`paste swallowed when status exited`**: same as above with `status: 'exited'`.
     - **`paste short-circuit when id is null`**: `consultationTerminal: { id: null, status: 'active' }`. (Brief edge case 110 — defend even though keymap status guard normally covers it; with status='active' but id null, paste branch must short-circuit before calling write.) Stub `readText → 'hello'`. Invoke. Await microtask. Assert: `terminal.write` NOT called.
     - **`paste short-circuit when status flips between read and write`**: status='active' on key press, but flipped to 'exited' before `readText` resolves. Stub `readText` to return a promise that resolves after the test mutates the store: `useAtriumStore.setState({ consultationTerminal: { id: 'term-1', status: 'exited' } })` before resolving. Assert: `terminal.write` NOT called.
     - **`paste empty clipboard drops`**: `readText → ''`. Assert: `terminal.write` NOT called.
   - Keep all existing tests (the three at lines 70–98) passing unchanged.

**Completion Criterion:**
- All existing `ConsultationPanel.test.tsx` cases still pass.
- All new clipboard-handler cases pass.
- Manually verifiable (smoke in dev):
  - Open the consultation panel, type a few characters, drag-select some text, press Ctrl+C → text in OS clipboard; selection clears.
  - With no selection, press Ctrl+C → ^C interrupts claude (current behavior preserved).
  - Copy a multi-line snippet from outside, press Ctrl+V in the consultation panel → entire block submitted as one paste; claude sees a single multi-line input.
  - Press Ctrl+V while consultation is spawning → no effect.
- `npm run typecheck`, `npm run lint`, `npm run test` all clean.

## Edge Cases in Implementation

### Issue 1
- **Stale seed slug** — unchanged. `tracker.staleLayoutSlugs` still gates the warn-once behavior.
- **All-identical-seed gate** — preserved AND wired into the dagre predicate (`useDagreForAdded` includes `allIdenticalSeeds` so first-open with auto-layout marker still triggers dagre instead of stacking all nodes at viewport center).
- **StrictMode double-invoke** — `useProjectSync` is idempotent under double-mount because the second invocation re-reads `getLiveNodes()`, finds the same positions emitted by the first, and re-emits identical `nextRFNodes`. No infinite loop because the effect deps don't include `liveNodes` itself.
- **Project switch (different `projectHash`)** — `prevNodesRef.current = []` is reset implicitly because the tracker reset clears `seedApplied` and the next `setNodes` call will replace React Flow's nodes; `getLiveNodes()` will return the project-A nodes on the first project-B sync, but `existingPositions` is built only from `nextSlugs` (project-B slugs), so project-A positions don't leak. To be safe, when `tracker.hash !== project.projectHash`, also reset `prevNodesRef.current = []` at the top of the effect (added as a small explicit step in (1)).
- **Concurrent watcher event + user drag** — solved by reading from `getLiveNodes()` instead of the ref: React Flow's reducer applies the drag synchronously, so `getNodes()` returns the dragged position by the time the re-sync effect runs.
- **`useNodesState` deps and re-render loops** — `getLiveNodes` and `getViewportCenter` are stable `useCallback`s with `[rf]` deps. The effect's dep list does not include `nodes` (the live array), so user drags do not re-trigger the effect.
- **First-render race** — pass 1: `getLiveNodes()` returns `[]`, `seedPositions` empty, `isFirstSync=true`, useDagreForAdded=true → dagre runs. `setNodes(nextRFNodes)` updates React Flow store. Pass 2: `getLiveNodes()` returns pass-1's output (now live in the store), `seedPositions` populated, `!seedApplied` → seed-apply loop overrides existingPositions for known slugs, flips seedApplied=true. `setNodes` again with seeded positions.

### Issue 2
- **Clipboard permission denied / unavailable** — both `writeText` and `readText` use `.catch(() => {})`. No toast, no console error. Matches `TerminalModal`.
- **`status === 'spawning'`** — paste is swallowed (`decideClipboardAction` returns `swallow` because status !== 'active'). Copy works iff selection exists (xterm rarely has a selection while spawning, but the keymap handles it).
- **`status === 'exited'`** — paste swallowed; copy still works.
- **`id === null`** — explicit `if (!currentId) return;` in the paste branch defends against this even though the status guard typically prevents the case.
- **Empty / whitespace-only clipboard** — `encodeBracketedPaste('')` returns `''`; the `if (!wrapped) return;` guard drops it.
- **Bracketed-paste-marker injection** — `encodeBracketedPaste` strips embedded `\x1b[200~` / `\x1b[201~` sequences. No new sanitization.
- **Right-click** — no change. Browser default stands; xterm intercepts and we don't add a context menu.

## What Is NOT Implemented
- No changes to the `LayoutFileV1` format, `window.atrium.layout` IPC, or `computeDagrePositions` internals.
- No new toolbar button, dialog, or settings toggle. The existing Re-layout icon stays untouched.
- No confirmation dialog on Re-layout.
- No changes to `TerminalModal` clipboard code.
- No changes to consultation terminal status transitions, the spawn hook, `composeConsultationCommand`, or any IPC channels.
- No removal of the deferred consultation-service dead files.
- No right-click context menu on either terminal.
- `MainShell.test.tsx` is NOT touched. The brief listed it, but inspection shows it mocks both `ConsultationPanel` and avoids `Canvas`'s sync internals, so neither fix surfaces in MainShell's assertions.
