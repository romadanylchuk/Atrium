# Idea: Testing Strategy
_Created: 2026-04-16_
_Slug: testing-strategy_

## Description
Testing strategy for Atrium: unit + integration heavy, E2E minimal and surgical. Vitest for unit/integration, Playwright + Electron for E2E. Test pyramid weighted toward fast, reliable tests that cover the most bug-prone logic (diff hook, state transitions, parsing) with exactly 3 E2E scenarios for what can't be tested any other way.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Test pyramid: unit + integration heavy, E2E surgical.**
   - Unit and integration tests catch most bugs — fast, reliable, deterministic
   - E2E (Playwright + Electron) is powerful but slow and flaky — invest in exactly 3 scenarios
   - Test runners: Vitest (unit/integration), Playwright (E2E)

2. **Unit tests (Vitest):**

   **data-layer parsing** (runs in Node/main context):
   - MD parser: heading splitting, edge cases (`## ` in code blocks, malformed files, partial writes)
   - index.json parser: valid JSON, missing fields, corrupted mid-write

   **skill-orchestration:**
   - Command composition for all 4 patterns (init, single-node, multi-node, free)

   **state-management — terminal state transitions (5-state machine):**
   - Full cycle: idle → spawning → active → exited → closing → idle
   - Natural exit: active → exited (`onExit` callback)
   - User close: exited → closing → idle
   - Kill: active → exited via SIGTERM/SIGKILL (terminal stays open)
   - Positive whitelist guard: `canSwitch` true for `idle`, `exited`
   - Positive whitelist guard: `canSwitch` false for `spawning`, `active`, `closing`
   - Auto-dismiss: switch during `exited` → `closing → idle` before IPC call
   - Hypothetical 6th state → `canSwitch` false by default (whitelist safety)

   **state-management — store actions:**
   - setProject, selectNode, deselectNode, clearSelection
   - switchProject: atomic reset of all slices after IPC returns

   **Diff hook (`useProjectSync`) — 8 test cases:**
   1. Node added → gets dagre auto-layout position
   2. Node removed → removed from React Flow
   3. Node removed while selected → `selectedNodes` cleaned up in Zustand
   4. Node removed while tooltip open → `tooltipTarget` cleared
   5. Maturity changed → node appearance updates, position preserved
   6. Connection added/removed → edges update
   7. Node ID changed (slug rename) → position resets to auto-layout (old slug's position not preserved)
   8. Rapid sequential updates → final state matches last `ProjectState`, not first

   **Diff hook test setup:**
   - Mock `useReactFlow()` / `setNodes` / `setEdges`
   - Feed sequences of `ProjectState` into the hook
   - Assert correct React Flow API calls

3. **Integration tests:**

   **IPC round-trips:**
   - Mock main process handlers, verify renderer receives typed `Result<T, E>` messages
   - Verify both transport patterns: `invoke` returns Result, `send` delivers push payloads
   - Verify `Unsubscribe` functions actually remove listeners

   **File watcher pipeline** (main process only, no Electron window):
   - Start `@parcel/watcher` on temp directory
   - Write `.ai-arch/` files
   - Verify 300ms debounce (burst writes → single re-parse)
   - Verify `ProjectState` output matches written files
   - NOT E2E — renderer not needed to verify the pipeline

   **Terminal lifecycle in main process — 2 paths:**
   - Happy path: spawn → active → natural exit → exited → close → idle
   - Kill path: spawn → active → force kill (SIGTERM, then SIGKILL after timeout) → exited → close → idle
   - Error cases: process crash → exited, spawn failure → idle
   - Verify IPC messages emitted for `onData`, `onExit` at each transition

4. **E2E tests (Playwright + Electron) — exactly 3:**
   1. App launch → health check → project launcher appears
   2. Open existing project → canvas renders nodes from `.ai-arch/`
   3. Terminal spawn → output visible in xterm → kill

   **Skip E2E** (covered by unit/integration):
   - File watcher → canvas update, command composition, store transitions, IPC shapes, diff hook

5. **Mocking boundaries:**
   | Context | Mock | Real |
   |---------|------|------|
   | Unit tests | node-pty, IPC, `useReactFlow()` | Zustand, parsing functions |
   | Integration tests | — | @parcel/watcher, IPC, node-pty |
   | E2E | — | Everything |

6. **What NOT to test:**
   - Claude Code behavior inside terminals — opaque, not our code
   - React Flow internals — library responsibility
   - @parcel/watcher OS-level behavior — trust the library, test our integration with it

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| E2E-heavy strategy | Electron E2E is slow, flaky, and expensive in CI; most logic is testable at unit/integration level |
| No E2E at all | Three scenarios genuinely require a real Electron window: health check modal, React Flow rendering, xterm binary decode. Can't be verified otherwise. |
| Jest instead of Vitest | Vitest is faster, better ESM support, native Vite integration — matches the stack (decided in cross-platform-shell) |
| Cypress for E2E | No native Electron support; Playwright has first-class Electron integration |
| Snapshot tests for React components | Brittle, low signal — component logic tested via diff hook unit tests and E2E |
| Testing diff hook inside the store (middleware) | Diff is UI reconciliation, not app logic; mocking React Flow hooks is cleaner than mocking store middleware |

### Rationale
The test pyramid is weighted toward the layers with the most logic and the most risk: the diff hook (bridges two state systems), terminal state transitions (5-state machine with guard logic), and data-layer parsing (string splitting with known edge cases). These are all fast unit tests. Integration tests cover the cross-process boundaries (IPC, file watcher, terminal lifecycle) where bugs are hard to reproduce in isolation. E2E is reserved for the three scenarios that genuinely require a real Electron window — nothing more.

### Implications
- **cross-platform-shell** — Vitest + Playwright from the decided stack
- **data-layer** — most unit-testable component; pure parsing functions with predictable input/output
- **skill-orchestration** — pure `composeCommand` function; unit tests feed params, assert array output
- **electron-ipc** — integration tests verify both transport patterns (invoke + send) and Result types
- **file-state-sync** — integration test with real @parcel/watcher on temp directory; verifies 300ms debounce
- **cli-engine** — terminal lifecycle integration tests cover both happy path and kill path
- **state-management** — unit tests for all state transitions, whitelist guard (including 6th state safety), diff hook 8 cases

## Priority
core

## Maturity
decided

## Notes
- Empty project is not a separate diff hook test — degenerate case of "nodes added", covered by case 1
- `prev.find(p => p.id === n.id)` miss on slug rename (case 7) is the most subtle edge case — tests verify fallback to default position

## Connections
- cross-platform-shell: Vitest as test runner, Playwright for E2E
- data-layer: most unit-testable component (pure parsing in main process)
- skill-orchestration: pure function command composition, easy to unit test
- electron-ipc: integration tests verify the IPC contract + Result types
- file-state-sync: integration test for watcher pipeline (main process, no window)
- cli-engine: terminal lifecycle integration tests + E2E for xterm rendering
- state-management: unit tests for store actions, switchProject guard, diff hook

## History
- 2026-04-16 created — identified as gap; Vitest mentioned in stack but no testing design across the layers
- 2026-04-16 /architector:explore — defined confidence bar: unit+integration heavy, E2E minimal (3 scenarios); detailed diff hook test cases including slug rename edge case and rapid sequential updates; reclassified file watcher as integration not E2E; terminal xterm rendering as must-E2E
- 2026-04-16 /architector:explore — synced to cli-engine's 5-state lifecycle; expanded state-management unit tests with all transitions + positive whitelist guard + auto-dismiss on switch; added natural exit path to terminal integration tests (happy path where process ends on its own)
- 2026-04-16 /architector:decide — locked in test pyramid (unit+integration heavy, E2E surgical); pinned 8 diff hook cases, 5-state + whitelist guard unit tests, 2-path terminal integration; Vitest + Playwright; mocking boundaries table; explicit exclusions
