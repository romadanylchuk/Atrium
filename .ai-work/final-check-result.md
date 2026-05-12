# Final Check: Replace Consultation Chat with Consultation Terminal
_Date: 2026-04-28 (re-audit)_

## Status: DONE

## Verified

### Expected Behavior

- [x] Panel open → `consultation:spawnTerminal` IPC invoked with `{ cwd: project.rootPath }`
- [x] Returned terminal ID stored in `consultationTerminal.id` (Zustand slice)
- [x] xterm.js mounts inside panel, subscribes to `terminal:onData/onExit/onError` keyed on `id`
- [x] Panel width: `flex: 0 0 400px` — confirmed in ConsultationPanel.tsx:104
- [x] Header: "Consultation" label only — no ModelSelector, no Pin, no Close
- [x] Terminal background: `#20202a` (xterm theme override) — confirmed in ConsultationPanel.tsx:38
- [x] Auto-close timer unchanged — `useAutoCloseTimer` still wired to `panelRef`
- [x] Panel collapse does NOT kill terminal process — `clearConsultationTerminal` not called on close
- [x] Panel re-open re-mounts xterm on same terminal ID — no output replay
- [x] Project switch: `clearConsultationTerminal()` called before `project.switch()` IPC — atriumStore.ts:259
- [x] Terminal exit → `status='exited'` → Restart button rendered in header
- [x] Restart button calls `clearConsultationTerminal()` → id=null, status=idle → hook re-triggers new spawn

### CLI Command

- [x] `composeConsultationCommand` returns 13-element argv starting with `'claude'`
- [x] Flags: `--model opus`, `--permission-mode dontAsk`, `--system-prompt <PROMPT>`, `--add-dir <root>`, `--allowedTools Read Grep Glob`
- [x] No `-p`, `--output-format`, `--session-id`, `--max-budget-usd`
- [x] `CONSULTATION_SYSTEM_PROMPT` correctly sourced from `@shared/consultation/systemPrompt`

### Edge Cases

- [x] No project open: `ConsultationRegion` returns `null` when `project === null` — ConsultationRegion.tsx:10
- [x] Skill terminal active simultaneously: independent IDs, no store conflicts
- [x] Spawn race: `statusRef.current !== 'idle'` guard prevents double-spawn — useConsultationTerminal.ts:22
- [x] Panel close mid-spawn: cleanup calls `clearConsultationTerminal()` guarded by `statusRef.current === 'spawning'` — useConsultationTerminal.ts:35-38
- [x] System prompt as argv element: direct string[] element, no shell escaping needed

### Out of Scope — Confirmed Not Accidentally Implemented

- [x] Consultation service files still on disk as dead code (`consultationService.ts`, `claudeInvoker.ts`, `streamParser.ts`, etc.)
- [x] EdgeTab label unchanged ("Chat") — EdgeTab.tsx:34
- [x] No session persistence or replay
- [x] No auto-open on project load (still EdgeTab-gated)
- [x] No changes to `composeCommand()` for existing skills

## IPC/Contract Integrity

- [x] `AtriumAPI.consultation` preload surface: single `spawnTerminal` method — api.ts:69-71
- [x] Preload bridge: `ipcRenderer.invoke(IPC.consultation.spawnTerminal, args)` — index.ts:185-187
- [x] `registerIpc` managers type: no `consultationService` — register.ts:40-44
- [x] `ConsultationService` removed from `main/index.ts` — no instantiation, no `setWindow` calls
- [x] Old 4-handler block replaced by single `consultation:spawnTerminal` test in wiredHandlers.test.ts

## Deleted Files (All Confirmed Gone)

- [x] `hooks/useConsultation.ts`
- [x] `ChatInput.tsx`, `MessageBubble.tsx`, `MessageList.tsx`, `ModelSelector.tsx`, `NewSessionButton.tsx`
- [x] `__tests__/useConsultation.test.tsx`, `__tests__/ModelSelector.test.tsx`

## Regressions

None within feature scope. 908 tests pass across 75 test files.

**Pre-existing failures (not regressions):** 4 tests in dead-code files `claudeInvoker.test.ts` and `errorMapper.test.ts` reference a missing fixture `.ai-work/phase0/r1-happy.jsonl`. These files are not modified by this feature and were failing before implementation.

**Plan counting error (not a code issue):** Plan stated "11 elements" for `composeConsultationCommand`; correct count is 13. Implementation and test both assert 13 correctly.
