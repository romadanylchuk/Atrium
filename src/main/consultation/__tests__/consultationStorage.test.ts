import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { __setUserDataDirForTests, getProjectsDir, getConsultationPath } from '../../storage/paths.js';
import { hashKeyOnly } from '../../storage/projectHash.js';
import {
  loadConsultation,
  saveConsultation,
  appendMessages,
  rotateThread,
} from '../consultationStorage.js';
import type { ConsultationFile, ConsultationMessage } from '@shared/consultation.js';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'atrium-consultation-test-'));
  __setUserDataDirForTests(tmpDir);
});

afterEach(() => {
  __setUserDataDirForTests(null);
  vi.restoreAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = '/home/user/test-project';

function makeMessage(overrides: Partial<ConsultationMessage> = {}): ConsultationMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    ts: 1000,
    ...overrides,
  };
}

function makeValidFile(): ConsultationFile {
  return {
    schemaVersion: 1,
    activeThreadId: 'thread-1',
    threads: {
      'thread-1': {
        sessionId: 'session-abc',
        createdAt: 1000,
        lastActiveAt: 2000,
        model: 'sonnet',
        systemPromptVersion: 1,
        messages: [],
      },
    },
    orphanedThreads: [],
  };
}

// ---------------------------------------------------------------------------
// loadConsultation — missing file
// ---------------------------------------------------------------------------

describe('loadConsultation — missing file', () => {
  it('returns ok(null) when no consultation file exists', async () => {
    const result = await loadConsultation(PROJECT_ROOT);
    expect(result).toEqual({ ok: true, data: null });
  });
});

// ---------------------------------------------------------------------------
// round-trip save/load
// ---------------------------------------------------------------------------

describe('round-trip save/load', () => {
  it('preserves all fields through save and reload', async () => {
    const data = makeValidFile();
    const saveResult = await saveConsultation(PROJECT_ROOT, data);
    expect(saveResult).toEqual({ ok: true, data: undefined });

    const loadResult = await loadConsultation(PROJECT_ROOT);
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.data).toEqual(data);
    }
  });

});

// ---------------------------------------------------------------------------
// loadConsultation — corrupt JSON
// ---------------------------------------------------------------------------

describe('loadConsultation — corrupt JSON', () => {
  it('quarantines the file and returns err(CORRUPT)', async () => {
    const hash = hashKeyOnly(PROJECT_ROOT);
    const projectDir = nodePath.join(getProjectsDir(), hash);
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = getConsultationPath(hash);
    fs.writeFileSync(filePath, '{ BROKEN JSON', 'utf8');

    const result = await loadConsultation(PROJECT_ROOT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CORRUPT');
    }
    // Original file should be quarantined (renamed away).
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadConsultation — schema mismatch
// ---------------------------------------------------------------------------

describe('loadConsultation — schema mismatch', () => {
  it('returns err(SCHEMA_MISMATCH) and leaves file untouched', async () => {
    const hash = hashKeyOnly(PROJECT_ROOT);
    const projectDir = nodePath.join(getProjectsDir(), hash);
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = getConsultationPath(hash);
    const futureFile = { schemaVersion: 2, activeThreadId: 'x', threads: {}, orphanedThreads: [] };
    fs.writeFileSync(filePath, JSON.stringify(futureFile), 'utf8');

    const result = await loadConsultation(PROJECT_ROOT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_MISMATCH');
    }
    // File must remain untouched — no quarantine.
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// appendMessages — creates file on fresh project
// ---------------------------------------------------------------------------

describe('appendMessages — fresh project', () => {
  it('creates consultation.json with expected shape on first successful response', async () => {
    const userMsg = makeMessage({ id: 'u1', role: 'user', content: 'hello', ts: 1000 });
    const assistantMsg = makeMessage({ id: 'a1', role: 'assistant', content: 'hi', ts: 2000 });

    const result = await appendMessages(PROJECT_ROOT, {
      threadId: 'thread-1',
      sessionId: 'session-abc',
      model: 'sonnet',
      userMessage: userMsg,
      assistantMessage: assistantMsg,
    });

    expect(result.ok).toBe(true);

    const loaded = await loadConsultation(PROJECT_ROOT);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || loaded.data === null) throw new Error('Expected file to exist');

    const file = loaded.data;
    expect(file.schemaVersion).toBe(1);
    expect(file.activeThreadId).toBe('thread-1');
    expect(file.orphanedThreads).toEqual([]);

    const thread = file.threads['thread-1'];
    expect(thread).toBeDefined();
    if (!thread) throw new Error('Thread not found');
    expect(thread.sessionId).toBe('session-abc');
    expect(thread.model).toBe('sonnet');
    expect(thread.systemPromptVersion).toBe(1);
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).toEqual(userMsg);
    expect(thread.messages[1]).toEqual(assistantMsg);
  });

  it('appends to existing thread on subsequent calls', async () => {
    const u1 = makeMessage({ id: 'u1', role: 'user', content: 'first', ts: 1000 });
    const a1 = makeMessage({ id: 'a1', role: 'assistant', content: 'reply1', ts: 2000 });
    await appendMessages(PROJECT_ROOT, {
      threadId: 'thread-1', sessionId: 'session-abc', model: 'sonnet',
      userMessage: u1, assistantMessage: a1,
    });

    const u2 = makeMessage({ id: 'u2', role: 'user', content: 'second', ts: 3000 });
    const a2 = makeMessage({ id: 'a2', role: 'assistant', content: 'reply2', ts: 4000 });
    await appendMessages(PROJECT_ROOT, {
      threadId: 'thread-1', sessionId: 'session-abc', model: 'sonnet',
      userMessage: u2, assistantMessage: a2,
    });

    const loaded = await loadConsultation(PROJECT_ROOT);
    if (!loaded.ok || !loaded.data) throw new Error('Expected file');
    const thread = loaded.data.threads['thread-1'];
    expect(thread?.messages).toHaveLength(4);
    expect(thread?.lastActiveAt).toBeGreaterThanOrEqual(3000);
  });
});

// ---------------------------------------------------------------------------
// rotateThread — strips messages and creates fresh active thread
// ---------------------------------------------------------------------------

describe('rotateThread', () => {
  it('strips messages from old thread and creates fresh active thread', async () => {
    // Seed an existing file with one thread that has messages.
    const u1 = makeMessage({ id: 'u1', role: 'user', content: 'q', ts: 1000 });
    const a1 = makeMessage({ id: 'a1', role: 'assistant', content: 'a', ts: 2000 });
    await appendMessages(PROJECT_ROOT, {
      threadId: 'thread-1', sessionId: 'sess-1', model: 'sonnet',
      userMessage: u1, assistantMessage: a1,
    });

    const rotateResult = await rotateThread(PROJECT_ROOT, {
      threadId: 'thread-2',
      sessionId: 'sess-2',
      model: 'opus',
    });

    expect(rotateResult.ok).toBe(true);
    if (!rotateResult.ok) throw new Error('rotate failed');

    const file = rotateResult.data;

    // New active thread is set.
    expect(file.activeThreadId).toBe('thread-2');
    const newThread = file.threads['thread-2'];
    expect(newThread).toBeDefined();
    expect(newThread?.sessionId).toBe('sess-2');
    expect(newThread?.model).toBe('opus');
    expect(newThread?.messages).toHaveLength(0);

    // Old thread is no longer in threads.
    expect(file.threads['thread-1']).toBeUndefined();

    // Old thread metadata is in orphanedThreads (without messages).
    expect(file.orphanedThreads).toHaveLength(1);
    const orphan = file.orphanedThreads[0];
    expect(orphan?.sessionId).toBe('sess-1');
    expect(orphan).not.toHaveProperty('messages');
  });

  it('creates a fresh file when no prior consultation exists', async () => {
    const result = await rotateThread(PROJECT_ROOT, {
      threadId: 'thread-new',
      sessionId: 'sess-new',
      model: 'sonnet',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('rotate failed');

    const file = result.data;
    expect(file.activeThreadId).toBe('thread-new');
    expect(file.orphanedThreads).toHaveLength(0);
    const thread = file.threads['thread-new'];
    expect(thread?.messages).toHaveLength(0);
    expect(thread?.model).toBe('sonnet');
  });

  it('persists rotated file to disk', async () => {
    const u1 = makeMessage({ id: 'u1', role: 'user', content: 'q', ts: 1000 });
    const a1 = makeMessage({ id: 'a1', role: 'assistant', content: 'a', ts: 2000 });
    await appendMessages(PROJECT_ROOT, {
      threadId: 'thread-1', sessionId: 'sess-1', model: 'sonnet',
      userMessage: u1, assistantMessage: a1,
    });

    await rotateThread(PROJECT_ROOT, { threadId: 'thread-2', sessionId: 'sess-2', model: 'opus' });

    const loaded = await loadConsultation(PROJECT_ROOT);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.data) throw new Error('Expected file');

    expect(loaded.data.activeThreadId).toBe('thread-2');
    expect(loaded.data.orphanedThreads).toHaveLength(1);
    expect(loaded.data.threads['thread-2']?.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// loadConsultation — IO_FAILED
// ---------------------------------------------------------------------------

describe('loadConsultation — IO_FAILED', () => {
  it('returns err(IO_FAILED) on a non-ENOENT read error', async () => {
    const hash = hashKeyOnly(PROJECT_ROOT);
    const projectDir = nodePath.join(getProjectsDir(), hash);
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = getConsultationPath(hash);
    fs.writeFileSync(filePath, '{}', 'utf8');

    const readFileSpy = vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );

    const result = await loadConsultation(PROJECT_ROOT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('IO_FAILED');
    }
    readFileSpy.mockRestore();
  });
});
