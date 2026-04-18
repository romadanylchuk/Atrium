/**
 * wiredHandlers.test.ts — verifies that real IPC handlers delegate to the
 * injected managers, replacing the Stage-02 stubHandlers.test.ts.
 *
 * Uses makeFullFakeIpcMain for handler injection.
 * Uses vi.mock for health:checkClaude module isolation.
 */

import { describe, it, expect, vi } from 'vitest';
import { registerTerminalHandlers } from '../terminal';
import { registerFileSyncHandlers } from '../fileSync';
import { registerHealthHandlers } from '../health';
import { IPC } from '@shared/ipc';
import { ok, err } from '@shared/result';
import { makeFullFakeIpcMain } from './helpers/makeFakeIpcMain';
import type { TerminalId } from '@shared/domain';

// ---------------------------------------------------------------------------
// Mock health module so checkClaude is controllable
// ---------------------------------------------------------------------------

vi.mock('@main/terminal/healthCheck', () => ({
  checkClaude: vi.fn(),
}));

// ---------------------------------------------------------------------------
// terminal handlers
// ---------------------------------------------------------------------------

describe('terminal wired handlers', () => {
  it('terminal:spawn dispatches to manager.spawn and returns its result', async () => {
    const spawnResult = ok('t_abc' as TerminalId);
    const manager = {
      spawn: vi.fn().mockReturnValue(spawnResult),
      kill: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerTerminalHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.terminal.spawn, ['claude'], '/tmp/proj');
    expect(manager.spawn).toHaveBeenCalledOnce();
    expect(manager.spawn).toHaveBeenCalledWith(['claude'], '/tmp/proj');
    expect(result).toEqual(spawnResult);
  });

  it('terminal:kill dispatches to manager.kill and returns its result', async () => {
    const killResult = ok(undefined);
    const manager = {
      spawn: vi.fn(),
      kill: vi.fn().mockReturnValue(killResult),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerTerminalHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.terminal.kill, 't_abc' as TerminalId);
    expect(manager.kill).toHaveBeenCalledOnce();
    expect(manager.kill).toHaveBeenCalledWith('t_abc');
    expect(result).toEqual(killResult);
  });

  it('terminal:write on-dispatch calls manager.write exactly once (fire-and-forget)', () => {
    const manager = {
      spawn: vi.fn(),
      kill: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerTerminalHandlers(manager as never, fake);

    const data = new ArrayBuffer(4);
    const handler = fake.onHandlers.get(IPC.terminal.write)!;
    handler({} as never, 't_abc' as TerminalId, data);
    expect(manager.write).toHaveBeenCalledOnce();
    expect(manager.write).toHaveBeenCalledWith('t_abc', data);
  });

  it('terminal:resize on-dispatch calls manager.resize exactly once (fire-and-forget)', () => {
    const manager = {
      spawn: vi.fn(),
      kill: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerTerminalHandlers(manager as never, fake);

    const handler = fake.onHandlers.get(IPC.terminal.resize)!;
    handler({} as never, 't_abc' as TerminalId, 120, 30);
    expect(manager.resize).toHaveBeenCalledOnce();
    expect(manager.resize).toHaveBeenCalledWith('t_abc', 120, 30);
  });
});

// ---------------------------------------------------------------------------
// fileSync handlers
// ---------------------------------------------------------------------------

describe('fileSync wired handlers', () => {
  it('fileSync:startWatching dispatches to manager.start', async () => {
    const startResult = ok(undefined);
    const manager = {
      start: vi.fn().mockResolvedValue(startResult),
      stop: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerFileSyncHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.fileSync.startWatching, '/some/dir');
    expect(manager.start).toHaveBeenCalledOnce();
    expect(manager.start).toHaveBeenCalledWith('/some/dir');
    expect(result).toEqual(startResult);
  });

  it('fileSync:stopWatching dispatches to manager.stop', async () => {
    const stopResult = ok(undefined);
    const manager = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(stopResult),
    };
    const fake = makeFullFakeIpcMain();
    registerFileSyncHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.fileSync.stopWatching);
    expect(manager.stop).toHaveBeenCalledOnce();
    expect(result).toEqual(stopResult);
  });
});

// ---------------------------------------------------------------------------
// health handlers
// ---------------------------------------------------------------------------

describe('health wired handlers', () => {
  it('health:checkClaude delegates to checkClaude module function', async () => {
    const { checkClaude } = await import('@main/terminal/healthCheck');
    const mockCheckClaude = vi.mocked(checkClaude);
    const healthResult = err('CLAUDE_NOT_FOUND' as const, 'not found');
    mockCheckClaude.mockResolvedValue(healthResult as never);

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.checkClaude);
    expect(mockCheckClaude).toHaveBeenCalledOnce();
    expect(result).toEqual(healthResult);
  });
});
