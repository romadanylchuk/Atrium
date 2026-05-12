# Review Report: Phase 3
_Date: 2026-04-28_

## Status: HAS_ISSUES

## Must Fix

_(none)_

## Should Fix

- **`src/main/consultation/index.ts:6`** — JSDoc in the barrel still says `registerConsultationHandlers` (deleted in this phase), which no longer exists.
  → Update the `@Consumers` comment to reference `registerConsultationSpawnHandler` instead.

## Suggestions

- **`src/main/ipc/__tests__/register.test.ts:66`** — `PUSH_ONLY_CHANNELS` is doing double duty: it holds both genuinely push-only channels (`fileSync:onChanged`, `terminal:onData/onExit/onError`) and dead/never-registered consultation channels (`loadThread`, `sendMessage`, `newSession`, `cancel`). The in-line comment explains this, but the variable name is misleading — a reader has to read the comment to understand why `consultation:loadThread` is in a set called `PUSH_ONLY_CHANNELS`.
  → Rename to `UNREGISTERED_CHANNELS`, or split into two sets (`PUSH_ONLY_CHANNELS` and `DEAD_CHANNELS`) with the existing comments attached to each.

- **`src/main/consultation/index.ts:13`** — The barrel re-exports `registerConsultationSpawnHandler` from `@main/ipc/consultation`, but `src/main/ipc/register.ts` imports directly from `'./consultation'` (the IPC file), not from `@main/consultation` (this barrel). If nothing else imports the function via the barrel path, this re-export is vestigial.
  → Grep for `from '@main/consultation'` across the codebase. If no consumer imports `registerConsultationSpawnHandler` through the barrel, remove line 13.

## Summary

The core implementation is clean and well-scoped. `consultation.ts`, `register.ts`, `index.ts`, and the tests all follow established patterns (`rawArgs as { cwd: string }` mirrors `skill.ts`; the `safeHandle` + `eslint-disable require-await` pairing is consistent). The one should-fix is a stale JSDoc in the consultation barrel that references a now-deleted function name — low risk but will mislead future readers navigating via the barrel comment.
