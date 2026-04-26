# Review Report: Phase 1
_Date: 2026-04-26_

## Status: PASSED

## Must Fix

_None._

## Should Fix

- **`src/main/ipc/__tests__/wiredHandlers.test.ts:449`** — The new `skill wired handlers` describe block parameterizes only `['new', 'triage', 'audit', 'status']`. The six pre-existing skills (`init`, `explore`, `decide`, `map`, `finalize`, `free`) have zero IPC-handler-level test coverage anywhere in this file. Any future breakage in `VALID_SKILLS` for those skills would go undetected.
  → Extend the `.each` array to `['init', 'explore', 'decide', 'map', 'finalize', 'free', 'new', 'triage', 'audit', 'status'] as const` and cover all ten in the same parameterized test.

## Suggestions

- **`src/shared/skill/composeCommand.ts:24-38`** — `'new'`, `'audit'`, and `'status'` each have their own explicit if-block, but all three produce `['claude', '/architector:${p.skill}']` — identical output pattern. A named set (e.g. `NO_SLUG_SKILLS`) and a single branch would make the intent explicit and keep future no-slug additions as one-line entries rather than new if-blocks.
  → ```ts
  const NO_SLUG_SKILLS = new Set(['new', 'audit', 'status'] as const);
  if (NO_SLUG_SKILLS.has(p.skill)) return ['claude', `/architector:${p.skill}`];
  ```

- **`src/shared/skill/__tests__/composeCommand.test.ts:59-70`** — `triage` is tested with 0 nodes and 2 nodes but not with a single node. The join behavior is trivially correct (`['a'].join(' ')` → `'a'`), but the single-node path is how most toolbar invocations will look when exactly one node is selected.
  → Add `it('triage with single node', ...)` matching `['claude', '/architector:triage auth-node']`.

- **`src/shared/skill/__tests__/composeCommand.test.ts:81`** — `'free'` is excluded from the `--append-system-prompt-file` parameterized test without a comment explaining why. A future reader may wonder whether it was forgotten.
  → Either include `'free'` (the assertion trivially holds) or add a brief inline comment: `// 'free' excluded: returns ['claude'] only, no slash command`.

## Summary

The implementation is correct, minimal, and consistent with the plan. All four new skills are wired end-to-end — `SkillName`, `composeCommand`, `VALID_SKILLS`, and the IPC test all agree. The only meaningful gap is that the pre-existing six skills are untested at the IPC handler level in the new test block; fixing that coverage now is cheaper than discovering a regression later.
