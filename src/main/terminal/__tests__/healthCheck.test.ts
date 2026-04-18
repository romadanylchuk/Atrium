import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthErrorCode } from '@shared/errors.js';

// ---------------------------------------------------------------------------
// Fake IPty factory
// ---------------------------------------------------------------------------

type DataHandler = (data: string) => void;
type ExitHandler = (e: { exitCode: number | undefined }) => void;

interface FakeIPty {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  onData: (handler: DataHandler) => void;
  onExit: (handler: ExitHandler) => void;
  _fireData: (s: string) => void;
  _fireExit: (code: number) => void;
}

function makeFakePty(): FakeIPty {
  let dataHandler: DataHandler | null = null;
  let exitHandler: ExitHandler | null = null;
  return {
    pid: 99999,
    kill: vi.fn(),
    onData(handler: DataHandler) { dataHandler = handler; },
    onExit(handler: ExitHandler) { exitHandler = handler; },
    _fireData(s: string) { dataHandler?.(s); },
    _fireExit(code: number) { exitHandler?.({ exitCode: code }); },
  };
}

// Mock execFile that immediately invokes callback with a resolved path.
// Signature matches node:child_process execFile: (cmd, args, cb) where
// cb = (error: Error | null, stdout: string, stderr: string) => void
type ExecFileCb = (error: Error | null, stdout: string, stderr: string) => void;

function makeExecFileSuccess(path = '/usr/local/bin/claude') {
  return vi.fn((_cmd: string, _args: string[], cb: ExecFileCb) => {
    cb(null, `${path}\n`, '');
  });
}

function makeExecFileFailure() {
  return vi.fn((_cmd: string, _args: string[], cb: ExecFileCb) => {
    const e = Object.assign(new Error('not found'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    cb(e as unknown as Error, '', '');
  });
}

// ---------------------------------------------------------------------------
// Tests — all use vi.resetModules + vi.doMock for isolation
// ---------------------------------------------------------------------------

describe('checkClaude — happy path (trailing newline preserved)', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
    vi.doMock('node:child_process', () => ({ execFile: makeExecFileSuccess() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns ok with full version string including trailing newline', async () => {
    const { checkClaude } = await import('../healthCheck.js');
    const promise = checkClaude();
    // Yield so execFile callback and pty handlers are wired
    await Promise.resolve();
    await Promise.resolve();
    fakePty._fireData('1.4.0\n');
    fakePty._fireExit(0);
    const result = await promise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe('1.4.0\n');
    expect(result.data.claudePath).toMatch(/.+/);
  });
});

// ---------------------------------------------------------------------------

describe('checkClaude — pre-release tag preserved verbatim', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
    vi.doMock('node:child_process', () => ({ execFile: makeExecFileSuccess() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('preserves pre-release tag in version string', async () => {
    const { checkClaude } = await import('../healthCheck.js');
    const promise = checkClaude();
    await Promise.resolve();
    await Promise.resolve();
    fakePty._fireData('1.4.0-beta.3');
    fakePty._fireExit(0);
    const result = await promise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe('1.4.0-beta.3');
  });
});

// ---------------------------------------------------------------------------

describe('checkClaude — garbage output', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
    vi.doMock('node:child_process', () => ({ execFile: makeExecFileSuccess() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns VERSION_UNPARSEABLE when output has no semver', async () => {
    const { checkClaude } = await import('../healthCheck.js');
    const promise = checkClaude();
    await Promise.resolve();
    await Promise.resolve();
    fakePty._fireData('hello world');
    fakePty._fireExit(0);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(HealthErrorCode.VERSION_UNPARSEABLE);
    expect(result.error.message).toMatch(/claude path:/);
  });
});

// ---------------------------------------------------------------------------

describe('checkClaude — binary not found', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn() }));
    vi.doMock('node:child_process', () => ({ execFile: makeExecFileFailure() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns CLAUDE_NOT_FOUND when binary is missing', async () => {
    const { checkClaude } = await import('../healthCheck.js');
    const result = await checkClaude();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(HealthErrorCode.CLAUDE_NOT_FOUND);
    expect(result.error.message).toMatch(/not on PATH/);
  });
});

// ---------------------------------------------------------------------------

describe('checkClaude — timeout', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.useFakeTimers();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
    // execFile fires its callback synchronously so the which-timeout timer is not involved
    vi.doMock('node:child_process', () => ({ execFile: makeExecFileSuccess() }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns HEALTH_TIMEOUT and kills pty when onExit never fires', async () => {
    const { checkClaude, HEALTH_TIMEOUT_MS } = await import('../healthCheck.js');
    const promise = checkClaude();
    // Drain the microtask queue so the execFile callback runs and pty is spawned
    await Promise.resolve();
    await Promise.resolve();
    // Advance past the health timeout
    vi.advanceTimersByTime(HEALTH_TIMEOUT_MS + 100);
    await Promise.resolve();
    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(HealthErrorCode.HEALTH_TIMEOUT);
    expect(fakePty.kill).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Singleton-slot invariant — structural assertion
// The healthCheck.ts source must NOT import TerminalManager
// ---------------------------------------------------------------------------

describe('singleton-slot invariant', () => {
  it('healthCheck.ts does not import TerminalManager', async () => {
    const nodeFs = await import('node:fs');
    const nodePath = await import('node:path');
    const sourcePath = nodePath.default.join(import.meta.dirname, '..', 'healthCheck.ts');
    const source = nodeFs.default.readFileSync(sourcePath, 'utf8');
    // No line may start with 'import' and reference TerminalManager
    const importLines = source.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(line).not.toMatch(/TerminalManager/);
    }
  });
});
