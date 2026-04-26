# Review Report: Phase 5
_Date: 2026-04-26_

## Status: HAS_ISSUES

## Must Fix

None.

## Should Fix

- **StatusPanel.tsx:97-100** — Missing `clearDetachedRunError('status')` before dispatching.
  When the `status` slice is in the `error` state the user can click More Status again (the button is only disabled for `'waiting'`). Without clearing the error first, the stale `lastDetachedError` stays visible in the Toolbar's `toolbar-error` area the entire time the new run is in flight. `handleAudit` already does this correctly at Toolbar.tsx:50 (`clearDetachedRunError('audit')`); StatusPanel should be symmetric.
  → Add `useAtriumStore.getState().clearDetachedRunError('status');` (or import the action selector) immediately before the `void dispatchDetachedSkill(...)` call. A matching test in `StatusPanel.test.tsx` — "More Status re-click while error showing clears prior error" — should verify `lastDetachedError` is null after the click.

- **Toolbar.tsx:9** — `TabName` is now equivalent to `SkillName`, making the alias misleading.  
  `SkillName` was widened in Phase 1 to include `'status'` and `'finalize'` was in the original union, so `type TabName = SkillName | 'status' | 'finalize'` resolves to `SkillName`. The redundant members give the false impression that `'status'`/`'finalize'` are non-skill tabs.  
  → Simplify to `type TabName = SkillName` (or remove the alias entirely if nothing outside the file uses it).

## Suggestions

- **StatusPanel.tsx:96-100** — The `if (detachedStatusKind === 'waiting') return;` guard inside `onClick` is unreachable: disabled buttons do not fire click events, and the button is already `disabled={detachedStatusKind === 'waiting'}`.  
  → Remove the inner guard; the `disabled` prop is sufficient.

- **Toolbar.test.tsx:73-96** — The 9-button order test never asserts the button count. A 10th button added accidentally would leave the test green.  
  → Add `expect(buttons).toHaveLength(9)` immediately after `screen.getAllByRole('button')`.

## Summary

The implementation is solid: dispatch wiring, waiting-state UX, `lastDetachedError` subscription, and the 9-button reorder all look correct. The one behavioural gap is the missing error-clear in StatusPanel before a retry dispatch — without it a stale error lingers in the toolbar while the new `status` run is in flight, inconsistent with how the Audit button handles the same scenario. The `TabName` redundancy is a minor type-hygiene issue but worth fixing now before more code depends on the alias meaning something distinct.
