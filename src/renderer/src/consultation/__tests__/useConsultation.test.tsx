import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useConsultation } from '../hooks/useConsultation';

const defaultConsultation = () => ({
  panel: { kind: 'closed' as const },
  pinState: false,
  thread: null,
  pending: null,
  inFlight: null,
  lastError: null,
  selectedModel: 'sonnet' as const,
});

interface SubscriptionStub {
  onStreamChunk: ReturnType<typeof vi.fn>;
  onStreamComplete: ReturnType<typeof vi.fn>;
  onStreamError: ReturnType<typeof vi.fn>;
  offChunk: ReturnType<typeof vi.fn>;
  offComplete: ReturnType<typeof vi.fn>;
  offError: ReturnType<typeof vi.fn>;
  emitChunk: (messageId: string, fullText: string) => void;
  emitComplete: (messageId: string, fullContent: string) => void;
  emitError: (messageId: string, err: { code: string; raw?: string }) => void;
}

function stubConsultationApi(): SubscriptionStub {
  const chunkSubs = new Map<string, (fullText: string) => void>();
  const completeSubs = new Map<string, (fullContent: string) => void>();
  const errorSubs = new Map<string, (err: { code: string; raw?: string }) => void>();

  const offChunk = vi.fn();
  const offComplete = vi.fn();
  const offError = vi.fn();

  const onStreamChunk = vi.fn((messageId: string, cb: (fullText: string) => void) => {
    chunkSubs.set(messageId, cb);
    return () => {
      chunkSubs.delete(messageId);
      offChunk();
    };
  });
  const onStreamComplete = vi.fn((messageId: string, cb: (fullContent: string) => void) => {
    completeSubs.set(messageId, cb);
    return () => {
      completeSubs.delete(messageId);
      offComplete();
    };
  });
  const onStreamError = vi.fn(
    (messageId: string, cb: (err: { code: string; raw?: string }) => void) => {
      errorSubs.set(messageId, cb);
      return () => {
        errorSubs.delete(messageId);
        offError();
      };
    },
  );

  vi.stubGlobal('atrium', {
    consultation: { onStreamChunk, onStreamComplete, onStreamError },
  });

  return {
    onStreamChunk,
    onStreamComplete,
    onStreamError,
    offChunk,
    offComplete,
    offError,
    emitChunk: (messageId, fullText) => {
      const cb = chunkSubs.get(messageId);
      if (cb !== undefined) cb(fullText);
    },
    emitComplete: (messageId, fullContent) => {
      const cb = completeSubs.get(messageId);
      if (cb !== undefined) cb(fullContent);
    },
    emitError: (messageId, err) => {
      const cb = errorSubs.get(messageId);
      if (cb !== undefined) cb(err);
    },
  };
}

beforeEach(() => {
  useAtriumStore.setState({ consultation: defaultConsultation() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useConsultation', () => {
  it('does not subscribe when projectRoot is null', () => {
    const api = stubConsultationApi();
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 0 },
      },
    });

    renderHook(() => useConsultation(null));

    expect(api.onStreamChunk).not.toHaveBeenCalled();
    expect(api.onStreamComplete).not.toHaveBeenCalled();
    expect(api.onStreamError).not.toHaveBeenCalled();
  });

  it('does not subscribe when inFlight is null', () => {
    const api = stubConsultationApi();

    renderHook(() => useConsultation('/root'));

    expect(api.onStreamChunk).not.toHaveBeenCalled();
    expect(api.onStreamComplete).not.toHaveBeenCalled();
    expect(api.onStreamError).not.toHaveBeenCalled();
  });

  it('subscribes for the current messageId and forwards chunk/complete/error to the store', () => {
    const api = stubConsultationApi();
    const handleChunk = vi.fn();
    const handleComplete = vi.fn();
    const handleError = vi.fn();
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 0 },
      },
      handleConsultationStreamChunk: handleChunk,
      handleConsultationStreamComplete: handleComplete,
      handleConsultationStreamError: handleError,
    });

    renderHook(() => useConsultation('/root'));

    expect(api.onStreamChunk).toHaveBeenCalledWith('m1', expect.any(Function));
    expect(api.onStreamComplete).toHaveBeenCalledWith('m1', expect.any(Function));
    expect(api.onStreamError).toHaveBeenCalledWith('m1', expect.any(Function));

    act(() => {
      api.emitChunk('m1', 'partial');
      api.emitComplete('m1', 'final');
      api.emitError('m1', { code: 'STREAM_ERROR' });
    });

    expect(handleChunk).toHaveBeenCalledWith('m1', 'partial');
    expect(handleComplete).toHaveBeenCalledWith('m1', 'final');
    expect(handleError).toHaveBeenCalledWith('m1', { code: 'STREAM_ERROR' });
  });

  it('tears down listeners and re-subscribes when messageId changes', () => {
    const api = stubConsultationApi();
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 0 },
      },
    });

    const { rerender } = renderHook(() => useConsultation('/root'));
    expect(api.onStreamChunk).toHaveBeenCalledTimes(1);
    expect(api.onStreamChunk).toHaveBeenLastCalledWith('m1', expect.any(Function));

    act(() => {
      useAtriumStore.setState({
        consultation: {
          ...useAtriumStore.getState().consultation,
          inFlight: { messageId: 'm2', text: 'hi', assistantText: '', startedAt: 1 },
        },
      });
    });
    rerender();

    expect(api.offChunk).toHaveBeenCalledTimes(1);
    expect(api.offComplete).toHaveBeenCalledTimes(1);
    expect(api.offError).toHaveBeenCalledTimes(1);
    expect(api.onStreamChunk).toHaveBeenCalledTimes(2);
    expect(api.onStreamChunk).toHaveBeenLastCalledWith('m2', expect.any(Function));
  });

  it('tears down listeners on unmount', () => {
    const api = stubConsultationApi();
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 0 },
      },
    });

    const { unmount } = renderHook(() => useConsultation('/root'));
    expect(api.onStreamChunk).toHaveBeenCalledTimes(1);

    unmount();

    expect(api.offChunk).toHaveBeenCalledTimes(1);
    expect(api.offComplete).toHaveBeenCalledTimes(1);
    expect(api.offError).toHaveBeenCalledTimes(1);
  });

  it('tears down listeners when projectRoot transitions to null', () => {
    const api = stubConsultationApi();
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 0 },
      },
    });

    const { rerender } = renderHook(({ root }: { root: string | null }) => useConsultation(root), {
      initialProps: { root: '/root' as string | null },
    });
    expect(api.onStreamChunk).toHaveBeenCalledTimes(1);

    rerender({ root: null });

    expect(api.offChunk).toHaveBeenCalledTimes(1);
    expect(api.offComplete).toHaveBeenCalledTimes(1);
    expect(api.offError).toHaveBeenCalledTimes(1);
  });
});
