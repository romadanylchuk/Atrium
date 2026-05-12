# Review Report: Phase 2
_Date: 2026-04-28_

## Status: HAS_ISSUES

## Must Fix
_(none)_

## Should Fix

- **`src/shared/skill/__tests__/composeCommand.test.ts:127`** — `describe('composeConsultationCommand')` is nested inside the `describe('composeCommand')` block rather than being a sibling.  
  → Move the entire `describe('composeConsultationCommand', () => { … })` block (lines 127-172) outside the closing `});` of `describe('composeCommand')`. Test output currently reports them as `composeCommand > composeConsultationCommand > …`, which makes failures ambiguous — it looks like a sub-case of `composeCommand` rather than an independent function's tests.

## Suggestions

- **`src/shared/skill/composeCommand.ts:1`** — `composeConsultationCommand` and its import are placed at the top of the file, before the existing `SkillName` type, `NO_SLUG_SKILLS` set, and `composeCommand` function.  
  → Move the import and the new function to the bottom of the file. In files with a clear primary export, additions that aren't logically coupled to the top-of-file code are easier to scan when appended rather than prepended.

## Summary

The implementation is correct and complete: the function returns the right 13-element array, all flags are in order, the test covers every required assertion, and the plan's element-count error was caught and correctly fixed. The only real issue is that the new `describe` block was accidentally nested inside `describe('composeCommand')` instead of being a top-level sibling — worth fixing before phase 3 lands more tests in the same file.
