import * as fs from 'node:fs';
import { atomicWriteJson, getConsultationPath, getProjectDir, hashKeyOnly } from '@main/storage';
import type {
  ConsultationFile,
  ConsultationMessage,
  ConsultationModel,
  ConsultationThread,
} from '@shared/consultation.js';
import { type Result, ok, err } from '@shared/result.js';
import { ConsultationErrorCode } from '@shared/errors.js';

const CURRENT_SCHEMA_VERSION = 1 as const;

/** ISO-8601 UTC timestamp with colons replaced by dashes (Windows-safe filename). */
function isoUtcNow(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

function isValidThread(v: unknown): v is ConsultationThread {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['sessionId'] === 'string' &&
    typeof obj['createdAt'] === 'number' &&
    typeof obj['lastActiveAt'] === 'number' &&
    typeof obj['model'] === 'string' &&
    typeof obj['systemPromptVersion'] === 'number' &&
    Array.isArray(obj['messages'])
  );
}

function isValidConsultation(v: unknown): v is ConsultationFile {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj['schemaVersion'] !== CURRENT_SCHEMA_VERSION) return false;
  if (typeof obj['activeThreadId'] !== 'string') return false;
  if (typeof obj['threads'] !== 'object' || obj['threads'] === null || Array.isArray(obj['threads'])) return false;
  for (const thread of Object.values(obj['threads'] as Record<string, unknown>)) {
    if (!isValidThread(thread)) return false;
  }
  if (!Array.isArray(obj['orphanedThreads'])) return false;
  return true;
}

async function quarantine(filePath: string): Promise<void> {
  const quarantinePath = `${filePath}.corrupt-${isoUtcNow()}`;
  try {
    await fs.promises.rename(filePath, quarantinePath);
  } catch {
    // best-effort
  }
}

export async function loadConsultation(
  projectRoot: string,
): Promise<Result<ConsultationFile | null, ConsultationErrorCode>> {
  const hash = hashKeyOnly(projectRoot);
  const filePath = getConsultationPath(hash);

  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') return ok(null);
    return err(ConsultationErrorCode.IO_FAILED, nodeErr.message);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    await quarantine(filePath);
    return err(ConsultationErrorCode.CORRUPT, `JSON parse error: ${(e as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    await quarantine(filePath);
    return err(ConsultationErrorCode.CORRUPT, 'Consultation file is not an object');
  }

  const obj = parsed as Record<string, unknown>;
  const version = obj['schemaVersion'];
  if (typeof version === 'number' && Number.isInteger(version) && version !== CURRENT_SCHEMA_VERSION) {
    return err(ConsultationErrorCode.SCHEMA_MISMATCH, `Expected schemaVersion ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  }

  if (!isValidConsultation(parsed)) {
    await quarantine(filePath);
    return err(ConsultationErrorCode.CORRUPT, 'Consultation file has invalid shape');
  }

  return ok(parsed);
}

export async function saveConsultation(
  projectRoot: string,
  data: ConsultationFile,
): Promise<Result<void, ConsultationErrorCode>> {
  try {
    const hash = hashKeyOnly(projectRoot);
    const projectDir = getProjectDir(hash);
    await fs.promises.mkdir(projectDir, { recursive: true });
    const filePath = getConsultationPath(hash);
    await atomicWriteJson(filePath, data);
    return ok(undefined);
  } catch (e) {
    return err(ConsultationErrorCode.IO_FAILED, (e as Error).message);
  }
}

/**
 * Atomically append a user message and its successful assistant response
 * to the active thread. Creates the file on first successful response.
 * Updates thread.lastActiveAt.
 */
export async function appendMessages(
  projectRoot: string,
  args: {
    threadId: string;
    sessionId: string;
    model: ConsultationModel;
    userMessage: ConsultationMessage;
    assistantMessage: ConsultationMessage;
  },
): Promise<Result<void, ConsultationErrorCode>> {
  const loadResult = await loadConsultation(projectRoot);
  if (!loadResult.ok) return loadResult;

  const now = Date.now();
  let data: ConsultationFile;

  if (loadResult.data === null) {
    data = {
      schemaVersion: 1,
      activeThreadId: args.threadId,
      threads: {
        [args.threadId]: {
          sessionId: args.sessionId,
          createdAt: now,
          lastActiveAt: now,
          model: args.model,
          systemPromptVersion: 1,
          messages: [args.userMessage, args.assistantMessage],
        },
      },
      orphanedThreads: [],
    };
  } else {
    data = loadResult.data;
    const existing = data.threads[args.threadId];
    if (existing !== undefined) {
      existing.messages.push(args.userMessage, args.assistantMessage);
      existing.lastActiveAt = now;
    } else {
      data.threads[args.threadId] = {
        sessionId: args.sessionId,
        createdAt: now,
        lastActiveAt: now,
        model: args.model,
        systemPromptVersion: 1,
        messages: [args.userMessage, args.assistantMessage],
      };
      data.activeThreadId = args.threadId;
    }
  }

  return saveConsultation(projectRoot, data);
}

/**
 * Rotate the active thread into orphanedThreads (stripping messages) and
 * create a fresh active thread with a new sessionId and selected model.
 */
export async function rotateThread(
  projectRoot: string,
  newThread: {
    threadId: string;
    sessionId: string;
    model: ConsultationModel;
  },
): Promise<Result<ConsultationFile, ConsultationErrorCode>> {
  const loadResult = await loadConsultation(projectRoot);
  if (!loadResult.ok) return loadResult;

  const now = Date.now();
  let data: ConsultationFile;

  if (loadResult.data === null) {
    data = {
      schemaVersion: 1,
      activeThreadId: newThread.threadId,
      threads: {
        [newThread.threadId]: {
          sessionId: newThread.sessionId,
          createdAt: now,
          lastActiveAt: now,
          model: newThread.model,
          systemPromptVersion: 1,
          messages: [],
        },
      },
      orphanedThreads: [],
    };
  } else {
    data = { ...loadResult.data, threads: { ...loadResult.data.threads }, orphanedThreads: [...loadResult.data.orphanedThreads] };

    const activeThread = data.threads[data.activeThreadId];
    if (activeThread !== undefined) {
      const { sessionId, createdAt, lastActiveAt, model, systemPromptVersion } = activeThread;
      data.orphanedThreads.push({ sessionId, createdAt, lastActiveAt, model, systemPromptVersion });
      delete data.threads[data.activeThreadId];
    }

    data.threads[newThread.threadId] = {
      sessionId: newThread.sessionId,
      createdAt: now,
      lastActiveAt: now,
      model: newThread.model,
      systemPromptVersion: 1,
      messages: [],
    };
    data.activeThreadId = newThread.threadId;
  }

  const saveResult = await saveConsultation(projectRoot, data);
  if (!saveResult.ok) return saveResult;
  return ok(data);
}
