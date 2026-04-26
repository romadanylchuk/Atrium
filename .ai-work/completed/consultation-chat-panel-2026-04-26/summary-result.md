# Consultation Chat Panel
_Completed: 2026-04-26_

## Goal

Add a right-side slide-in consultation panel backed by non-interactive `claude -p` with read-only tools (Read/Grep/Glob) and a co-architect system prompt. Per-project conversation history persists to `userData/projects/<hash>/consultation.json`, reuses the user's existing Claude Code subscription (no separate API billing), and treats `.ai-arch/` as the authoritative knowledge base read on demand by the agent.

## Implementation Summary

Delivered across 10 phases plus a Phase 0 research pass:

- **Phase 0 (Research):** Verified six CLI questions against the installed `claude` binary (stream-json shape, tool-restriction flag, session-id/resume sequencing, `--bare` interaction with subscription auth, error mapping, model/budget/fallback flags). Two halt conditions surfaced and were resolved: `--bare` is incompatible with OAuth subscriptions (dropped), and `--session-id` + `--resume` are mutually exclusive (split into first-message vs resume modes).
- **Phase 1 (Shared contract):** `ConsultationMessage`/`Thread`/`File` types + `ConsultationModel` in `src/shared/consultation.ts`; `ConsultationErrorCode` (11 codes) appended to `src/shared/errors.ts`; `IPC.consultation.*` namespace (4 invoke + 3 push) in `src/shared/ipc.ts`; preload `consultation` namespace in `AtriumAPI` and `src/preload/index.ts` (Phase 6 work pulled forward to satisfy typecheck).
- **Phase 2 (Storage):** `getConsultationPath(hash)` in `paths.ts`; `consultationStorage.ts` with `loadConsultation`/`saveConsultation`/`appendMessages`/`rotateThread`. Quarantine on `CORRUPT`, leave-untouched on `SCHEMA_MISMATCH`, ENOENT → `ok(null)`, atomic writes via existing helper. Hand-rolled type guards (no Zod).
- **Phase 3 (Error mapper):** `mapResultEvent`/`mapAssistantError`/`mapSpawnFailure` in `errorMapper.ts`. Three-layer detection: `result.is_error` primary, `assistant.error` secondary, stderr+exit tertiary; SIGTERM/SIGKILL → CANCELLED takes priority over INVALID_OUTPUT.
- **Phase 4 (Stream parser + invoker):** `streamParser.ts` (NDJSON framing, partial-line buffering, tolerant of non-JSON lines); `claudeInvoker.ts` (`buildArgv` + `invokeClaude`); `systemPrompt.ts` (verbatim co-architect prompt + `_VERSION = 1`); `constants.ts` (`CONSULTATION_KILL_FALLBACK_MS = 2000`). Platform-aware cancel: Windows `child.kill()` direct; non-Windows SIGTERM + 2s SIGKILL fallback.
- **Phase 5 (Service + IPC):** `ConsultationService` class with per-project `Map<hash, InFlight>` and `Map<hash, PendingThread>`; binary short-circuit to `CLAUDE_NOT_FOUND`; mode selection (resume on persisted thread, first on pending or fresh); `setWindow(null)` cancels everything; `cancelAllForProject` for project switches. `registerConsultationHandlers` wired into `register.ts` alongside terminal/skill/etc.
- **Phase 6 (Preload):** Verification pass — implementation already in place from Phase 1. `onStreamChunk/Complete/Error` listener factories filter by messageId and return unsubscribe closures.
- **Phase 7 (Store slice):** `consultation` slice with `panel`/`pinState`/`thread`/`pending`/`inFlight`/`lastError`/`selectedModel` fields and 12+ actions; `setProject` triggers `loadConsultationForProject` + preview transition; `switchProject` cancels in-flight before `project.switch`; `rotateForSessionLost` carries failed user message into a fresh `pending` thread.
- **Phase 8 (Hooks):** `usePanelState` selector bridge; `useAutoCloseTimer` (10s state machine — armed only on first outside-click, inside-interaction cancels, second outside-click is no-op, timer re-arms after cancel cycle); `useConsultation` subscribes to push events for current `inFlight.messageId`.
- **Phase 9 (UI + MainShell):** `EdgeTab`, `ConsultationRegion` (closed/open switch), `ConsultationPanel`, `ModelSelector` (editable when `thread === null`, readonly + `NewSessionButton` otherwise), `MessageList`, `MessageBubble` (user / assistant / streaming / error variants with code-specific action buttons), `ChatInput` (Enter submits, Shift+Enter newline, disabled while streaming). Mounted as `flex: 0 0 400px` (open) / `flex: 0 0 28px` (closed) sibling after the existing 240px `<aside>` in `MainShell.tsx`.
- **Phase 10 (Project-switch + SESSION_LOST):** Behavioural code already in place from Phase 7; this phase added end-to-end store tests for project-switch cancel ordering, late-event filtering by messageId-mismatch and `inFlight === null` guards, SESSION_LOST rotation + retry that reuses the rotated session (no double `newSession`), and the orphaned-message strip-on-rotation regression guard.

Final-check resolved two test-only TypeScript regressions exposed by `pnpm typecheck` (which the phases had been bypassing via `npx tsc --noEmit` against the empty root `tsconfig.json`): `RefObject<HTMLElement | null>` widening in `useAutoCloseTimer` and an optional chain on `messages[0]?.content` in the store test.

## Key Decisions

- **`projectRoot` over `projectHash` in IPC contract** (plan Decision §1): the brief assumed a hash→path registry that does not exist; main derives `hashKeyOnly(projectRoot)` deterministically. Mirrors `loadLayout(projectAbsPath)` convention.
- **Default model = `sonnet`, not `opus`** (plan Decision §2): Phase 0 cost data showed Opus turns are 4–5× Sonnet's, and `--max-budget-usd` caps a single call (not a thread). Opus remains user-selectable; `--fallback-model sonnet` only attached when model = opus.
- **First-message vs resume detection from on-disk state** (plan Decision §3): a thread is only persisted on successful complete, so "thread on disk with messages" ≡ "use `--resume`". Survives app restart (in-memory flags would not).
- **`pending: ConsultationPendingThread | null` slice field** (Phase 7 deviation §1): brief supplement §2 requires `thread === null` while a failed first message + error bubble are visible AND the model selector remains editable. `pending` is the holder that satisfies all three constraints; it gets carried over by SESSION_LOST rotation and is consumed by `handleStreamComplete` to materialise `thread`.
- **`ConsultationRegion.tsx` introduced** (Phase 9 deviation §1): keeps `MainShell.tsx` free of `useAtriumStore` reads — the closed/open switch lives in a small dedicated component.
- **`--bare` removed from invocation** (Phase 0 R4 halt): `--bare` strictly disables OAuth/keychain reads, breaking subscription auth. Consequence accepted: CLAUDE.md auto-discovery fires inside the user's project (scoped via `cwd: projectRoot`), and global hooks/plugin-sync run.
- **`--session-id` and `--resume` split** (Phase 0 R3 halt): the brief sketched both flags on every call, which the CLI rejects. `buildArgv` selects exactly one based on `mode`.
- **Action names prefixed with `consultation`** (Phase 7 deviation §2): matches the rest of the store's verbose naming and avoids collisions with future panel/session/error actions on other slices.
- **Late runtime fix for variadic argument slurping** (post-final-check): `--allowedTools <tools...>` and `--add-dir <directories...>` are commander.js variadic options. With `... --allowedTools Read Grep Glob <user message>` they slurped the user message into the tool list, leaving claude with no positional prompt → exit 1 → `INVALID_OUTPUT` ("Invalid response" bubble in the UI). Fix: insert `--` end-of-options marker between `--allowedTools` and the user message in `buildArgv`. Verified empirically against the installed CLI; tests updated.

## Files Changed

### Shared
- `src/shared/consultation.ts` (created)
- `src/shared/errors.ts` (modified — append `ConsultationErrorCode`)
- `src/shared/ipc.ts` (modified — append `IPC.consultation.*`)
- `src/shared/index.ts` (modified — re-export consultation)

### Preload
- `src/preload/api.ts` (modified — `consultation` namespace on `AtriumAPI`)
- `src/preload/index.ts` (modified — implement namespace via invoke + listener-factory pattern)

### Main — storage
- `src/main/storage/paths.ts` (modified — `getConsultationPath`)
- `src/main/storage/index.ts` (modified — re-export)

### Main — consultation module (all created)
- `src/main/consultation/index.ts`
- `src/main/consultation/constants.ts`
- `src/main/consultation/systemPrompt.ts`
- `src/main/consultation/consultationStorage.ts`
- `src/main/consultation/errorMapper.ts`
- `src/main/consultation/streamParser.ts`
- `src/main/consultation/claudeInvoker.ts`
- `src/main/consultation/consultationService.ts`
- `src/main/consultation/__tests__/consultationStorage.test.ts`
- `src/main/consultation/__tests__/errorMapper.test.ts`
- `src/main/consultation/__tests__/streamParser.test.ts`
- `src/main/consultation/__tests__/claudeInvoker.test.ts`
- `src/main/consultation/__tests__/consultationService.test.ts`

### Main — IPC wiring
- `src/main/ipc/consultation.ts` (created — `registerConsultationHandlers`)
- `src/main/ipc/register.ts` (modified — wire consultation handlers)
- `src/main/ipc/__tests__/register.test.ts` (modified — fake service stub)
- `src/main/ipc/__tests__/wiredHandlers.test.ts` (modified — consultation handler describe block)
- `src/main/index.ts` (modified — instantiate `ConsultationService`, set/clear window)

### Renderer — store
- `src/renderer/src/store/atriumStore.ts` (modified — slice + 12 actions + `rotateForSessionLost`)
- `src/renderer/src/store/__tests__/atriumStore.test.ts` (modified — 50+ new tests)

### Renderer — consultation module (all created)
- `src/renderer/src/consultation/EdgeTab.tsx`
- `src/renderer/src/consultation/ConsultationRegion.tsx`
- `src/renderer/src/consultation/ConsultationPanel.tsx`
- `src/renderer/src/consultation/MessageList.tsx`
- `src/renderer/src/consultation/MessageBubble.tsx`
- `src/renderer/src/consultation/ChatInput.tsx`
- `src/renderer/src/consultation/ModelSelector.tsx`
- `src/renderer/src/consultation/NewSessionButton.tsx`
- `src/renderer/src/consultation/hooks/usePanelState.ts`
- `src/renderer/src/consultation/hooks/useAutoCloseTimer.ts`
- `src/renderer/src/consultation/hooks/useConsultation.ts`
- `src/renderer/src/consultation/__tests__/usePanelState.test.ts`
- `src/renderer/src/consultation/__tests__/useAutoCloseTimer.test.tsx`
- `src/renderer/src/consultation/__tests__/useConsultation.test.tsx`
- `src/renderer/src/consultation/__tests__/ModelSelector.test.tsx`
- `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx`

### Renderer — shell
- `src/renderer/src/shell/MainShell.tsx` (modified — mount `<ConsultationRegion />`)
- `src/renderer/src/shell/__tests__/MainShell.test.tsx` (modified — consultation stubs + sibling assertions)

## Gaps/Notes

- **Brief verification checklist §§2–10 (manual smoke tests)** were not exercised in `/final-check` — they require a running Atrium app + live `claude` CLI. Implementation surface for each item is in place; running through them manually after the next dev launch is recommended.
- **Pre-existing watcherManager fs-timing flake**: the full `pnpm test --run` suite shows one failing test in `src/main/fileSync/__tests__/watcherManager.test.ts`; it passes 8/8 in isolation. Documented as a known flake across phases 7/9/10 and the typecheck-fix `fix-result.md`. Not introduced by this feature; out of scope for the consultation work. If desired: `/implement fix "stabilize watcherManager atomic-swap test against fs-timing race"`.
- **Phase verification commands used `npx tsc --noEmit` instead of `pnpm typecheck`**: on Windows, `npx tsc --noEmit` runs against the empty root `tsconfig.json` (`{ "files": [] }`) and exits silently — never typechecks the actual code. The project's official typecheck script is `tsc -b` (project references). Future phase result-files should use `pnpm typecheck` (or `npx tsc -b`) to catch real type errors. Two test-only type errors slipped past every phase this way and were caught only at `/final-check`.
- **Late variadic-slurp fix**: not archived to its own `fix-result.md` before compaction (only the typecheck `fix-result.md` made it). Recorded in this summary's Key Decisions section so the bug + fix is discoverable later.
- **Phase 11 (full verification)** in the original plan was effectively absorbed into `/final-check` + manual gates; no separate `phase-11-result.md` was produced.
- **`feature-docs.md` was not generated** by `/document-work-result` for this feature; no `mental-model.md` / `decision-log.md` / `dependency-map.md` artifacts to copy.
