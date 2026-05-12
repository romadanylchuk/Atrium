# Review Report: Phase 4 (Preload API + Bridge)
_Date: 2026-04-28_

## Status: HAS_ISSUES

## Must Fix
_(none)_

## Should Fix

- **src/preload/__tests__/api.type-test.ts** — Missing type assertion for `consultation.spawnTerminal`. Every other namespace (project, dialog, fileSync, terminal, health, layout, skill) has at least one `expectTypeOf` assertion. `consultation` has none. A future refactor that changes the return type or arg shape will silently pass typecheck if the assertion isn't there.
  → Add:
  ```typescript
  test('AtriumAPI.consultation.spawnTerminal returns Promise<Result<TerminalId, TerminalErrorCode>>', () => {
    expectTypeOf<AtriumAPI['consultation']['spawnTerminal']>()
      .returns.resolves.toEqualTypeOf<Result<TerminalId, TerminalErrorCode>>();
  });
  ```
  Mirror the existing `skill.spawn` pattern (line 150–153).

- **src/preload/__tests__/preload.runtime.test.ts** — Missing runtime dispatch test for `consultation.spawnTerminal`. The `skill` namespace (lines 319–333) has a test that verifies `ipcRenderer.invoke` is called with `IPC.skill.spawn` and the payload. `consultation` has no equivalent, so a channel-name typo or wrong dispatch pattern would go undetected.
  → Add a `describe('consultation namespace — runtime shape')` block that calls `spawnTerminal({ cwd: '/tmp/proj' })` and asserts `mockInvoke` was called once with `IPC.consultation.spawnTerminal` and the args object. Mirror the `skill.spawn` test exactly.

## Suggestions

- **src/preload/api.ts:69–71** — The inline type `{ cwd: string }` on `spawnTerminal` is correct but diverges slightly from how other method args are typed (other methods use imported shared types). Not a problem here since the arg is trivial; a named type alias in `@shared/skill/spawn` would only add indirection. Keep as-is unless a second consultation method needs the same shape.

## Summary

The two changed files are clean, minimal, and follow the established bridge pattern faithfully. The only gaps are in the test files: `consultation` is the sole namespace in both `api.type-test.ts` and `preload.runtime.test.ts` without coverage. Adding two short test blocks closes the regression gap before phase 5 adds callers that depend on this surface.
