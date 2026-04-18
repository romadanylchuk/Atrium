import { describe, it, expect } from 'vitest';
import { canTransition, type TerminalState } from '../state';

const STATES: TerminalState[] = ['idle', 'spawning', 'active', 'exited', 'closing'];

const ALLOWED: ReadonlySet<string> = new Set([
  'idle->spawning',
  'spawning->active',
  'spawning->idle',
  'active->exited',
  'exited->closing',
  'closing->idle',
]);

describe('canTransition — exhaustive 5×5 matrix', () => {
  it('returns true for all 6 allowed transitions and false for all 19 disallowed ones', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const expected = ALLOWED.has(`${from}->${to}`);
        expect(
          canTransition(from, to),
          `${from} → ${to} should be ${expected}`,
        ).toBe(expected);
      }
    }
  });
});
