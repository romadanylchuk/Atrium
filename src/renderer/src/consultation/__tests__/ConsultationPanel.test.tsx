import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import type { ConsultationErrorCode, ProjectState } from '@shared/index';
import { ConsultationPanel } from '../ConsultationPanel';

type ChunkCb = (fullText: string) => void;
type CompleteCb = (fullContent: string) => void;
type ErrorCb = (err: { code: ConsultationErrorCode; raw?: string }) => void;

interface ApiStub {
  sendMessage: ReturnType<typeof vi.fn>;
  newSession: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  loadThread: ReturnType<typeof vi.fn>;
  emitChunk: (id: string, fullText: string) => void;
  emitComplete: (id: string, fullContent: string) => void;
  emitError: (id: string, err: { code: ConsultationErrorCode; raw?: string }) => void;
}

function stubApi(): ApiStub {
  const chunkSubs = new Map<string, ChunkCb>();
  const completeSubs = new Map<string, CompleteCb>();
  const errorSubs = new Map<string, ErrorCb>();

  const sendMessage = vi.fn(() =>
    Promise.resolve({ ok: true as const, data: { messageId: 'm1' } }),
  );
  const newSession = vi.fn(() =>
    Promise.resolve({ ok: true as const, data: { sessionId: 'sess-1', systemPromptVersion: 1 } }),
  );
  const cancel = vi.fn(() => Promise.resolve({ ok: true as const, data: undefined }));
  const loadThread = vi.fn(() => Promise.resolve({ ok: true as const, data: null }));

  const onStreamChunk = vi.fn((id: string, cb: ChunkCb) => {
    chunkSubs.set(id, cb);
    return () => chunkSubs.delete(id);
  });
  const onStreamComplete = vi.fn((id: string, cb: CompleteCb) => {
    completeSubs.set(id, cb);
    return () => completeSubs.delete(id);
  });
  const onStreamError = vi.fn((id: string, cb: ErrorCb) => {
    errorSubs.set(id, cb);
    return () => errorSubs.delete(id);
  });

  vi.stubGlobal('atrium', {
    consultation: {
      sendMessage,
      newSession,
      cancel,
      loadThread,
      onStreamChunk,
      onStreamComplete,
      onStreamError,
    },
  });

  return {
    sendMessage,
    newSession,
    cancel,
    loadThread,
    emitChunk: (id, t) => {
      const cb = chunkSubs.get(id);
      if (cb !== undefined) cb(t);
    },
    emitComplete: (id, t) => {
      const cb = completeSubs.get(id);
      if (cb !== undefined) cb(t);
    },
    emitError: (id, e) => {
      const cb = errorSubs.get(id);
      if (cb !== undefined) cb(e);
    },
  };
}

function makeProject(): ProjectState {
  return {
    rootPath: '/p/a',
    projectName: 'A',
    projectHash: 'h-a',
    context: { description: '', sections: {} },
    nodes: [],
    connections: [],
    sessions: [],
    warnings: [],
  };
}

const defaultConsultation = () => ({
  panel: { kind: 'open-pinned' as const },
  pinState: true,
  thread: null,
  pending: null,
  inFlight: null,
  lastError: null,
  selectedModel: 'sonnet' as const,
});

beforeEach(() => {
  useAtriumStore.setState({
    project: makeProject(),
    consultation: defaultConsultation(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ConsultationPanel', () => {
  it('renders empty state, sends a message, streams, and completes', async () => {
    const api = stubApi();
    render(<ConsultationPanel />);

    expect(screen.getByTestId('consultation-empty-state')).toBeTruthy();

    const textarea = screen.getByTestId<HTMLTextAreaElement>('consultation-chat-textarea');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByTestId('consultation-send-button'));

    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('/p/a', 'Hello'));

    // newSession reserved before sendMessage on first user turn
    expect(api.newSession).toHaveBeenCalledWith('/p/a', 'sonnet');

    // user bubble + streaming bubble appear
    await waitFor(() => {
      expect(
        screen.getAllByTestId('consultation-bubble').some((el) => el.dataset.variant === 'user'),
      ).toBe(true);
    });

    act(() => {
      api.emitChunk('m1', 'partial');
    });
    await waitFor(() => {
      const stream = screen
        .getAllByTestId('consultation-bubble')
        .find((el) => el.dataset.variant === 'assistant-streaming');
      expect(stream?.textContent).toContain('partial');
    });

    act(() => {
      api.emitComplete('m1', 'Hi there!');
    });

    await waitFor(() => {
      const assistant = screen
        .getAllByTestId('consultation-bubble')
        .find((el) => el.dataset.variant === 'assistant');
      expect(assistant?.textContent).toBe('Hi there!');
    });

    // textarea re-enabled, no more streaming bubble
    expect(textarea.disabled).toBe(false);
    expect(
      screen.queryAllByTestId('consultation-bubble').find(
        (el) => el.dataset.variant === 'assistant-streaming',
      ),
    ).toBeUndefined();

    // ModelSelector flipped to readonly + NewSessionButton mounted
    expect(screen.getByTestId('consultation-model-selector').dataset.mode).toBe('readonly');
    expect(screen.getByTestId('consultation-new-session-button')).toBeTruthy();
  });

  it('shows error bubble with Sign-in button on first-message NOT_AUTHENTICATED', async () => {
    const api = stubApi();
    render(<ConsultationPanel />);

    const textarea = screen.getByTestId<HTMLTextAreaElement>('consultation-chat-textarea');
    fireEvent.change(textarea, { target: { value: 'Hi' } });
    fireEvent.click(screen.getByTestId('consultation-send-button'));

    await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());

    act(() => {
      api.emitError('m1', { code: 'NOT_AUTHENTICATED' });
    });

    await waitFor(() => {
      const err = screen
        .getAllByTestId('consultation-bubble')
        .find((el) => el.dataset.variant === 'error');
      expect(err?.dataset.code).toBe('NOT_AUTHENTICATED');
    });

    expect(screen.getByTestId('consultation-error-action-signin')).toBeTruthy();

    // Thread stays in EmptyThreadMode — model still editable
    expect(screen.getByTestId('consultation-model-selector').dataset.mode).toBe('editable');

    // Failed user message remains visible
    expect(
      screen.getAllByTestId('consultation-bubble').some((el) => el.dataset.variant === 'user'),
    ).toBe(true);
  });

  it('cancels mid-stream — cancel IPC fires, no error bubble, input re-enabled', async () => {
    const api = stubApi();
    render(<ConsultationPanel />);

    const textarea = screen.getByTestId<HTMLTextAreaElement>('consultation-chat-textarea');
    fireEvent.change(textarea, { target: { value: 'Stop me' } });
    fireEvent.click(screen.getByTestId('consultation-send-button'));

    await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());

    act(() => {
      api.emitChunk('m1', 'partial');
    });

    const cancelBtn = await screen.findByTestId('consultation-cancel-button');
    fireEvent.click(cancelBtn);

    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('/p/a', 'm1'));

    // Late CANCELLED stream-error: store filters it out via messageId guard
    act(() => {
      api.emitError('m1', { code: 'CANCELLED' });
    });

    await waitFor(() => {
      expect(useAtriumStore.getState().consultation.inFlight).toBeNull();
    });

    expect(useAtriumStore.getState().consultation.lastError).toBeNull();
    expect(textarea.disabled).toBe(false);

    // No error bubble rendered
    expect(
      screen.queryAllByTestId('consultation-bubble').find(
        (el) => el.dataset.variant === 'error',
      ),
    ).toBeUndefined();
  });

  it('SESSION_LOST: rotates thread, carries user message into new thread, shows Retry', async () => {
    const api = stubApi();
    render(<ConsultationPanel />);

    const textarea = screen.getByTestId<HTMLTextAreaElement>('consultation-chat-textarea');
    fireEvent.change(textarea, { target: { value: 'old session msg' } });
    fireEvent.click(screen.getByTestId('consultation-send-button'));

    await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());

    // The first newSession is the auto-reservation. Set up second response
    // (the rotation uses the same mock and will return the same shape — fine).
    api.newSession.mockResolvedValueOnce({
      ok: true,
      data: { sessionId: 'sess-2', systemPromptVersion: 1 },
    });

    act(() => {
      api.emitError('m1', { code: 'SESSION_LOST' });
    });

    // SESSION_LOST is async (rotation runs in background)
    await waitFor(() => {
      const c = useAtriumStore.getState().consultation;
      expect(c.lastError?.code).toBe('SESSION_LOST');
      expect(c.pending?.sessionId).toBe('sess-2');
      expect(c.pending?.messages.find((m) => m.id === 'm1')?.content).toBe('old session msg');
    });

    // newSession invoked twice — once for initial reservation, once for rotation
    expect(api.newSession).toHaveBeenCalledTimes(2);

    // Error bubble with Retry action
    await waitFor(() => {
      expect(screen.getByTestId('consultation-error-action-retry')).toBeTruthy();
    });

    // The carried user message remains visible
    expect(
      screen.getAllByTestId('consultation-bubble').some(
        (el) => el.dataset.variant === 'user' && el.textContent === 'old session msg',
      ),
    ).toBe(true);
  });
});
