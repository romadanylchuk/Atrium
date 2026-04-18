import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalManager } from '../terminalManager';
import type { TerminalId } from '@shared/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// node-pty on Windows requires the full executable path; on Unix 'node' resolves via PATH.
const NODE = process.execPath;

function fakeWindow(destroyed = false) {
  const sends: Array<{ channel: string; args: unknown[] }> = [];
  return {
    sends,
    win: {
      isDestroyed: () => destroyed,
      webContents: {
        send: (channel: string, ...args: unknown[]) => {
          sends.push({ channel, args });
        },
      },
    } as unknown as Electron.BrowserWindow,
  };
}

function decodeArrayBuffer(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('utf8');
}

// ---------------------------------------------------------------------------
// Happy path — real node-pty spawn
// ---------------------------------------------------------------------------

describe('TerminalManager — happy path', () => {
  it('spawns node, receives onData with "hi", onExit code 0, ends exited', async () => {
    const mgr = new TerminalManager();
    const { win, sends } = fakeWindow();
    mgr.setWindow(win);

    const result = mgr.spawn([NODE, '-e', 'process.stdout.write("hi"); process.exit(0)'], process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const id = result.data;

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (mgr.getState() === 'exited') {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    const allData = sends
      .filter((s) => s.channel === 'terminal:onData')
      .map((s) => decodeArrayBuffer(s.args[1] as ArrayBuffer))
      .join('');
    expect(allData).toContain('hi');

    const exitSend = sends.find((s) => s.channel === 'terminal:onExit');
    expect(exitSend).toBeDefined();
    expect(exitSend!.args[0]).toBe(id);
    expect(exitSend!.args[1]).toBe(0);

    expect(mgr.getState()).toBe('exited');
  }, 8000);
});

// ---------------------------------------------------------------------------
// Kill path
// ---------------------------------------------------------------------------

describe('TerminalManager — kill path', () => {
  it('kills an active process; onExit fires and state is exited', async () => {
    const mgr = new TerminalManager();
    const { win, sends } = fakeWindow();
    mgr.setWindow(win);

    const result = mgr.spawn([NODE, '-e', 'setInterval(() => {}, 1000);'], process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const id = result.data;

    // wait briefly for process to settle
    await new Promise((r) => setTimeout(r, 100));

    const killResult = mgr.kill(id);
    expect(killResult.ok).toBe(true);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (mgr.getState() === 'exited') {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    const exitSend = sends.find((s) => s.channel === 'terminal:onExit');
    expect(exitSend).toBeDefined();
    expect(mgr.getState()).toBe('exited');
  }, 8000);
});

// ---------------------------------------------------------------------------
// SIGKILL fallback (skipped on Windows — PD-3)
// ---------------------------------------------------------------------------

describe('TerminalManager — SIGKILL fallback', () => {
  it.skipIf(process.platform === 'win32')(
    'fires SIGKILL after KILL_FALLBACK_MS when process ignores SIGTERM',
    async () => {
      const mgr = new TerminalManager();
      const { win } = fakeWindow();
      mgr.setWindow(win);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = mgr.spawn(
        ['node', '-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
        process.cwd(),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const id = result.data;

      await new Promise((r) => setTimeout(r, 100));

      const killResult = mgr.kill(id);
      expect(killResult.ok).toBe(true);

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (mgr.getState() === 'exited') {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/\[atrium:terminal\] SIGKILL fallback fired: pid=\d+ elapsedMs=\d+/));
      expect(mgr.getState()).toBe('exited');

      warnSpy.mockRestore();
    },
    10000,
  );
});

// ---------------------------------------------------------------------------
// Second-spawn rejection
// ---------------------------------------------------------------------------

describe('TerminalManager — second-spawn rejection', () => {
  it('rejects second spawn with SPAWN_FAILED while first is active', async () => {
    const mgr = new TerminalManager();
    const { win } = fakeWindow();
    mgr.setWindow(win);

    const first = mgr.spawn([NODE, '-e', 'setInterval(() => {}, 1000);'], process.cwd());
    expect(first.ok).toBe(true);

    const second = mgr.spawn([NODE, '-e', 'process.exit(0)'], process.cwd());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('SPAWN_FAILED');
    expect(second.error.message).toMatch(/not idle|already active/i);

    // first is still active
    expect(mgr.getState()).toBe('active');

    // cleanup
    if (first.ok) mgr.kill(first.data);
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (mgr.getState() === 'exited') { clearInterval(interval); resolve(); }
      }, 50);
    });
  }, 8000);
});

// ---------------------------------------------------------------------------
// State machine guards
// ---------------------------------------------------------------------------

describe('TerminalManager — state machine guards', () => {
  it('kill() in idle returns INVALID_HANDLE', () => {
    const mgr = new TerminalManager();
    const result = mgr.kill('t_fake' as TerminalId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_HANDLE');
  });

  it('write() in idle is a silent drop — no throw', () => {
    const mgr = new TerminalManager();
    expect(() => mgr.write('t_fake' as TerminalId, new ArrayBuffer(4))).not.toThrow();
  });

  it('closeAfterExit() in active returns KILL_FAILED with "not in exited"', async () => {
    const mgr = new TerminalManager();
    const { win } = fakeWindow();
    mgr.setWindow(win);

    const result = mgr.spawn([NODE, '-e', 'setInterval(() => {}, 1000);'], process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const closeResult = mgr.closeAfterExit(result.data);
    expect(closeResult.ok).toBe(false);
    if (closeResult.ok) return;
    expect(closeResult.error.code).toBe('KILL_FAILED');
    expect(closeResult.error.message).toMatch(/not in exited/i);

    // cleanup
    mgr.kill(result.data);
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (mgr.getState() === 'exited') { clearInterval(interval); resolve(); }
      }, 50);
    });
  }, 8000);
});

// ---------------------------------------------------------------------------
// WRITE_TOO_LARGE — uses vi.mock('node-pty') for a narrow unit test
// ---------------------------------------------------------------------------

describe('TerminalManager — WRITE_TOO_LARGE', () => {
  const mockWrite = vi.fn();

  beforeEach(() => {
    mockWrite.mockReset();
    vi.resetModules();
    vi.doMock('node-pty', () => ({
      spawn: vi.fn(() => ({
        pid: 12345,
        write: mockWrite,
        kill: vi.fn(),
        resize: vi.fn(),
        onData: vi.fn(() => ({ dispose: vi.fn() })),
        onExit: vi.fn(() => ({ dispose: vi.fn() })),
      })),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('drops oversized write and sends WRITE_TOO_LARGE via webContents', async () => {
    const { TerminalManager: TM } = await import('../terminalManager');

    const mgr = new TM();
    const { win, sends } = fakeWindow();
    mgr.setWindow(win);

    const result = mgr.spawn(['fake'], process.cwd());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const id = result.data;

    // 4 MB + 1 byte
    const oversized = new ArrayBuffer(4 * 1024 * 1024 + 1);
    mgr.write(id, oversized);

    expect(mockWrite).not.toHaveBeenCalled();

    const errSend = sends.find((s) => s.channel === 'terminal:onError');
    expect(errSend).toBeDefined();
    expect(errSend!.args[0]).toBe(id);
    expect((errSend!.args[1] as { code: string }).code).toBe('WRITE_TOO_LARGE');
  });
});
