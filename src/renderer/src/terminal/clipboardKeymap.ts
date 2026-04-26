import type { TerminalStatus } from '../store/atriumStore';

export type ClipboardAction =
  | { kind: 'copy-selection' }
  | { kind: 'paste' }
  | { kind: 'swallow' }
  | { kind: 'passthrough' };

export type KeymapContext = {
  hasSelection: boolean;
  status: TerminalStatus;
};

const PASSTHROUGH: ClipboardAction = { kind: 'passthrough' };
const SWALLOW: ClipboardAction = { kind: 'swallow' };
const COPY: ClipboardAction = { kind: 'copy-selection' };
const PASTE: ClipboardAction = { kind: 'paste' };

export function decideClipboardAction(
  e: Pick<KeyboardEvent, 'type' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'code'>,
  ctx: KeymapContext,
): ClipboardAction {
  if (e.type !== 'keydown') return PASSTHROUGH;
  if (!e.ctrlKey || e.altKey || e.metaKey) return PASSTHROUGH;

  const shifted = e.shiftKey;

  if (e.code === 'KeyC') {
    if (ctx.hasSelection) return COPY;
    return shifted ? SWALLOW : PASSTHROUGH;
  }

  if (e.code === 'KeyV') {
    return ctx.status === 'active' ? PASTE : SWALLOW;
  }

  return PASSTHROUGH;
}
