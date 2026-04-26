import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthErrorCode } from '@shared/errors.js';
import { ok, err } from '@shared/result.js';
import type { PluginInfo } from '@shared/domain.js';

// ---------------------------------------------------------------------------
// Fake IPty factory — mirrors the pattern in pluginCheck.test.ts
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

const FAKE_CLAUDE_PATH = '/usr/local/bin/claude';
const FAKE_CWD = '/tmp/atrium-userData';

const HAPPY_PLUGIN_INFO: PluginInfo = {
  pluginId: 'architector@getleverage',
  version: '1.1.0',
  enabled: true,
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — happy path', () => {
  let fakePtyA: FakeIPty;
  let fakePtyB: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    fakePtyB = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({
      spawn: vi.fn().mockReturnValueOnce(fakePtyA).mockReturnValueOnce(fakePtyB),
    }));
    vi.doMock('../pluginCheck.js', () => ({
      checkArchitectorPlugin: vi.fn().mockResolvedValue(ok(HAPPY_PLUGIN_INFO)),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('resolves with success when both steps exit 0 and post-probe ok', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve(); // let step A spawn
    fakePtyA._fireData('Added romadanylchuk/getleverage to marketplace\n');
    fakePtyA._fireExit(0);
    await Promise.resolve(); // let step B spawn
    fakePtyB._fireData('Installing architector@getleverage...\nDone.\n');
    fakePtyB._fireExit(0);
    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.pluginInfo).toEqual(HAPPY_PLUGIN_INFO);
  });

  it('relies on exit code only — idempotent re-add passes even with verbose step A stdout', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve();
    // Step A: "already on disk" message but exit 0 — must still proceed to step B.
    fakePtyA._fireData('Warning: romadanylchuk/getleverage is already on disk, skipping.\n');
    fakePtyA._fireExit(0);
    await Promise.resolve();
    fakePtyB._fireExit(0);
    const result = await promise;
    expect(result.kind).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// Step A failures
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — step A non-zero exit', () => {
  let fakePtyA: FakeIPty;
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    spawnMock = vi.fn().mockReturnValue(fakePtyA);
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: spawnMock }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns INSTALL_FAILED with captured stdout; step B is never spawned', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve();
    fakePtyA._fireData('error: marketplace add failed\n');
    fakePtyA._fireExit(1);
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('marketplace-add');
    expect(result.code).toBe(HealthErrorCode.INSTALL_FAILED);
    expect(result.stdout).toContain('marketplace add failed');
    expect(result.stderr).toBe('');
    // node-pty.spawn must have been called exactly once (step B never spawned).
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Step A timeout
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — step A timeout', () => {
  let fakePtyA: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    vi.resetModules();
    vi.useFakeTimers();
    vi.doMock('node-pty', () => ({ spawn: vi.fn().mockReturnValue(fakePtyA) }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns INSTALL_TIMEOUT and kills pty when step A never exits', async () => {
    const { installArchitectorPlugin, INSTALL_STEP_TIMEOUT_MS } =
      await import('../pluginInstall.js');
    const { promise } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve(); // let step A spawn
    vi.advanceTimersByTime(INSTALL_STEP_TIMEOUT_MS + 100);
    await Promise.resolve(); // let run() process the timeout result
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('marketplace-add');
    expect(result.code).toBe(HealthErrorCode.INSTALL_TIMEOUT);
    expect(fakePtyA.kill).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Step B failures
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — step B non-zero exit', () => {
  let fakePtyA: FakeIPty;
  let fakePtyB: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    fakePtyB = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({
      spawn: vi.fn().mockReturnValueOnce(fakePtyA).mockReturnValueOnce(fakePtyB),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns INSTALL_FAILED with step B stdout when step B exits non-zero', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve();
    fakePtyA._fireExit(0);
    await Promise.resolve();
    fakePtyB._fireData('error: plugin install failed\n');
    fakePtyB._fireExit(2);
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('install');
    expect(result.code).toBe(HealthErrorCode.INSTALL_FAILED);
    expect(result.stdout).toContain('plugin install failed');
  });
});

// ---------------------------------------------------------------------------
// Step B timeout
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — step B timeout', () => {
  let fakePtyA: FakeIPty;
  let fakePtyB: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    fakePtyB = makeFakePty();
    vi.resetModules();
    vi.useFakeTimers();
    vi.doMock('node-pty', () => ({
      spawn: vi.fn().mockReturnValueOnce(fakePtyA).mockReturnValueOnce(fakePtyB),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns INSTALL_TIMEOUT and kills step B pty when step B never exits', async () => {
    const { installArchitectorPlugin, INSTALL_STEP_TIMEOUT_MS } =
      await import('../pluginInstall.js');
    const { promise } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve(); // let step A spawn
    fakePtyA._fireExit(0);  // step A succeeds (clears its timer)
    await Promise.resolve(); // let step B spawn
    vi.advanceTimersByTime(INSTALL_STEP_TIMEOUT_MS + 100);
    await Promise.resolve(); // let run() process the timeout result
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('install');
    expect(result.code).toBe(HealthErrorCode.INSTALL_TIMEOUT);
    expect(fakePtyA.kill).not.toHaveBeenCalled();
    expect(fakePtyB.kill).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Post-probe failure
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — post-probe failure', () => {
  let fakePtyA: FakeIPty;
  let fakePtyB: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    fakePtyB = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({
      spawn: vi.fn().mockReturnValueOnce(fakePtyA).mockReturnValueOnce(fakePtyB),
    }));
    vi.doMock('../pluginCheck.js', () => ({
      checkArchitectorPlugin: vi.fn().mockResolvedValue(
        err(HealthErrorCode.PLUGIN_NOT_FOUND, 'plugin not found after install'),
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns PLUGIN_NOT_FOUND with combined stdout when post-probe fails', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve();
    fakePtyA._fireData('step-A-output\n');
    fakePtyA._fireExit(0);
    await Promise.resolve();
    fakePtyB._fireData('step-B-output\n');
    fakePtyB._fireExit(0);
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('post-probe');
    expect(result.code).toBe(HealthErrorCode.PLUGIN_NOT_FOUND);
    // Combined A+B stdout surfaced so the user can see what the install printed.
    expect(result.stdout).toContain('step-A-output');
    expect(result.stdout).toContain('step-B-output');
  });
});

// ---------------------------------------------------------------------------
// Cancel during step A
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — cancel during step A', () => {
  let fakePtyA: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn().mockReturnValue(fakePtyA) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('resolves with INSTALL_CANCELLED and kills step A pty', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise, cancel } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve(); // let step A spawn
    cancel();
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('marketplace-add');
    expect(result.code).toBe(HealthErrorCode.INSTALL_CANCELLED);
    expect(result.message).toMatch(/cancelled/i);
    expect(fakePtyA.kill).toHaveBeenCalledOnce();
    // Fire exit to clean up the hanging spawnStep promise.
    fakePtyA._fireExit(1);
  });

  it('is idempotent — calling cancel twice does not throw or double-resolve', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise, cancel } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve();
    cancel();
    cancel(); // second call must be a no-op
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.code).toBe(HealthErrorCode.INSTALL_CANCELLED);
    fakePtyA._fireExit(1);
  });
});

// ---------------------------------------------------------------------------
// Cancel during step B
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — cancel during step B', () => {
  let fakePtyA: FakeIPty;
  let fakePtyB: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    fakePtyB = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({
      spawn: vi.fn().mockReturnValueOnce(fakePtyA).mockReturnValueOnce(fakePtyB),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('resolves with INSTALL_CANCELLED at step install and kills step B pty', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    const { promise, cancel } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve(); // let step A spawn
    fakePtyA._fireExit(0);  // step A succeeds
    await Promise.resolve(); // let step B spawn (currentPty = fakePtyB)
    cancel();
    const result = await promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('install');
    expect(result.code).toBe(HealthErrorCode.INSTALL_CANCELLED);
    expect(fakePtyA.kill).not.toHaveBeenCalled();
    expect(fakePtyB.kill).toHaveBeenCalledOnce();
    fakePtyB._fireExit(1); // cleanup
  });
});

// ---------------------------------------------------------------------------
// Concurrent install guard
// ---------------------------------------------------------------------------

describe('installArchitectorPlugin — concurrent install guard', () => {
  let fakePtyA: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn().mockReturnValue(fakePtyA) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns INSTALL_FAILED immediately when another install is already in flight', async () => {
    const { installArchitectorPlugin } = await import('../pluginInstall.js');
    // First install — left in flight.
    const first = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve();
    // Second install — should be rejected immediately without spawning.
    const second = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    const result = await second.promise;
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.step).toBe('marketplace-add');
    expect(result.code).toBe(HealthErrorCode.INSTALL_FAILED);
    expect(result.message).toMatch(/in flight/);
    // Cleanup: resolve the first install.
    first.cancel();
    fakePtyA._fireExit(1);
  });
});

// ---------------------------------------------------------------------------
// getActiveInstallHandle
// ---------------------------------------------------------------------------

describe('getActiveInstallHandle', () => {
  let fakePtyA: FakeIPty;

  beforeEach(() => {
    fakePtyA = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn().mockReturnValue(fakePtyA) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns null before any install starts', async () => {
    const { getActiveInstallHandle } = await import('../pluginInstall.js');
    expect(getActiveInstallHandle()).toBeNull();
  });

  it('returns the active handle while install is in flight and null after it resolves', async () => {
    const { installArchitectorPlugin, getActiveInstallHandle } =
      await import('../pluginInstall.js');
    const { promise, cancel } = installArchitectorPlugin(FAKE_CLAUDE_PATH, FAKE_CWD);
    await Promise.resolve();
    expect(getActiveInstallHandle()).not.toBeNull();
    cancel();
    await promise;
    expect(getActiveInstallHandle()).toBeNull();
    fakePtyA._fireExit(1);
  });
});

// ---------------------------------------------------------------------------
// Singleton-slot invariant — structural assertion
// pluginInstall.ts must NOT import TerminalManager
// ---------------------------------------------------------------------------

describe('singleton-slot invariant', () => {
  it('pluginInstall.ts does not import TerminalManager', async () => {
    const nodeFs = await import('node:fs');
    const nodePath = await import('node:path');
    const sourcePath = nodePath.default.join(import.meta.dirname, '..', 'pluginInstall.ts');
    const source = nodeFs.default.readFileSync(sourcePath, 'utf8');
    const importLines = source.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(line).not.toMatch(/TerminalManager/);
    }
  });
});
