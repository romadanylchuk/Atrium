import { describe, it, expect } from 'vitest';
import { canvasEmpty, canvasError, canvasLoading, canvasReady } from '../canvasState';

describe('canvasState helpers', () => {
  it('canvasEmpty returns { kind: "empty" }', () => {
    expect(canvasEmpty()).toEqual({ kind: 'empty' });
  });

  it('canvasLoading returns { kind: "loading" }', () => {
    expect(canvasLoading()).toEqual({ kind: 'loading' });
  });

  it('canvasReady returns { kind: "ready" }', () => {
    expect(canvasReady()).toEqual({ kind: 'ready' });
  });

  it('canvasError returns { kind: "error", message }', () => {
    expect(canvasError('boom')).toEqual({ kind: 'error', message: 'boom' });
  });
});
