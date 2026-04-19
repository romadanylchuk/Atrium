import type { TerminalStatus } from '@renderer/store/atriumStore';

export function canSwitch(status: TerminalStatus): boolean {
  return status === 'idle' || status === 'exited';
}
