import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ConsultationService } from '../consultationService.js';
import type { InvokeCallbacks, InvokeHandle, InvokeRequest } from '../claudeInvoker.js';
import type { ConsultationFile } from '@shared/consultation.js';
import { ConsultationErrorCode } from '@shared/errors.js';
import { IPC } from '@shared/ipc.js';
import { ok, err } from '@shared/result.js';
import { hashKeyOnly } from '@main/storage';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = '/home/user/test-project';
const CLAUDE_BIN = '/usr/local/bin/claude';

interface CapturedInvoke {
  req: InvokeRequest;
  cb: InvokeCallbacks;
  handle: InvokeHandle;
  cancelled: boolean;
}

function makeFakeInvoker(): {
  invoke: (req: InvokeRequest, cb: InvokeCallbacks) => InvokeHandle;
  captured: CapturedInvoke[];
} {
  const captured: CapturedInvoke[] = [];
  const invoke = vi.fn((req: InvokeRequest, cb: InvokeCallbacks): InvokeHandle => {
    const entry: CapturedInvoke = {
      req,
      cb,
      cancelled: false,
      handle: {
        cancel: vi.fn(() => {
          entry.cancelled = true;
        }),
        done: Promise.resolve(),
      },
    };
    captured.push(entry);
    return entry.handle;
  });
  return { invoke, captured };
}

function makeFakeStorage(initial: ConsultationFile | null = null): {
  loadConsultation: ReturnType<typeof vi.fn>;
  appendMessages: ReturnType<typeof vi.fn>;
  rotateThread: ReturnType<typeof vi.fn>;
  state: { file: ConsultationFile | null };
} {
  const state = { file: initial };

  const loadConsultation = vi.fn(() => Promise.resolve(ok(state.file)));

  const appendMessages = vi.fn(() => Promise.resolve(ok(undefined)));

  const rotateThread = vi.fn(
    (_root: string, nt: { threadId: string; sessionId: string; model: 'opus' | 'sonnet' }) => {
      const next: ConsultationFile = {
        schemaVersion: 1,
        activeThreadId: nt.threadId,
        threads: {
          [nt.threadId]: {
            sessionId: nt.sessionId,
            createdAt: 1,
            lastActiveAt: 1,
            model: nt.model,
            systemPromptVersion: 1,
            messages: [],
          },
        },
        orphanedThreads: [],
      };
      state.file = next;
      return Promise.resolve(ok(next));
    },
  );

  return { loadConsultation, appendMessages, rotateThread, state };
}

function makeFakeWindow(): {
  window: { webContents: { send: ReturnType<typeof vi.fn> }; isDestroyed(): boolean };
  sends: Array<{ channel: string; payload: unknown }>;
} {
  const sends: Array<{ channel: string; payload: unknown }> = [];
  const window = {
    webContents: {
      send: vi.fn((channel: string, payload: unknown) => {
        sends.push({ channel, payload });
      }),
    },
    isDestroyed: () => false,
  };
  return { window, sends };
}

function makeServiceWithDoubles(options: {
  initial?: ConsultationFile | null;
  claudeBin?: string | null;
} = {}) {
  const invoker = makeFakeInvoker();
  const storage = makeFakeStorage(options.initial ?? null);
  const binValue: string | null = 'claudeBin' in options
    ? (options.claudeBin ?? null)
    : CLAUDE_BIN;
  const service = new ConsultationService({
    invoke: invoker.invoke,
    storage,
    getClaudeBin: () => binValue,
  });
  const windowPair = makeFakeWindow();
  service.setWindow(windowPair.window as never);
  return { service, invoker, storage, window: windowPair.window, sends: windowPair.sends };
}

function makeFileWithThread(overrides: {
  sessionId?: string;
  model?: 'opus' | 'sonnet';
  messageCount?: number;
  threadId?: string;
} = {}): ConsultationFile {
  const threadId = overrides.threadId ?? 'main';
  const sessionId = overrides.sessionId ?? 'session-existing';
  const model = overrides.model ?? 'sonnet';
  const count = overrides.messageCount ?? 2;
  const messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; ts: number }> =
    Array.from({ length: count }, (_, i) => ({
      id: `m-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg ${i}`,
      ts: 1000 + i,
    }));
  return {
    schemaVersion: 1,
    activeThreadId: threadId,
    threads: {
      [threadId]: {
        sessionId,
        createdAt: 1000,
        lastActiveAt: 2000,
        model,
        systemPromptVersion: 1,
        messages,
      },
    },
    orphanedThreads: [],
  };
}

// ---------------------------------------------------------------------------
// loadThread
// ---------------------------------------------------------------------------

describe('ConsultationService.loadThread', () => {
  it('delegates to storage.loadConsultation and forwards the result', async () => {
    const existing = makeFileWithThread();
    const { service, storage } = makeServiceWithDoubles({ initial: existing });

    const result = await service.loadThread(PROJECT_ROOT);
    expect(storage.loadConsultation).toHaveBeenCalledWith(PROJECT_ROOT);
    expect(result).toEqual(ok(existing));
  });
});

// ---------------------------------------------------------------------------
// sendMessage — happy path
// ---------------------------------------------------------------------------

describe('ConsultationService.sendMessage — happy path', () => {
  it('spawns invoker, emits streamChunk and streamComplete, persists user+assistant messages', async () => {
    const { service, invoker, storage, sends } = makeServiceWithDoubles();

    const res = await service.sendMessage(PROJECT_ROOT, 'hello world');
    expect(res.ok).toBe(true);

    expect(invoker.captured).toHaveLength(1);
    const captured = invoker.captured[0]!;
    expect(captured.req.claudeBin).toBe(CLAUDE_BIN);
    expect(captured.req.userMessage).toBe('hello world');
    expect(captured.req.mode).toBe('first');
    expect(captured.req.model).toBe('sonnet');
    expect(captured.req.projectRoot).toBe(PROJECT_ROOT);

    captured.cb.onChunk('partial');
    captured.cb.onChunk('partial answer');
    captured.cb.onComplete('final answer');
    await Promise.resolve();
    await Promise.resolve();

    const chunkSends = sends.filter((s) => s.channel === IPC.consultation.streamChunk);
    expect(chunkSends).toHaveLength(2);
    expect((chunkSends[1]!.payload as { fullText: string }).fullText).toBe('partial answer');

    const completeSends = sends.filter((s) => s.channel === IPC.consultation.streamComplete);
    expect(completeSends).toHaveLength(1);
    expect((completeSends[0]!.payload as { fullContent: string }).fullContent).toBe('final answer');

    expect(storage.appendMessages).toHaveBeenCalledOnce();
    const appendArgs = storage.appendMessages.mock.calls[0]![1] as {
      userMessage: { content: string };
      assistantMessage: { content: string };
    };
    expect(appendArgs.userMessage.content).toBe('hello world');
    expect(appendArgs.assistantMessage.content).toBe('final answer');
  });
});

// ---------------------------------------------------------------------------
// sendMessage — error paths
// ---------------------------------------------------------------------------

describe('ConsultationService.sendMessage — error paths', () => {
  it('returns CLAUDE_NOT_FOUND when getClaudeBin returns null, without spawning', async () => {
    const { service, invoker } = makeServiceWithDoubles({ claudeBin: null });

    const res = await service.sendMessage(PROJECT_ROOT, 'hi');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ConsultationErrorCode.CLAUDE_NOT_FOUND);
    }
    expect(invoker.captured).toHaveLength(0);
  });

  it('emits streamError and does not persist when invoker onError fires', async () => {
    const { service, invoker, storage, sends } = makeServiceWithDoubles();

    const res = await service.sendMessage(PROJECT_ROOT, 'hi');
    expect(res.ok).toBe(true);

    invoker.captured[0]!.cb.onError(ConsultationErrorCode.NOT_AUTHENTICATED, 'not logged in');
    await Promise.resolve();

    const errorSends = sends.filter((s) => s.channel === IPC.consultation.streamError);
    expect(errorSends).toHaveLength(1);
    const payload = errorSends[0]!.payload as { code: string; raw?: string };
    expect(payload.code).toBe(ConsultationErrorCode.NOT_AUTHENTICATED);
    expect(payload.raw).toBe('not logged in');
    expect(storage.appendMessages).not.toHaveBeenCalled();
  });

  it('rejects concurrent sendMessage while one is in-flight for the same project', async () => {
    const { service, invoker } = makeServiceWithDoubles();

    const [a, b] = await Promise.all([
      service.sendMessage(PROJECT_ROOT, 'first'),
      service.sendMessage(PROJECT_ROOT, 'second'),
    ]);

    // Exactly one call wins the reservation; the other returns INTERNAL.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(invoker.captured).toHaveLength(1);
    const loser = a.ok ? b : a;
    if (!loser.ok) {
      expect(loser.error.code).toBe(ConsultationErrorCode.INTERNAL);
    }
  });

  it('returns INTERNAL when invoker throws synchronously', async () => {
    const storage = makeFakeStorage(null);
    const service = new ConsultationService({
      invoke: () => {
        throw new Error('spawn exploded');
      },
      storage,
      getClaudeBin: () => CLAUDE_BIN,
    });

    const res = await service.sendMessage(PROJECT_ROOT, 'hi');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ConsultationErrorCode.INTERNAL);
      expect(res.error.message).toContain('spawn exploded');
    }
  });
});

// ---------------------------------------------------------------------------
// sendMessage — mode selection
// ---------------------------------------------------------------------------

describe('ConsultationService.sendMessage — mode selection', () => {
  it('selects first mode with a fresh sessionId when no on-disk thread exists', async () => {
    const { service, invoker } = makeServiceWithDoubles();

    await service.sendMessage(PROJECT_ROOT, 'hi');
    const req = invoker.captured[0]!.req;
    expect(req.mode).toBe('first');
    expect(req.sessionId.length).toBeGreaterThan(0);
  });

  it('selects resume mode with the existing sessionId when thread has messages', async () => {
    const existing = makeFileWithThread({ sessionId: 'existing-session', messageCount: 4 });
    const { service, invoker } = makeServiceWithDoubles({ initial: existing });

    await service.sendMessage(PROJECT_ROOT, 'follow-up');
    const req = invoker.captured[0]!.req;
    expect(req.mode).toBe('resume');
    expect(req.sessionId).toBe('existing-session');
    expect(req.model).toBe('sonnet');
  });

  it('uses the pending session (from newSession) on first-message mode', async () => {
    const { service, invoker } = makeServiceWithDoubles();

    const ns = await service.newSession(PROJECT_ROOT, 'opus');
    expect(ns.ok).toBe(true);
    const pendingSid = ns.ok ? ns.data.sessionId : '';

    await service.sendMessage(PROJECT_ROOT, 'hi');
    const req = invoker.captured[0]!.req;
    expect(req.mode).toBe('first');
    expect(req.sessionId).toBe(pendingSid);
    expect(req.model).toBe('opus');
    expect(req.fallbackModel).toBe('sonnet');
  });
});

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('ConsultationService.cancel', () => {
  it('calls handle.cancel on matching messageId and does not send streamError itself', async () => {
    const { service, invoker, sends } = makeServiceWithDoubles();
    const send = await service.sendMessage(PROJECT_ROOT, 'hi');
    if (!send.ok) throw new Error('sendMessage failed');

    const cancelRes = await service.cancel(PROJECT_ROOT, send.data.messageId);
    expect(cancelRes.ok).toBe(true);
    expect(invoker.captured[0]!.cancelled).toBe(true);

    const errorBefore = sends.filter((s) => s.channel === IPC.consultation.streamError).length;
    expect(errorBefore).toBe(0);
  });

  it('fires streamError when the invoker subsequently emits CANCELLED; clears in-flight', async () => {
    const { service, invoker, sends } = makeServiceWithDoubles();
    const send = await service.sendMessage(PROJECT_ROOT, 'hi');
    if (!send.ok) throw new Error('sendMessage failed');

    await service.cancel(PROJECT_ROOT, send.data.messageId);
    invoker.captured[0]!.cb.onError(ConsultationErrorCode.CANCELLED);

    const errorSends = sends.filter((s) => s.channel === IPC.consultation.streamError);
    expect(errorSends).toHaveLength(1);
    expect((errorSends[0]!.payload as { code: string }).code).toBe(
      ConsultationErrorCode.CANCELLED,
    );

    const followUp = await service.sendMessage(PROJECT_ROOT, 'retry');
    expect(followUp.ok).toBe(true);
  });

  it('returns INTERNAL when cancel called with unknown messageId', async () => {
    const { service } = makeServiceWithDoubles();
    const res = await service.cancel(PROJECT_ROOT, 'no-such-id');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ConsultationErrorCode.INTERNAL);
  });
});

// ---------------------------------------------------------------------------
// cancelAllForProject
// ---------------------------------------------------------------------------

describe('ConsultationService.cancelAllForProject', () => {
  it('cancels only the target project stream, leaves unrelated projects untouched', async () => {
    const { service, invoker } = makeServiceWithDoubles();
    const other = '/home/user/other-project';

    await service.sendMessage(PROJECT_ROOT, 'p1');
    await service.sendMessage(other, 'p2');

    expect(invoker.captured).toHaveLength(2);

    service.cancelAllForProject(PROJECT_ROOT);
    expect(invoker.captured[0]!.cancelled).toBe(true);
    expect(invoker.captured[1]!.cancelled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// newSession
// ---------------------------------------------------------------------------

describe('ConsultationService.newSession', () => {
  it('rotates the on-disk thread when an active thread has messages', async () => {
    const existing = makeFileWithThread({ messageCount: 2 });
    const { service, storage } = makeServiceWithDoubles({ initial: existing });

    const res = await service.newSession(PROJECT_ROOT, 'opus');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.systemPromptVersion).toBe(1);
    expect(storage.rotateThread).toHaveBeenCalledOnce();
    const args = storage.rotateThread.mock.calls[0]![1] as {
      threadId: string;
      sessionId: string;
      model: string;
    };
    expect(args.model).toBe('opus');
    expect(args.sessionId.length).toBeGreaterThan(0);
  });

  it('returns the current CONSULTATION_SYSTEM_PROMPT_VERSION alongside sessionId', async () => {
    const { CONSULTATION_SYSTEM_PROMPT_VERSION } = await import('../systemPrompt.js');
    const { service } = makeServiceWithDoubles();

    const res = await service.newSession(PROJECT_ROOT, 'sonnet');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.systemPromptVersion).toBe(CONSULTATION_SYSTEM_PROMPT_VERSION);
      expect(res.data.sessionId.length).toBeGreaterThan(0);
    }
  });

  it('does not rotate on disk when no thread exists; sets pending state in-memory', async () => {
    const { service, storage, invoker } = makeServiceWithDoubles();

    const res = await service.newSession(PROJECT_ROOT, 'opus');
    expect(res.ok).toBe(true);
    expect(storage.rotateThread).not.toHaveBeenCalled();

    await service.sendMessage(PROJECT_ROOT, 'hi');
    const req = invoker.captured[0]!.req;
    expect(req.model).toBe('opus');
    expect(req.mode).toBe('first');
    expect(req.sessionId).toBe(res.ok ? res.data.sessionId : '');
  });

  it('cancels an in-flight stream before rotating', async () => {
    const existing = makeFileWithThread({ messageCount: 2 });
    const { service, invoker } = makeServiceWithDoubles({ initial: existing });

    await service.sendMessage(PROJECT_ROOT, 'hi');
    expect(invoker.captured).toHaveLength(1);

    await service.newSession(PROJECT_ROOT, 'sonnet');
    expect(invoker.captured[0]!.cancelled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setWindow
// ---------------------------------------------------------------------------

describe('ConsultationService.setWindow', () => {
  it('cancels all in-flight when window is set to null (window-closed path)', async () => {
    const { service, invoker } = makeServiceWithDoubles();
    await service.sendMessage(PROJECT_ROOT, 'hi');
    await service.sendMessage('/other-project', 'other');

    service.setWindow(null);
    expect(invoker.captured[0]!.cancelled).toBe(true);
    expect(invoker.captured[1]!.cancelled).toBe(true);
  });

  it('silently no-ops send-to-renderer when window is null', async () => {
    const { service, invoker, sends } = makeServiceWithDoubles();
    await service.sendMessage(PROJECT_ROOT, 'hi');
    service.setWindow(null);
    invoker.captured[0]!.cb.onChunk('partial');
    expect(sends.filter((s) => s.channel === IPC.consultation.streamChunk)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Storage error on complete
// ---------------------------------------------------------------------------

describe('ConsultationService — storage error after complete', () => {
  it('emits streamError when appendMessages fails instead of streamComplete', async () => {
    const storage = makeFakeStorage(null);
    storage.appendMessages.mockResolvedValueOnce(
      err(ConsultationErrorCode.IO_FAILED, 'disk full'),
    );
    const invoker = makeFakeInvoker();
    const service = new ConsultationService({
      invoke: invoker.invoke,
      storage,
      getClaudeBin: () => CLAUDE_BIN,
    });
    const wp = makeFakeWindow();
    service.setWindow(wp.window as never);

    await service.sendMessage(PROJECT_ROOT, 'hi');
    invoker.captured[0]!.cb.onComplete('assistant text');
    await Promise.resolve();
    await Promise.resolve();

    const completeSends = wp.sends.filter((s) => s.channel === IPC.consultation.streamComplete);
    const errorSends = wp.sends.filter((s) => s.channel === IPC.consultation.streamError);
    expect(completeSends).toHaveLength(0);
    expect(errorSends).toHaveLength(1);
    expect((errorSends[0]!.payload as { code: string }).code).toBe(
      ConsultationErrorCode.IO_FAILED,
    );
  });
});

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

describe('ConsultationService — push payload shape', () => {
  it('stream payloads include the projectHash derived via hashKeyOnly', async () => {
    const { service, invoker, sends } = makeServiceWithDoubles();
    await service.sendMessage(PROJECT_ROOT, 'hi');
    invoker.captured[0]!.cb.onChunk('x');

    const chunk = sends.find((s) => s.channel === IPC.consultation.streamChunk);
    expect(chunk).toBeDefined();
    const payload = chunk!.payload as { projectHash: string; messageId: string };
    expect(payload.projectHash).toBe(hashKeyOnly(PROJECT_ROOT));
    expect(payload.messageId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Ignore stale callbacks
// ---------------------------------------------------------------------------

describe('ConsultationService — stale callback tolerance', () => {
  beforeEach(() => {
    // ensure no shared state across tests
  });

  it('ignores chunk callbacks for a superseded messageId', async () => {
    const { service, invoker, sends } = makeServiceWithDoubles();
    const send = await service.sendMessage(PROJECT_ROOT, 'hi');
    if (!send.ok) throw new Error('unreachable');

    await service.cancel(PROJECT_ROOT, send.data.messageId);
    invoker.captured[0]!.cb.onError(ConsultationErrorCode.CANCELLED);

    // Late chunk arrives for the already-cleared stream → silently dropped
    const beforeLen = sends.length;
    invoker.captured[0]!.cb.onChunk('late');
    expect(sends.length).toBe(beforeLen);
  });
});
