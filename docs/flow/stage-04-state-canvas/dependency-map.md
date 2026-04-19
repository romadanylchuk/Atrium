# Dependency Map

- `@shared/layout.ts` (new) ←— `@shared` barrel. Consumed by: `@main/storage/layout.ts`, `@preload/api.ts`, `@renderer/canvas/*`.
- `@shared/errors.ts` ←— all three projects.
- `@shared/ipc.ts` ←— main handlers, preload, renderer indirectly (via preload).
- `@shared/domain.ts` (`ProjectState.projectHash`) ←— parser/openProject (producer), store (consumer via setProject), useProjectSync (reads projectHash for warning reset).
- `@main/storage/layout.ts` ←— `@main/ipc/layout.ts`, `@main/ipc/layoutSaveBuffer.ts`, `@main/index.ts` (before-quit handler).
- `@main/storage/appConfig.ts` ←— `@main/project/openProject.ts` (for `pruneRecent`), `@main/project/recentsPruning.ts` (just imports the helper signature — actually the classifier has no storage dep).
- `@main/project/recentsPruning.ts` ←— `@main/project/openProject.ts`.
- `@main/ipc/register.ts` ←— `@main/index.ts`. Wires: project, dialog, fileSync, terminal, health, **layout**.
- `@preload/api.ts` ←— `@preload/index.ts` (implementation), renderer `window.atrium.*` (consumers).
- `@renderer/store/atriumStore.ts` ←— `App.tsx`, `startAutoOpen`, `registerListeners`, `Canvas.tsx`, `useProjectSync.ts`, `CanvasErrorState.tsx`.
- `@renderer/canvas/dagreLayout.ts` ←— `useProjectSync.ts`.
- `@renderer/canvas/useProjectSync.ts` ←— `Canvas.tsx`.
- `@renderer/canvas/visualEncoding.ts` ←— `AtriumNode.tsx`, `AtriumEdge.tsx`.
- `@renderer/canvas/layoutPersistence.ts` ←— `Canvas.tsx`.
- `@renderer/ipc/registerListeners.ts` ←— `App.tsx`.
- `@renderer/autoOpen/startAutoOpen.ts` ←— `App.tsx`.

**Cross-subsystem boundaries crossed:**
- `@shared/layout.ts` bridges main ↔ renderer for the `LayoutFileV1` shape.
- `@shared/domain.ts` adds `projectHash` (main producer → renderer consumer).
- New `layout:*` IPC is the only new boundary crossing. All other new code is intra-subsystem.
