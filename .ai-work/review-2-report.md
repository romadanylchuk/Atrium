# Review Report: Phase 2
_Date: 2026-04-26_

## Status: HAS_ISSUES

## Must Fix

_(none)_

## Should Fix

- **[src/main/ipc/skill.ts:51]** `skill:runDetached` handler is declared `async` but contains no `await`. The `skill:spawn` handler directly above it carries `// eslint-disable-next-line @typescript-eslint/require-await` for exactly this reason; the new handler was added without it.
  → Either add the same disable comment on the line before `async (_event, rawReq) =>`, or change the final line to `return await runDetached(req)` (preferred — also ensures the error-catching wrapper in `safeHandle` can catch any synchronous throw from `runDetached` during the async turn).

- **[src/main/ipc/__tests__/wiredHandlers.test.ts:495]** `mockRunDetached.mockClear()` is called inside the test body rather than in a `beforeEach`, making this test order-sensitive. If the `skill:runDetached` success test is ever skipped or reordered, the call-count assertion in the "unknown skill" test will be wrong.
  → Add a `beforeEach(() => { vi.mocked(runDetached).mockClear(); })` inside the `describe('skill wired handlers', ...)` block, and remove the manual `.mockClear()` call at line 495. This matches how `vi.clearAllMocks()` is used in the `health wired handlers` describe block.

## Suggestions

- **[src/main/ipc/skill.ts:12]** `VALID_SKILLS` is now a 110-character line. Worth wrapping to a multiline `new Set<string>([...])` for readability, now that the set has grown to 10 members.
  → No functional impact, purely for scan-ability when the set grows further.

- **[src/main/skill/runDetached.ts:22-31]** The E2E binary override block (`ATRIUM_E2E_CLAUDE_BIN` check + `NODE_ENV` + `app.isPackaged`) is copy-pasted verbatim from `healthCheck.ts`. Out of scope for this phase, but the two files will drift if the override conditions ever change.
  → Consider a future refactor to extract this into a `resolveClaudeBinForRun()` helper in `resolveClaudeBin.ts` that encapsulates the override logic; both callers shrink to a single `try/catch` line.

- **[src/main/ipc/__tests__/wiredHandlers.test.ts:476]** The `skill:runDetached` happy-path test only exercises `skill: 'audit'`. Since `DetachedSkillName` has two members, a second parameterised case (or a second it-block) for `skill: 'status'` would confirm both members are accepted.
  → Low-priority; the type already constrains the input, but a 'status' case makes the test resilient to any future narrowing of `VALID_SKILLS`.

## Summary

The core implementation is clean and correct: `runDetached.ts` mirrors `healthCheck.ts` faithfully, the invariant tests are solid, and the preload bridge is wired consistently with existing channels. The two should-fix items are a missing lint-disable comment on the IPC handler and a fragile mock-clear in the test — both are quick fixes. No architectural concerns.
