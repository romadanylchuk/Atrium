# Phase 6 Result: Renderer Components — Rewrite and Delete
_Plan: `.ai-work/feature-plan.md`_
_Date: 2026-04-28_

## Status: VERIFIED

## What Was Implemented

- `src/renderer/src/consultation/hooks/useConsultationTerminal.ts` — created; effect hook that fires `consultation:spawnTerminal` IPC when panel is open, projectRoot is non-null, and status is `'idle'`; guards on `status === 'spawning'` to prevent race; `cancelled` flag prevents stale promise callbacks
- `src/renderer/src/consultation/ConsultationPanel.tsx` — rewritten; replaced chat UI with xterm.js pane; imports `Terminal`, `FitAddon`, `XTERM_THEME`, `XTERM_FONT_FAMILY`; uses `useConsultationTerminal` hook; mount/unmount xterm keyed on `consultationTerminal.id`; `onData`/`onExit`/`onError` subscriptions forward to store actions; `ResizeObserver` refits xterm on container resize; "Connecting…" indicator when `status='spawning'`; "Restart" button when `status='exited'`; header label changed from "Chat" to "Consultation"; removed Pin/Close buttons and ModelSelector
- `src/renderer/src/consultation/ConsultationRegion.tsx` — added `useAtriumStore` project selector; returns `null` when `project === null`; return type changed from `JSX.Element` to `JSX.Element | null`
- `src/renderer/src/consultation/hooks/useConsultation.ts` — deleted (dead)
- `src/renderer/src/consultation/ChatInput.tsx` — deleted (dead)
- `src/renderer/src/consultation/MessageList.tsx` — deleted (dead)
- `src/renderer/src/consultation/MessageBubble.tsx` — deleted (dead)
- `src/renderer/src/consultation/ModelSelector.tsx` — deleted (dead)
- `src/renderer/src/consultation/NewSessionButton.tsx` — deleted (dead)
- `src/renderer/src/consultation/__tests__/useConsultation.test.tsx` — deleted (dead)
- `src/renderer/src/consultation/__tests__/ModelSelector.test.tsx` — deleted (dead)
- `src/renderer/src/consultation/__tests__/ConsultationPanel.test.tsx` — rewritten with three new tests: xterm container renders when id is null/status idle; "Connecting…" indicator visible when status is spawning; Restart button visible when status is exited; mocks xterm, xterm-addon-fit, and xterm/css/xterm.css to prevent jsdom failures
- `src/renderer/src/shell/__tests__/MainShell.test.tsx` — added `makeProject()` helper; updated 3 tests that check for consultation region elements to set `project` in store (required by the new `ConsultationRegion` null guard); also added `ProjectState` type import

## Deviations from Plan

None. The MainShell.test.tsx updates were a necessary consequence of the `ConsultationRegion` null guard — the plan notes this as the expected behavior and the tests needed to set a project for the consultation region to render.

## Gaps Found (if any)

None.

## Ready for Phase 7 (if any) / Final Check

All 476 renderer tests pass. No TypeScript errors in any Phase 6 files. Phase 6 is the final phase — run `/final-check` to verify the complete implementation.
