/**
 * consultationService.ts — orchestration for the consultation chat feature.
 *
 * Holds per-project in-flight state, coordinates the invoker / storage /
 * error-mapper modules, and emits push events to the renderer via
 * webContents.send.
 *
 * Shape mirrors TerminalManager: setWindow wires the live BrowserWindow,
 * constructor accepts an optional deps bag for dependency injection in tests.
 */

import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import { ConsultationErrorCode } from '@shared/errors';
import { type Result, ok, err } from '@shared/result';
import type {
  ConsultationFile,
  ConsultationMessage,
  ConsultationModel,
} from '@shared/consultation';
import { hashKeyOnly } from '@main/storage';
import { getCachedClaudeBin } from '@main/terminal/resolveClaudeBin';
import {
  loadConsultation as defaultLoadConsultation,
  appendMessages as defaultAppendMessages,
  rotateThread as defaultRotateThread,
} from './consultationStorage.js';
import {
  invokeClaude as defaultInvokeClaude,
  type InvokeHandle,
  type InvokeCallbacks,
  type InvokeRequest,
} from './claudeInvoker.js';
import {
  CONSULTATION_SYSTEM_PROMPT,
  CONSULTATION_SYSTEM_PROMPT_VERSION,
} from './systemPrompt.js';

const DEFAULT_THREAD_ID = 'main';
const DEFAULT_BUDGET_USD = 1.0;
const DEFAULT_MODEL: ConsultationModel = 'sonnet';

type InvokeFn = (req: InvokeRequest, cb: InvokeCallbacks) => InvokeHandle;

export interface ConsultationStorageDeps {
  loadConsultation: typeof defaultLoadConsultation;
  appendMessages: typeof defaultAppendMessages;
  rotateThread: typeof defaultRotateThread;
}

export interface ConsultationServiceDeps {
  invoke?: InvokeFn;
  storage?: ConsultationStorageDeps;
  getClaudeBin?: () => string | null;
}

interface InFlight {
  messageId: string;
  handle: InvokeHandle;
  userMessage: ConsultationMessage;
  threadId: string;
  sessionId: string;
  model: ConsultationModel;
  errorEmitted: boolean;
}

type ConsultationPushChannel =
  | typeof IPC.consultation.streamChunk
  | typeof IPC.consultation.streamComplete
  | typeof IPC.consultation.streamError;

/** Pending session state held in-memory between `newSession` and the first
 *  successful response (at which point it is flushed to disk via appendMessages). */
interface PendingThread {
  sessionId: string;
  model: ConsultationModel;
}

export class ConsultationService {
  readonly #invoke: InvokeFn;
  readonly #storage: ConsultationStorageDeps;
  readonly #getClaudeBin: () => string | null;

  #window: BrowserWindow | null = null;
  readonly #inFlight = new Map<string, InFlight>();
  readonly #pending = new Map<string, PendingThread>();
  // Synchronous reservation set: held for the brief window between the
  // "already streaming" check and the final #inFlight.set. Prevents two
  // concurrent sendMessage calls from both passing the check while the first
  // is awaiting loadConsultation. Cleared in finally regardless of outcome.
  readonly #reserving = new Set<string>();

  constructor(deps: ConsultationServiceDeps = {}) {
    this.#invoke = deps.invoke ?? defaultInvokeClaude;
    this.#storage = deps.storage ?? {
      loadConsultation: defaultLoadConsultation,
      appendMessages: defaultAppendMessages,
      rotateThread: defaultRotateThread,
    };
    this.#getClaudeBin = deps.getClaudeBin ?? getCachedClaudeBin;
  }

  setWindow(win: BrowserWindow | null): void {
    this.#window = win;
    if (win === null) {
      for (const hash of Array.from(this.#inFlight.keys())) {
        const inflight = this.#inFlight.get(hash);
        if (inflight === undefined) continue;
        try {
          inflight.handle.cancel();
        } catch {
          // defensive — cancel must not throw across teardown
        }
        this.#inFlight.delete(hash);
      }
    }
  }

  loadThread(
    projectRoot: string,
  ): Promise<Result<ConsultationFile | null, ConsultationErrorCode>> {
    return this.#storage.loadConsultation(projectRoot);
  }

  async sendMessage(
    projectRoot: string,
    messageText: string,
  ): Promise<Result<{ messageId: string }, ConsultationErrorCode>> {
    const hash = hashKeyOnly(projectRoot);

    if (this.#inFlight.has(hash) || this.#reserving.has(hash)) {
      return err(ConsultationErrorCode.INTERNAL, 'already streaming');
    }
    this.#reserving.add(hash);

    try {
      const claudeBin = this.#getClaudeBin();
      if (claudeBin === null) {
        return err(ConsultationErrorCode.CLAUDE_NOT_FOUND, 'claude binary not resolved');
      }

      const loadResult = await this.#storage.loadConsultation(projectRoot);
      if (!loadResult.ok) return loadResult;

      const file = loadResult.data;
      const activeThread =
        file !== null ? file.threads[file.activeThreadId] : undefined;
      const pending = this.#pending.get(hash);

      let mode: 'first' | 'resume';
      let sessionId: string;
      let model: ConsultationModel;
      let threadId: string;

      if (activeThread !== undefined && activeThread.messages.length > 0) {
        mode = 'resume';
        sessionId = activeThread.sessionId;
        model = activeThread.model;
        threadId = file !== null ? file.activeThreadId : DEFAULT_THREAD_ID;
      } else if (pending !== undefined) {
        mode = 'first';
        sessionId = pending.sessionId;
        model = pending.model;
        threadId = DEFAULT_THREAD_ID;
      } else {
        mode = 'first';
        sessionId = randomUUID();
        model = DEFAULT_MODEL;
        threadId = DEFAULT_THREAD_ID;
        this.#pending.set(hash, { sessionId, model });
      }

      const messageId = randomUUID();
      const userMessage: ConsultationMessage = {
        id: messageId,
        role: 'user',
        content: messageText,
        ts: Date.now(),
      };

      const req: InvokeRequest = {
        claudeBin,
        projectRoot,
        sessionId,
        mode,
        model,
        userMessage: messageText,
        systemPrompt: CONSULTATION_SYSTEM_PROMPT,
        budgetUsd: DEFAULT_BUDGET_USD,
        ...(model === 'opus' ? { fallbackModel: 'sonnet' as const } : {}),
      };

      let handle: InvokeHandle;
      try {
        handle = this.#invoke(req, {
          onChunk: (fullText) => {
            const inflight = this.#inFlight.get(hash);
            if (inflight === undefined || inflight.messageId !== messageId) return;
            this.#sendToRenderer(IPC.consultation.streamChunk, {
              projectHash: hash,
              messageId,
              fullText,
            });
          },
          onComplete: (full) => {
            void this.#handleComplete(hash, projectRoot, messageId, full);
          },
          onError: (code, raw) => {
            this.#handleError(hash, messageId, code, raw);
          },
        });
      } catch (e) {
        this.#pending.delete(hash);
        return err(
          ConsultationErrorCode.INTERNAL,
          e instanceof Error ? e.message : String(e),
        );
      }

      this.#inFlight.set(hash, {
        messageId,
        handle,
        userMessage,
        threadId,
        sessionId,
        model,
        errorEmitted: false,
      });

      return ok({ messageId });
    } finally {
      this.#reserving.delete(hash);
    }
  }

  async newSession(
    projectRoot: string,
    model: ConsultationModel,
  ): Promise<
    Result<{ sessionId: string; systemPromptVersion: number }, ConsultationErrorCode>
  > {
    const hash = hashKeyOnly(projectRoot);

    const existing = this.#inFlight.get(hash);
    if (existing !== undefined) {
      try {
        existing.handle.cancel();
      } catch {
        // defensive — cancel must not throw
      }
      this.#inFlight.delete(hash);
    }

    const sessionId = randomUUID();

    const loadResult = await this.#storage.loadConsultation(projectRoot);
    if (!loadResult.ok) return loadResult;

    const file = loadResult.data;
    const hasMessages =
      file !== null &&
      (file.threads[file.activeThreadId]?.messages.length ?? 0) > 0;

    if (hasMessages) {
      const rotateResult = await this.#storage.rotateThread(projectRoot, {
        threadId: DEFAULT_THREAD_ID,
        sessionId,
        model,
      });
      if (!rotateResult.ok) return rotateResult;
      this.#pending.delete(hash);
    } else {
      this.#pending.set(hash, { sessionId, model });
    }

    return ok({ sessionId, systemPromptVersion: CONSULTATION_SYSTEM_PROMPT_VERSION });
  }

  async cancel(
    projectRoot: string,
    messageId: string,
  ): Promise<Result<void, ConsultationErrorCode>> {
    const hash = hashKeyOnly(projectRoot);
    const inflight = this.#inFlight.get(hash);
    if (inflight === undefined || inflight.messageId !== messageId) {
      return err(ConsultationErrorCode.INTERNAL, 'no active stream');
    }

    try {
      inflight.handle.cancel();
    } catch (e) {
      return err(
        ConsultationErrorCode.INTERNAL,
        e instanceof Error ? e.message : String(e),
      );
    }

    return Promise.resolve(ok(undefined));
  }

  /** Cancels any in-flight stream for the given project. Used on project switch. */
  cancelAllForProject(projectRoot: string): void {
    const hash = hashKeyOnly(projectRoot);
    const inflight = this.#inFlight.get(hash);
    if (inflight === undefined) return;
    try {
      inflight.handle.cancel();
    } catch {
      // defensive
    }
    // Match newSession / setWindow(null): delete synchronously so that a
    // sendMessage immediately after a project switch does not collide with
    // the still-pending CANCELLED onError (which can take seconds to arrive).
    // The late onError no-ops via the inflight === undefined guard in #handleError.
    this.#inFlight.delete(hash);
  }

  async #handleComplete(
    hash: string,
    projectRoot: string,
    messageId: string,
    full: string,
  ): Promise<void> {
    const inflight = this.#inFlight.get(hash);
    if (inflight === undefined || inflight.messageId !== messageId) return;

    const assistantMessage: ConsultationMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: full,
      ts: Date.now(),
    };

    const appendResult = await this.#storage.appendMessages(projectRoot, {
      threadId: inflight.threadId,
      sessionId: inflight.sessionId,
      model: inflight.model,
      userMessage: inflight.userMessage,
      assistantMessage,
    });

    this.#inFlight.delete(hash);

    if (!appendResult.ok) {
      // Leave #pending intact so the renderer's retry path resumes the same
      // sessionId — Claude's server has already associated it with the user
      // prompt + assistant response. Minting a new sessionId on retry would
      // double-bill or fragment the session.
      this.#sendToRenderer(IPC.consultation.streamError, {
        projectHash: hash,
        messageId,
        code: appendResult.error.code,
        raw: appendResult.error.message,
      });
      return;
    }

    this.#pending.delete(hash);
    this.#sendToRenderer(IPC.consultation.streamComplete, {
      projectHash: hash,
      messageId,
      fullContent: full,
    });
  }

  #handleError(
    hash: string,
    messageId: string,
    code: ConsultationErrorCode,
    raw: string | undefined,
  ): void {
    const inflight = this.#inFlight.get(hash);
    if (inflight === undefined || inflight.messageId !== messageId) return;
    if (inflight.errorEmitted) return;
    inflight.errorEmitted = true;

    this.#inFlight.delete(hash);

    this.#sendToRenderer(IPC.consultation.streamError, {
      projectHash: hash,
      messageId,
      code,
      ...(raw !== undefined ? { raw } : {}),
    });
  }

  #sendToRenderer(channel: ConsultationPushChannel, payload: unknown): void {
    if (this.#window === null || this.#window.isDestroyed()) return;
    this.#window.webContents.send(channel, payload);
  }
}
