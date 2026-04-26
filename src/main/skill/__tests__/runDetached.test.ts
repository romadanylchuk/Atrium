import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillErrorCode } from '@shared/errors.js';

// ---------------------------------------------------------------------------
// Fake IPty factory — mirrors healthCheck.test.ts
// ---------------------------------------------------------------------------

type DataHandler = (data: string) => void;
type ExitHandler = (e: { exitCode: number | undefined }) => void;

interface FakeIPty {
  onData: (handler: DataHandler) => void;
  onExit: (handler: ExitHandler) => void;
  _fireData: (s: string) => void;
  _fireExit: (code: number) => void;
}

function makeFakePty(): FakeIPty {
  let dataHandler: DataHandler | null = null;
  let exitHandler: ExitHandler | null = null;
  return {
    onData(handler) { dataHandler = handler; },
    onExit(handler) { exitHandler = handler; },
    _fireData(s) { dataHandler?.(s); },
    _fireExit(code) { exitHandler?.({ exitCode: code }); },
  };
}

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('runDetached — success path', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
    vi.doMock('@main/terminal/resolveClaudeBin', () => ({
      resolveClaudeBin: vi.fn().mockResolvedValue('/usr/local/bin/claude'),
    }));
    vi.doMock('electron', () => ({ app: { isPackaged: false } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns ok({ exitCode: 0, stdout }) with ANSI stripped on exit code 0', async () => {
    const { runDetached } = await import('../runDetached.js');
    const promise = runDetached({ skill: 'audit', cwd: '/tmp/proj' });
    await Promise.resolve();
    await Promise.resolve();
    fakePty._fireData('Audit result\x1b[0m complete');
    fakePty._fireExit(0);
    const result = await promise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.exitCode).toBe(0);
    expect(result.data.stdout).toBe('Audit result complete');
  });

  it('returns ok with empty stdout when pty emits no data', async () => {
    const { runDetached } = await import('../runDetached.js');
    const promise = runDetached({ skill: 'status', cwd: '/tmp/proj' });
    await Promise.resolve();
    await Promise.resolve();
    fakePty._fireExit(0);
    const result = await promise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stdout).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Non-zero exit
// ---------------------------------------------------------------------------

describe('runDetached — non-zero exit', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
    vi.doMock('@main/terminal/resolveClaudeBin', () => ({
      resolveClaudeBin: vi.fn().mockResolvedValue('/usr/local/bin/claude'),
    }));
    vi.doMock('electron', () => ({ app: { isPackaged: false } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns err(RUN_FAILED) with last stdout line on non-zero exit', async () => {
    const { runDetached } = await import('../runDetached.js');
    const promise = runDetached({ skill: 'audit', cwd: '/tmp/proj' });
    await Promise.resolve();
    await Promise.resolve();
    fakePty._fireData('line one\nError: permission denied');
    fakePty._fireExit(1);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(SkillErrorCode.RUN_FAILED);
    expect(result.error.message).toBe('Error: permission denied');
  });

  it('returns err(RUN_FAILED) with fallback message when stdout is empty on non-zero exit', async () => {
    const { runDetached } = await import('../runDetached.js');
    const promise = runDetached({ skill: 'status', cwd: '/tmp/proj' });
    await Promise.resolve();
    await Promise.resolve();
    fakePty._fireExit(2);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(SkillErrorCode.RUN_FAILED);
    expect(result.error.message).toContain('exited with code 2');
  });
});

// ---------------------------------------------------------------------------
// Spawn failure
// ---------------------------------------------------------------------------

describe('runDetached — ptySpawn throws', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@main/terminal/resolveClaudeBin', () => ({
      resolveClaudeBin: vi.fn().mockResolvedValue('/usr/local/bin/claude'),
    }));
    vi.doMock('electron', () => ({ app: { isPackaged: false } }));
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => { throw new Error('spawn failed: binary not executable'); }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns err(RUN_FAILED) with the thrown message', async () => {
    const { runDetached } = await import('../runDetached.js');
    const result = await runDetached({ skill: 'audit', cwd: '/tmp/proj' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(SkillErrorCode.RUN_FAILED);
    expect(result.error.message).toBe('spawn failed: binary not executable');
  });
});

// ---------------------------------------------------------------------------
// Claude not on PATH
// ---------------------------------------------------------------------------

describe('runDetached — claude not on PATH', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn() }));
    vi.doMock('electron', () => ({ app: { isPackaged: false } }));
    vi.doMock('@main/terminal/resolveClaudeBin', () => ({
      resolveClaudeBin: vi.fn().mockRejectedValue(new Error("'claude' not on PATH")),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns err(RUN_FAILED) when resolveClaudeBin rejects', async () => {
    const { runDetached } = await import('../runDetached.js');
    const result = await runDetached({ skill: 'audit', cwd: '/tmp/proj' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(SkillErrorCode.RUN_FAILED);
    expect(result.error.message).toMatch(/not on PATH/);
  });
});

// ---------------------------------------------------------------------------
// Concurrent calls
// ---------------------------------------------------------------------------

describe('runDetached — concurrent calls do not interfere', () => {
  let pty1: FakeIPty;
  let pty2: FakeIPty;

  beforeEach(() => {
    pty1 = makeFakePty();
    pty2 = makeFakePty();
    vi.resetModules();
    let callCount = 0;
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? pty1 : pty2;
      }),
    }));
    vi.doMock('@main/terminal/resolveClaudeBin', () => ({
      resolveClaudeBin: vi.fn().mockResolvedValue('/usr/local/bin/claude'),
    }));
    vi.doMock('electron', () => ({ app: { isPackaged: false } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('two concurrent calls get independent ptys and independent results', async () => {
    const { runDetached } = await import('../runDetached.js');
    const p1 = runDetached({ skill: 'audit', cwd: '/tmp/proj1' });
    const p2 = runDetached({ skill: 'status', cwd: '/tmp/proj2' });
    await Promise.resolve();
    await Promise.resolve();
    pty1._fireData('audit output');
    pty1._fireExit(0);
    pty2._fireData('status output');
    pty2._fireExit(0);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.stdout).toBe('audit output');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.stdout).toBe('status output');
  });
});

// ---------------------------------------------------------------------------
// Singleton-slot invariant — structural assertion
// ---------------------------------------------------------------------------

describe('singleton-slot invariant', () => {
  it('runDetached.ts does not import TerminalManager', async () => {
    const nodeFs = await import('node:fs');
    const nodePath = await import('node:path');
    const sourcePath = nodePath.default.join(import.meta.dirname, '..', 'runDetached.ts');
    const source = nodeFs.default.readFileSync(sourcePath, 'utf8');
    const importLines = source.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(line).not.toMatch(/TerminalManager/);
    }
  });
});
