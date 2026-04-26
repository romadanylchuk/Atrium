import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { ConsultationErrorCode } from '@shared/errors.js';

vi.mock('node:child_process');

// Import AFTER vi.mock so the module gets the mocked version
import { spawn } from 'node:child_process';
import { buildArgv, invokeClaude, type InvokeRequest } from '../claudeInvoker.js';

const mockSpawn = vi.mocked(spawn);

const FIXTURE_DIR = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../.ai-work/phase0',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeChild() {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  child.kill = vi.fn();
  return child;
}

function baseReq(overrides: Partial<InvokeRequest> = {}): InvokeRequest {
  return {
    claudeBin: '/usr/local/bin/claude',
    projectRoot: '/some/project',
    sessionId: 'test-session-id-abc',
    mode: 'first',
    model: 'sonnet',
    userMessage: 'Hello from test',
    systemPrompt: 'You are a test co-architect.',
    budgetUsd: 1.0,
    ...overrides,
  };
}

async function replayFixtureLines(child: ReturnType<typeof makeFakeChild>, lines: string[]) {
  // stream.resume() is scheduled via process.nextTick when a 'data' listener is added;
  // wait one tick so the stream enters flowing mode before we push data.
  await new Promise<void>((r) => process.nextTick(r));
  for (const line of lines) {
    child.stdout.push(Buffer.from(line + '\n'));
  }
  child.stdout.push(null);
  child.emit('exit', 0, null);
  child.emit('close');
}

// ---------------------------------------------------------------------------
// buildArgv — flag ordering and correctness
// ---------------------------------------------------------------------------

describe('buildArgv', () => {
  it('starts with -p', () => {
    expect(buildArgv(baseReq())[0]).toBe('-p');
  });

  it('first mode: uses --session-id, no --resume', () => {
    const argv = buildArgv(baseReq({ mode: 'first', sessionId: 'sid-first' }));
    expect(argv).toContain('--session-id');
    expect(argv).toContain('sid-first');
    expect(argv).not.toContain('--resume');
  });

  it('resume mode: uses --resume, no --session-id', () => {
    const argv = buildArgv(baseReq({ mode: 'resume', sessionId: 'sid-resume' }));
    expect(argv).toContain('--resume');
    expect(argv).toContain('sid-resume');
    expect(argv).not.toContain('--session-id');
  });

  it('no --bare in argv', () => {
    expect(buildArgv(baseReq())).not.toContain('--bare');
  });

  it('--allowedTools followed immediately by Read, Grep, Glob', () => {
    const argv = buildArgv(baseReq({ userMessage: 'What is the arch?' }));
    const toolsIdx = argv.indexOf('--allowedTools');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(argv[toolsIdx + 1]).toBe('Read');
    expect(argv[toolsIdx + 2]).toBe('Grep');
    expect(argv[toolsIdx + 3]).toBe('Glob');
  });

  it('positional userMessage is last, preceded by `--` terminator', () => {
    const req = baseReq({ userMessage: 'unique-prompt-value' });
    const argv = buildArgv(req);
    expect(argv[argv.length - 1]).toBe('unique-prompt-value');
    expect(argv[argv.length - 2]).toBe('--');
  });

  it('--allowedTools block appears before the `--` terminator and the positional prompt', () => {
    const argv = buildArgv(baseReq({ userMessage: 'test-prompt' }));
    const toolsIdx = argv.indexOf('--allowedTools');
    const dashIdx = argv.lastIndexOf('--');
    const promptIdx = argv.lastIndexOf('test-prompt');
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(dashIdx).toBeGreaterThan(toolsIdx + 3); // tools block has 3 tool names after it
    expect(promptIdx).toBe(dashIdx + 1);
  });

  it('omits --fallback-model when not specified', () => {
    const argv = buildArgv(baseReq());
    expect(argv).not.toContain('--fallback-model');
  });

  it('includes --fallback-model when specified', () => {
    const argv = buildArgv(baseReq({ fallbackModel: 'sonnet' }));
    const idx = argv.indexOf('--fallback-model');
    expect(idx).toBeGreaterThan(-1);
    expect(argv[idx + 1]).toBe('sonnet');
  });

  it('includes --verbose', () => {
    expect(buildArgv(baseReq())).toContain('--verbose');
  });

  it('includes --output-format stream-json', () => {
    const argv = buildArgv(baseReq());
    const idx = argv.indexOf('--output-format');
    expect(idx).toBeGreaterThan(-1);
    expect(argv[idx + 1]).toBe('stream-json');
  });

  it('budget is stringified', () => {
    const argv = buildArgv(baseReq({ budgetUsd: 2.5 }));
    const idx = argv.indexOf('--max-budget-usd');
    expect(idx).toBeGreaterThan(-1);
    expect(argv[idx + 1]).toBe('2.5');
  });
});

// ---------------------------------------------------------------------------
// invokeClaude — fixture: r1-happy-sys.jsonl (happy path)
// ---------------------------------------------------------------------------

describe('invokeClaude — fixture: r1-happy-sys.jsonl (happy path)', () => {
  it('fires onChunk with assistant text and onComplete with result.result', async () => {
    const content = fs.readFileSync(path.join(FIXTURE_DIR, 'r1-happy-sys.jsonl'), 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    const chunks: string[] = [];
    let completePayload: string | undefined;
    let errorPayload: { code: ConsultationErrorCode; raw?: string } | undefined;

    const handle = invokeClaude(baseReq(), {
      onChunk(fullText) { chunks.push(fullText); },
      onComplete(full) { completePayload = full; },
      onError(code, raw) { errorPayload = { code, raw }; },
    });

    await replayFixtureLines(child, lines);
    await handle.done;

    expect(chunks.length).toBeGreaterThan(0);
    // Each chunk is the full accumulated text (replace semantics)
    expect(chunks[chunks.length - 1]).toBe('Hi!');
    expect(completePayload).toBe('Hi!');
    expect(errorPayload).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// invokeClaude — fixture: r1-happy.jsonl (auth failure)
// ---------------------------------------------------------------------------

describe('invokeClaude — fixture: r1-happy.jsonl (auth failure)', () => {
  it('fires onError(NOT_AUTHENTICATED) and does not fire onComplete', async () => {
    const content = fs.readFileSync(path.join(FIXTURE_DIR, 'r1-happy.jsonl'), 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    let completeCalled = false;
    let errorPayload: { code: ConsultationErrorCode; raw?: string } | undefined;

    const handle = invokeClaude(baseReq(), {
      onChunk() {},
      onComplete() { completeCalled = true; },
      onError(code, raw) { errorPayload = { code, raw }; },
    });

    await replayFixtureLines(child, lines);
    await handle.done;

    expect(errorPayload?.code).toBe(ConsultationErrorCode.NOT_AUTHENTICATED);
    expect(completeCalled).toBe(false);
  });

  it('onError is called exactly once even when both assistant and result events map to the same code', async () => {
    const content = fs.readFileSync(path.join(FIXTURE_DIR, 'r1-happy.jsonl'), 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    let errorCount = 0;
    const handle = invokeClaude(baseReq(), {
      onChunk() {},
      onComplete() {},
      onError() { errorCount++; },
    });

    await replayFixtureLines(child, lines);
    await handle.done;

    expect(errorCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// invokeClaude — cancel path
// ---------------------------------------------------------------------------

describe('invokeClaude — cancel: Windows', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('calls child.kill() with no signal argument', () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    const handle = invokeClaude(baseReq(), {
      onChunk() {},
      onComplete() {},
      onError() {},
    });

    handle.cancel();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith();
  });
});

describe('invokeClaude — cancel: POSIX', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('sends SIGTERM then SIGKILL after 2s', () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    const handle = invokeClaude(baseReq(), {
      onChunk() {},
      onComplete() {},
      onError() {},
    });

    handle.cancel();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    vi.advanceTimersByTime(1999);
    expect(child.kill).toHaveBeenCalledTimes(1); // SIGKILL not yet

    vi.advanceTimersByTime(1);
    expect(child.kill).toHaveBeenCalledTimes(2);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('SIGKILL fallback timer is cleared when process exits before 2s', () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    invokeClaude(baseReq(), {
      onChunk() {},
      onComplete() {},
      onError() {},
    }).cancel();

    // Simulate process exiting at 500ms (before the 2s SIGKILL)
    vi.advanceTimersByTime(500);
    child.emit('exit', null, 'SIGTERM');
    child.emit('close');

    // Advance past the 2s mark — SIGKILL must NOT fire
    vi.advanceTimersByTime(2000);
    expect(child.kill).toHaveBeenCalledTimes(1); // only SIGTERM
  });
});

// ---------------------------------------------------------------------------
// invokeClaude — spawn error (ENOENT)
// ---------------------------------------------------------------------------

describe('invokeClaude — spawn error', () => {
  it('maps ENOENT spawn error to CLAUDE_NOT_FOUND', async () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    let errorCode: ConsultationErrorCode | undefined;

    const handle = invokeClaude(baseReq(), {
      onChunk() {},
      onComplete() {},
      onError(code) { errorCode = code; },
    });

    const err: NodeJS.ErrnoException = new Error('spawn claude ENOENT');
    err.code = 'ENOENT';
    child.emit('error', err);
    child.emit('exit', null, null);
    child.emit('close');

    await handle.done;

    expect(errorCode).toBe(ConsultationErrorCode.CLAUDE_NOT_FOUND);
  });
});
