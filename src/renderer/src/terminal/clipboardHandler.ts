import type { Terminal } from 'xterm';
import type { TerminalId } from '@shared/domain';
import { decideClipboardAction } from './clipboardKeymap';
import type { KeymapContext } from './clipboardKeymap';
import { encodeBracketedPaste } from './bracketedPaste';

export interface ClipboardHandlerOptions {
  /** Reads the live terminal status at event time. */
  getStatus: () => KeymapContext['status'];
  /** Reads the live terminal id at event time. */
  getId: () => TerminalId | null;
}

/**
 * Wires xterm clipboard parity (Ctrl+C copy / SIGINT-passthrough, Ctrl+Shift+C swallow,
 * Ctrl+V bracketed paste, status-gated and race-protected) onto an xterm Terminal.
 *
 * `getStatus` and `getId` are read at event time so the handler always sees the live
 * store slice, not the value captured when the effect ran.
 */
export function attachClipboardHandler(
  xterm: Terminal,
  { getStatus, getId }: ClipboardHandlerOptions,
): void {
  xterm.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
    const selection = xterm.hasSelection() ? xterm.getSelection() : '';
    const action = decideClipboardAction(e, {
      hasSelection: selection.length > 0,
      status: getStatus(),
    });
    switch (action.kind) {
      case 'passthrough':
        return true;
      case 'swallow':
        e.preventDefault();
        return false;
      case 'copy-selection':
        e.preventDefault();
        void navigator.clipboard.writeText(selection).catch(() => {});
        xterm.clearSelection();
        return false;
      case 'paste': {
        e.preventDefault();
        const currentId = getId();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (!text || !currentId) return;
            if (getStatus() !== 'active') return;
            const wrapped = encodeBracketedPaste(text);
            if (!wrapped) return;
            const enc = new TextEncoder().encode(wrapped);
            window.atrium.terminal.write(currentId, enc.buffer);
          })
          .catch(() => {});
        return false;
      }
      default: {
        const _exhaustive: never = action;
        void _exhaustive;
        return true;
      }
    }
  });
}
