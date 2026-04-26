import { describe, it, expect } from 'vitest';
import { decideClipboardAction } from '../clipboardKeymap';
import type { KeymapContext } from '../clipboardKeymap';

type KeyInit = Partial<{
  type: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  code: string;
}>;

function makeEvent(init: KeyInit = {}) {
  return {
    type: 'keydown',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    code: 'KeyC',
    ...init,
  };
}

const activeCtx: KeymapContext = { hasSelection: false, status: 'active' };

describe('decideClipboardAction', () => {
  describe('keyup is always passthrough', () => {
    it('KeyC keyup → passthrough', () => {
      const r = decideClipboardAction(makeEvent({ type: 'keyup', ctrlKey: true, code: 'KeyC' }), activeCtx);
      expect(r.kind).toBe('passthrough');
    });

    it('KeyV keyup → passthrough', () => {
      const r = decideClipboardAction(makeEvent({ type: 'keyup', ctrlKey: true, code: 'KeyV' }), activeCtx);
      expect(r.kind).toBe('passthrough');
    });
  });

  describe('Ctrl+C', () => {
    it('with selection → copy-selection', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyC' }),
        { hasSelection: true, status: 'active' },
      );
      expect(r.kind).toBe('copy-selection');
    });

    it('without selection → passthrough (preserves SIGINT)', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyC' }),
        { hasSelection: false, status: 'active' },
      );
      expect(r.kind).toBe('passthrough');
    });
  });

  describe('Ctrl+V', () => {
    it('status active → paste', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'active' },
      );
      expect(r.kind).toBe('paste');
    });

    it('status spawning → swallow', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'spawning' },
      );
      expect(r.kind).toBe('swallow');
    });

    it('status exited → swallow', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'exited' },
      );
      expect(r.kind).toBe('swallow');
    });

    it('status idle → swallow', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'idle' },
      );
      expect(r.kind).toBe('swallow');
    });

    it('status closing → swallow', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'closing' },
      );
      expect(r.kind).toBe('swallow');
    });
  });

  describe('Ctrl+Shift+C', () => {
    it('with selection → copy-selection', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, shiftKey: true, code: 'KeyC' }),
        { hasSelection: true, status: 'active' },
      );
      expect(r.kind).toBe('copy-selection');
    });

    it('without selection → swallow', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, shiftKey: true, code: 'KeyC' }),
        { hasSelection: false, status: 'active' },
      );
      expect(r.kind).toBe('swallow');
    });
  });

  describe('Ctrl+Shift+V', () => {
    it('status active → paste', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, shiftKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'active' },
      );
      expect(r.kind).toBe('paste');
    });

    it('status exited → swallow', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, shiftKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'exited' },
      );
      expect(r.kind).toBe('swallow');
    });
  });

  describe('modifier guard', () => {
    it('altKey true with Ctrl+C → passthrough', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, altKey: true, code: 'KeyC' }),
        { hasSelection: true, status: 'active' },
      );
      expect(r.kind).toBe('passthrough');
    });

    it('metaKey true with Ctrl+V → passthrough', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, metaKey: true, code: 'KeyV' }),
        { hasSelection: false, status: 'active' },
      );
      expect(r.kind).toBe('passthrough');
    });
  });

  describe('non-C/V key', () => {
    it('Ctrl+A → passthrough', () => {
      const r = decideClipboardAction(
        makeEvent({ ctrlKey: true, code: 'KeyA' }),
        activeCtx,
      );
      expect(r.kind).toBe('passthrough');
    });
  });
});
