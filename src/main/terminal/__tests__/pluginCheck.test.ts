import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthErrorCode } from '@shared/errors.js';

// ---------------------------------------------------------------------------
// Fake IPty factory — mirrors the pattern in healthCheck.test.ts
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

// Real JSON sample from `/deep-plan` Step 1
const HAPPY_PATH_JSON = JSON.stringify([
  { id: 'architector@getleverage', version: '1.1.0', enabled: true, scope: 'user' },
]);

// ---------------------------------------------------------------------------
// Probe outcomes — shared setup for all non-timeout cases
// ---------------------------------------------------------------------------

describe('checkArchitectorPlugin — probe outcomes', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('happy path', () => {
    it('returns ok with pluginId, version, and enabled:true', async () => {
      const { checkArchitectorPlugin } = await import('../pluginCheck.js');
      const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
      await Promise.resolve();
      fakePty._fireData(HAPPY_PATH_JSON);
      fakePty._fireExit(0);
      const result = await promise;
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.pluginId).toBe('architector@getleverage');
      expect(result.data.version).toBe('1.1.0');
      expect(result.data.enabled).toBe(true);
    });
  });

  describe('plugin missing', () => {
    it('returns PLUGIN_NOT_FOUND when other plugins exist but not architector', async () => {
      const { checkArchitectorPlugin } = await import('../pluginCheck.js');
      const otherPlugins = JSON.stringify([
        { id: 'some-other-plugin@vendor', version: '2.0.0', enabled: true, scope: 'user' },
      ]);
      const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
      await Promise.resolve();
      fakePty._fireData(otherPlugins);
      fakePty._fireExit(0);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(HealthErrorCode.PLUGIN_NOT_FOUND);
    });

    it('returns PLUGIN_NOT_FOUND when plugin list is empty', async () => {
      const { checkArchitectorPlugin } = await import('../pluginCheck.js');
      const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
      await Promise.resolve();
      fakePty._fireData('[]');
      fakePty._fireExit(0);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(HealthErrorCode.PLUGIN_NOT_FOUND);
    });
  });

  describe('plugin disabled', () => {
    it('returns PLUGIN_NOT_FOUND when entry exists but enabled:false', async () => {
      const { checkArchitectorPlugin } = await import('../pluginCheck.js');
      const disabledPlugin = JSON.stringify([
        { id: 'architector@getleverage', version: '1.1.0', enabled: false, scope: 'user' },
      ]);
      const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
      await Promise.resolve();
      fakePty._fireData(disabledPlugin);
      fakePty._fireExit(0);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(HealthErrorCode.PLUGIN_NOT_FOUND);
      expect(result.error.message).toMatch(/not enabled/);
    });
  });

  describe('garbage output', () => {
    it('returns PLUGIN_LIST_UNAVAILABLE when output is non-JSON on exit 0', async () => {
      const { checkArchitectorPlugin } = await import('../pluginCheck.js');
      const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
      await Promise.resolve();
      fakePty._fireData('Error: unknown command "plugin list"');
      fakePty._fireExit(0);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(HealthErrorCode.PLUGIN_LIST_UNAVAILABLE);
    });

    it('returns PLUGIN_LIST_UNAVAILABLE when output is a JSON object (not array) on exit 0', async () => {
      const { checkArchitectorPlugin } = await import('../pluginCheck.js');
      const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
      await Promise.resolve();
      fakePty._fireData('{"error":"unexpected"}');
      fakePty._fireExit(0);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(HealthErrorCode.PLUGIN_LIST_UNAVAILABLE);
    });
  });

  describe('non-zero exit', () => {
    it('returns PLUGIN_LIST_UNAVAILABLE on non-zero exit regardless of stdout', async () => {
      const { checkArchitectorPlugin } = await import('../pluginCheck.js');
      const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
      await Promise.resolve();
      fakePty._fireData(HAPPY_PATH_JSON); // even valid JSON is ignored on non-zero exit
      fakePty._fireExit(1);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(HealthErrorCode.PLUGIN_LIST_UNAVAILABLE);
    });
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('checkArchitectorPlugin — timeout', () => {
  let fakePty: FakeIPty;

  beforeEach(() => {
    fakePty = makeFakePty();
    vi.resetModules();
    vi.useFakeTimers();
    vi.doMock('node-pty', () => ({ spawn: vi.fn(() => fakePty) }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns PLUGIN_PROBE_TIMEOUT and kills pty when onExit never fires', async () => {
    const { checkArchitectorPlugin, PLUGIN_PROBE_TIMEOUT_MS } = await import('../pluginCheck.js');
    const promise = checkArchitectorPlugin(FAKE_CLAUDE_PATH);
    await Promise.resolve();
    vi.advanceTimersByTime(PLUGIN_PROBE_TIMEOUT_MS + 100);
    await Promise.resolve();
    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(HealthErrorCode.PLUGIN_PROBE_TIMEOUT);
    expect(fakePty.kill).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Singleton-slot invariant — structural assertion
// pluginCheck.ts must NOT import TerminalManager
// ---------------------------------------------------------------------------

describe('singleton-slot invariant', () => {
  it('pluginCheck.ts does not import TerminalManager', async () => {
    const nodeFs = await import('node:fs');
    const nodePath = await import('node:path');
    const sourcePath = nodePath.default.join(import.meta.dirname, '..', 'pluginCheck.ts');
    const source = nodeFs.default.readFileSync(sourcePath, 'utf8');
    const importLines = source.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(line).not.toMatch(/TerminalManager/);
    }
  });
});
