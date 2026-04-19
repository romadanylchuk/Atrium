import type { TerminalStatus } from '../store/atriumStore';

/**
 * Returns the next terminal status after receiving the first data chunk
 * from a spawning terminal. Guards against double-fire.
 */
export function decideNextTerminalState(
  current: TerminalStatus,
  hasEmittedActive: boolean,
): TerminalStatus | null {
  if (current === 'spawning' && !hasEmittedActive) return 'active';
  return null;
}

export type InitOutcome =
  | { kind: 'success' }
  | { kind: 'not-arch-project' }
  | { kind: 'error'; message: string };

/**
 * Interprets a project.open result after an init spawn exits,
 * returning a typed outcome for the caller to act on.
 */
export function resolveInitOutcome(
  openResult: { ok: boolean; data?: unknown; error?: { code?: string; message?: string } },
): InitOutcome {
  if (openResult.ok) return { kind: 'success' };
  const code = openResult.error?.code;
  if (code === 'NOT_AN_ARCH_PROJECT') return { kind: 'not-arch-project' };
  return { kind: 'error', message: openResult.error?.message ?? 'Unknown error' };
}
