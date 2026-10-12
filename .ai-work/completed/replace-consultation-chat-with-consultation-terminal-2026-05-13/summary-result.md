# Replace Consultation Chat with Consultation Terminal
_Completed: 2026-05-13_

## Goal
Replace the custom API-based `ConsultationPanel` streaming chat with an xterm.js terminal that spawns `claude` interactively (no `-p`, no streaming flags), reusing the existing system prompt and tool restrictions. Panel open/close/pin behavior is preserved; only the content area changes.

## Implementation Summary
Delivered in 6 phases:

1. **Shared system prompt** — moved `CONSULTATION_SYSTEM_PROMPT` (+ `_VERSION = 1`) into `src/shared/consultation/systemPrompt.ts` so both main and renderer/shared can import via `@shared`. Main copy left in place to avoid touching unrelated code.
2. **Pure command builder** — added `composeConsultationCommand(projectRoot)` to `src/shared/skill/composeCommand.ts`, returning a 13-element argv: `claude --model opus --permission-mode dontAsk --system-prompt <PROMPT> --add-dir <root> --allowedTools Read Grep Glob`. Covered by 7 new vitest assertions (31 tests total in file).
3. **IPC + main handler** — added single `consultation:spawnTerminal` channel; rewrote `src/main/ipc/consultation.ts` to export only `registerConsultationSpawnHandler(terminalManager)`, which composes the command and delegates to `TerminalManager.spawn`. Removed `ConsultationService` instantiation and `setWindow` wiring from `main/index.ts` and `registerIpc`. Old API channels left as dead-code stubs.
4. **Preload surface** — collapsed the 7-method `window.atrium.consultation` block down to a single `spawnTerminal({ cwd }): Promise<Result<TerminalId, TerminalErrorCode>>`. Removed `ConsultationFile`/`ConsultationModel`/`ConsultationErrorCode` re-exports.
5. **Store slice replacement** — pruned `ConsultationSlice` of all message/stream/load/cancel state; introduced a separate `consultationTerminal: { id, status }` slice with 4 actions (`setConsultationTerminalSpawning/Active/Exited`, `clearConsultationTerminal`). `switchProject` now synchronously clears the consultation terminal before switching. ~1000 lines of obsolete tests removed; 7 new tests added.
6. **Renderer rewrite** — created `useConsultationTerminal` hook (idle-guarded auto-spawn on first open per project); rewrote `ConsultationPanel.tsx` to mount xterm.js with the app's dark-purple theme (`#20202a` bg), debounced ResizeObserver-driven fit/IPC resize, "Connecting…" indicator while spawning, and "Restart" button on exit; added `null` guard to `ConsultationRegion` when no project loaded; deleted 6 dead chat components and 2 obsolete test files. Header now shows "Consultation" label only — Pin/Close/ModelSelector removed.

A subsequent fix pass addressed three review-6 items:
- Panel-close-during-spawn no longer leaves status stuck at `'spawning'` — cleanup conditionally calls `clearConsultationTerminal()` guarded by a `statusRef`.
- xterm ResizeObserver fit + IPC `terminal.resize` are debounced 150 ms (matches `TerminalModal`).
- Stable Zustand action reference passed directly to Restart `onClick`.

Final audit (re-run after fix): 908 tests pass across 75 files; no in-scope regressions.

## Key Decisions
- **Plan counting error** — plan stated `composeConsultationCommand` returns 11 elements; correct count is 13. Implementation and tests assert 13; plan text left as-is.
- **Old consultation service kept as dead code** — `consultationService.ts`, `claudeInvoker.ts`, `streamParser.ts`, and storage modules remain on disk per the brief's out-of-scope notes. A separate cleanup pass is needed.
- **EdgeTab label unchanged** — still reads "Chat" per out-of-scope decision; panel header reads "Consultation".
- **`src/main/consultation/index.ts` barrel** — not in the plan's affected list, but had to be updated because it re-exported the renamed handler.
- **`register.test.ts` updates** — not in the plan, but required because it asserted on removed channels and the `consultationService` manager.
- **Effect deps** — `useConsultationTerminal` deliberately uses `id` (not `status`) as a dep with a `statusRef` to avoid an infinite spawn loop while still re-triggering on Restart. ESLint disable comment with rationale left at the call site.

## Files Changed

**Shared / IPC**
- `src/shared/consultation/systemPrompt.ts` (new)
- `src/shared/skill/composeCommand.ts`
- `src/shared/skill/__tests__/composeCommand.test.ts`
- `src/shared/ipc.ts`

**Main process**
- `src/main/ipc/consultation.ts` (rewritten)
- `src/main/consultation/index.ts` (barrel re-export updated)
- `src/main/ipc/register.ts`
- `src/main/index.ts`
- `src/main/ipc/__tests__/wiredHandlers.test.ts`
- `src/main/ipc/__tests__/register.test.ts`

**Preload**
- `src/preload/api.ts`
- `src/preload/index.ts`

**Renderer — store**
- `src/renderer/src/store/atriumStore.ts`
- `src/renderer/src/store/__tests__/atriumStore.test.ts`

**Renderer — consultation panel**
- `src/renderer/src/consultation/hooks/useConsultationTerminal.ts` (new)
- `src/renderer/src/consultation/ConsultationPanel.tsx` (rewritten)
- `src/renderer/src/consultation/ConsultationRegion.tsx`
- `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx` (rewritten)

**Renderer — shell tests**
- `src/renderer/src/shell/__tests__/MainShell.test.tsx`

**Deleted (dead code)**
- `src/renderer/src/consultation/hooks/useConsultation.ts`
- `src/renderer/src/consultation/ChatInput.tsx`
- `src/renderer/src/consultation/MessageList.tsx`
- `src/renderer/src/consultation/MessageBubble.tsx`
- `src/renderer/src/consultation/ModelSelector.tsx`
- `src/renderer/src/consultation/NewSessionButton.tsx`
- `src/renderer/src/consultation/__tests__/useConsultation.test.tsx`
- `src/renderer/src/consultation/__tests__/ModelSelector.test.tsx`

## Gaps/Notes
- No `feature-docs.md` produced for this feature, so no mental-model / decision-log / dependency-map files were extracted into the archive.
- Dead-code consultation service (main-side files listed in brief's Out of Scope) remains on disk awaiting a separate cleanup pass.
- 4 pre-existing failing tests in `claudeInvoker.test.ts` / `errorMapper.test.ts` reference a missing fixture `.ai-work/phase0/r1-happy.jsonl` — confirmed not introduced by this feature.
