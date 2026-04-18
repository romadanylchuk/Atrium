export type TerminalState = 'idle' | 'spawning' | 'active' | 'exited' | 'closing';

const ALLOWED: ReadonlySet<string> = new Set([
  'idle->spawning',
  'spawning->active',
  'spawning->idle',
  'active->exited',
  'exited->closing',
  'closing->idle',
]);

export function canTransition(from: TerminalState, to: TerminalState): boolean {
  return ALLOWED.has(`${from}->${to}`);
}
