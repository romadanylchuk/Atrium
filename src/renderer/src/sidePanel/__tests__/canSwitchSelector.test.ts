import { describe, it, expect } from 'vitest';
import { canSwitch } from '../canSwitchSelector';
import type { TerminalStatus } from '@renderer/store/atriumStore';

describe('canSwitch', () => {
  it('returns true when idle', () => {
    expect(canSwitch('idle' as TerminalStatus)).toBe(true);
  });

  it('returns true when exited', () => {
    expect(canSwitch('exited' as TerminalStatus)).toBe(true);
  });

  it('returns false when spawning', () => {
    expect(canSwitch('spawning' as TerminalStatus)).toBe(false);
  });

  it('returns false when active', () => {
    expect(canSwitch('active' as TerminalStatus)).toBe(false);
  });

  it('returns false when closing', () => {
    expect(canSwitch('closing' as TerminalStatus)).toBe(false);
  });
});
