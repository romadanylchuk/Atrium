# Decision Log

**1. `LayoutFileV1` lives in `@shared/layout.ts` (not `@main/storage/layout.ts`).**
- Why: The renderer needs the exact shape to call `layout.load` / `layout.save`. Duplicating the type would let main and renderer drift; importing `@main/*` from renderer violates the process-model invariant (brief §D1 of `state-management.md`: "No renderer-side FS access"). A pure-data type in `@shared` is the cleanest bridge.
- Alternatives: (a) re-export from `@main` via a barrel — rejected, still pulls Node types transitively; (b) redefine in renderer — rejected, two sources of truth.

**2. `projectHash` as a flat field on `ProjectState`, not a separate IPC call.**
- Why: Brief §E pins it flat. Renderer uses it on every `layout:save`/`layout:load` and in the before-quit buffer; a separate IPC call per project-open would duplicate a value we already compute in the main loader. Additive — every current consumer ignores extra fields.
- Alternatives: dedicated `project.getHash(path)` channel — rejected, an extra round-trip for zero benefit.

**3. `LayoutErrorCode.NOT_FOUND` exists even though `loadLayoutByHash` returns `ok(null)` on missing files.**
- Why: The brief lists `NOT_FOUND` in the `LayoutErrorCode` union explicitly. Keeping it reserved for future code paths (e.g. "the project hash dir exists but is empty in a way we can't recover from") costs nothing and matches the union the brief documents.
- Alternatives: omit `NOT_FOUND` from the union — rejected, contradicts brief §E.

**4. Main-side recents pruning happens inside `openProject`, not inside the IPC handler.**
- Why: Prevents every call site (current and future) from needing to remember to prune. The pruning is coupled to the semantic of "a recent that refuses to open" — the exact spot where we already decide `Result.err`.
- Alternatives: prune in the IPC handler — rejected, the reparse path (`watcherReparseAdapter`) also calls `openProject`-equivalent, and we don't want watcher re-parses pruning.
  - Follow-up: `readAndAssembleProject` (no `bumpRecent`, no pruning) remains the reparse entry point. Only `openProject` prunes. Confirmed by reading `src/main/project/openProject.ts:117` — `readAndAssembleProject` and `openProject` are already the two separate entry points.

**5. Main-side `layout:saveSnapshot` is a `send` channel, not `invoke`.**
- Why: Renderer pushes the current snapshot on every debounced save already; the snapshot buffer is purely a safety net for `before-quit` ordering. Invoke would require awaiting a Result we don't care about.
- Alternatives: piggyback on `layout:save` — rejected, that channel returns a `Result` and runs the whole IO pipeline. Snapshot buffer only stores the last-known-good payload in memory.

**6. Both `beforeunload` renderer flush AND main-side `before-quit` mirror are implemented in Stage 04.**
- Why: Brief §H open question explicitly says "Start with both for safety; remove the main-side mirror only if redundant". Keeping both from day one prevents a race where `before-quit` fires before `beforeunload` resolves.

**7. Canvas `{ kind: 'loading' }` renders identically to `{ kind: 'ready' }`.**
- Why: Brief §G pins this. Discriminant exists in the type for Stage 05.
