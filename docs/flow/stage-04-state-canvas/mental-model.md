# Mental Model

**Data flow (read):**
```
.ai-arch/files → (main) openProject / watcher
              → ProjectState { …, projectHash } via IPC invoke or send
              → atriumStore.setProject
              → useProjectSync diff (the ONLY translator)
              → React Flow setNodes / setEdges
              → <AtriumNode> / <AtriumEdge> paint
```

**Data flow (persist):**
```
React Flow onNodesChange  → debounce(500ms)  ┐
React Flow onViewportChange → debounce(1000ms) ├→ layout:save(projectHash, snapshot) + layout:saveSnapshot (buffer)
                                             ┘
beforeunload → flush both debouncers synchronously
before-quit  → main-side buffer → atomicWriteJson via saveLayoutByHash
```

**Invariants:**
- `ProjectState → React Flow` translation happens in exactly one place: `useProjectSync`. The store's `setProject` is a dumb replace.
- React Flow owns positions. Zustand never stores positions. Dagre only assigns positions to nodes that don't already have one.
- `switchProject` is the only non-trivial cross-slice action. Every other action mutates one slice.
- Positive-whitelist terminal guard is the safety invariant — any new terminal state automatically blocks switch until explicitly opted in.
- Warnings for unknown maturity/type values reset on project-open. Re-observed values within the same project-open don't re-warn.

**Canvas-state machine (§G):**
```
mount → empty
empty → (startAutoOpen) → loading → (setProject on success) → ready
                                 → (all recents fail) → error
                                 → (empty recents) → empty
ready → (clearProject) → empty
ready → (setProject) → ready        (file-sync watcher push)
error → (clearProject) → empty
```

**Terminal 5-state machine (mirrors Stage 03):** `idle → spawning → active → exited → closing → idle`. Illegal transitions rejected by `setTerminal` guard clause.
