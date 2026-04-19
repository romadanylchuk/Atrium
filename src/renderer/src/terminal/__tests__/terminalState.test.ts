import { describe, it, expect } from 'vitest';
import { decideNextTerminalState, resolveInitOutcome } from '../terminalState';

describe('decideNextTerminalState', () => {
  it('returns active when spawning and not yet emitted', () => {
    expect(decideNextTerminalState('spawning', false)).toBe('active');
  });

  it('returns null when spawning but already emitted', () => {
    expect(decideNextTerminalState('spawning', true)).toBeNull();
  });

  it('returns null when status is active', () => {
    expect(decideNextTerminalState('active', false)).toBeNull();
  });

  it('returns null when status is exited', () => {
    expect(decideNextTerminalState('exited', false)).toBeNull();
  });

  it('returns null when status is idle', () => {
    expect(decideNextTerminalState('idle', false)).toBeNull();
  });
});

describe('resolveInitOutcome', () => {
  it('returns success when openResult.ok is true', () => {
    const outcome = resolveInitOutcome({ ok: true, data: {} });
    expect(outcome.kind).toBe('success');
  });

  it('returns not-arch-project when error code is NOT_AN_ARCH_PROJECT', () => {
    const outcome = resolveInitOutcome({
      ok: false,
      error: { code: 'NOT_AN_ARCH_PROJECT', message: 'not an arch project' },
    });
    expect(outcome.kind).toBe('not-arch-project');
  });

  it('returns error with message when error code is something else', () => {
    const outcome = resolveInitOutcome({
      ok: false,
      error: { code: 'IO_ERROR', message: 'disk read failed' },
    });
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.message).toBe('disk read failed');
    }
  });

  it('returns error with unknown message when no message provided', () => {
    const outcome = resolveInitOutcome({ ok: false, error: {} });
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.message).toBe('Unknown error');
    }
  });
});
