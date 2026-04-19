export type CanvasState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export const canvasEmpty = (): CanvasState => ({ kind: 'empty' });
export const canvasLoading = (): CanvasState => ({ kind: 'loading' });
export const canvasReady = (): CanvasState => ({ kind: 'ready' });
export const canvasError = (message: string): CanvasState => ({ kind: 'error', message });
