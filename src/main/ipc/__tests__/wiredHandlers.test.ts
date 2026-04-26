/**
 * wiredHandlers.test.ts — verifies that real IPC handlers delegate to the
 * injected managers, replacing the Stage-02 stubHandlers.test.ts.
 *
 * Uses makeFullFakeIpcMain for handler injection.
 * Uses vi.mock for health:checkClaude module isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerTerminalHandlers } from '../terminal';
import { registerFileSyncHandlers } from '../fileSync';
import { registerHealthHandlers } from '../health';
import { registerConsultationHandlers } from '../consultation';
import { registerSkillHandlers } from '../skill';
import { IPC } from '@shared/ipc';
import { ok, err } from '@shared/result';
import { makeFullFakeIpcMain } from './helpers/makeFakeIpcMain';
import type { TerminalId } from '@shared/domain';

// ---------------------------------------------------------------------------
// Mock electron so app.isPackaged and app.getPath are controllable in tests
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
}));

// ---------------------------------------------------------------------------
// Mock health-related terminal modules so they are controllable
// ---------------------------------------------------------------------------

vi.mock('@main/terminal/healthCheck', () => ({
  checkClaude: vi.fn(),
}));

vi.mock('@main/terminal/resolveClaudeBin', () => ({
  resolveClaudeBin: vi.fn().mockResolvedValue('/usr/local/bin/claude'),
  getCachedClaudeBin: vi.fn().mockReturnValue(null),
}));

vi.mock('@main/terminal/pluginCheck', () => ({
  checkArchitectorPlugin: vi.fn(),
}));

vi.mock('@main/terminal/pluginInstall', () => ({
  installArchitectorPlugin: vi.fn(),
  getActiveInstallHandle: vi.fn(),
}));

vi.mock('@main/skill/runDetached', () => ({
  runDetached: vi.fn(),
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
      closeAfterExit: vi.fn(),
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
      closeAfterExit: vi.fn(),
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

  it('terminal:close dispatches to manager.closeAfterExit and returns its ok result', async () => {
    const closeResult = ok(undefined);
    const manager = {
      spawn: vi.fn(),
      kill: vi.fn(),
      closeAfterExit: vi.fn().mockReturnValue(closeResult),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerTerminalHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.terminal.close, 't_abc' as TerminalId);
    expect(manager.closeAfterExit).toHaveBeenCalledOnce();
    expect(manager.closeAfterExit).toHaveBeenCalledWith('t_abc');
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('terminal:close swallows KILL_FAILED from closeAfterExit and returns ok', async () => {
    const manager = {
      spawn: vi.fn(),
      kill: vi.fn(),
      closeAfterExit: vi.fn().mockReturnValue(err('KILL_FAILED', 'terminal not in exited state')),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerTerminalHandlers(manager as never, fake);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await fake.invokeChannel(IPC.terminal.close, 't_abc' as TerminalId);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain('KILL_FAILED');
    warnSpy.mockRestore();
  });

  it('terminal:close swallows INVALID_HANDLE from closeAfterExit and returns ok', async () => {
    const manager = {
      spawn: vi.fn(),
      kill: vi.fn(),
      closeAfterExit: vi.fn().mockReturnValue(err('INVALID_HANDLE', 'unknown terminal id')),
      write: vi.fn(),
      resize: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerTerminalHandlers(manager as never, fake);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await fake.invokeChannel(IPC.terminal.close, 't_abc' as TerminalId);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain('INVALID_HANDLE');
    warnSpy.mockRestore();
  });

  it('terminal:write on-dispatch calls manager.write exactly once (fire-and-forget)', () => {
    const manager = {
      spawn: vi.fn(),
      kill: vi.fn(),
      closeAfterExit: vi.fn(),
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
      closeAfterExit: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('health:checkPlugin delegates to checkArchitectorPlugin and returns its result', async () => {
    const { checkArchitectorPlugin } = await import('@main/terminal/pluginCheck');
    const mockFn = vi.mocked(checkArchitectorPlugin);
    const pluginResult = ok({
      pluginId: 'architector@getleverage' as const,
      version: '1.1.0',
      enabled: true,
    });
    mockFn.mockResolvedValue(pluginResult as never);

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.checkPlugin);
    expect(mockFn).toHaveBeenCalledOnce();
    expect(mockFn).toHaveBeenCalledWith('/usr/local/bin/claude');
    expect(result).toEqual(pluginResult);
  });

  it('health:installPlugin delegates to installArchitectorPlugin and returns ok(outcome)', async () => {
    const { installArchitectorPlugin, getActiveInstallHandle } = await import('@main/terminal/pluginInstall');
    const mockInstall = vi.mocked(installArchitectorPlugin);
    const mockGetHandle = vi.mocked(getActiveInstallHandle);

    const outcome = {
      kind: 'success' as const,
      pluginInfo: { pluginId: 'architector@getleverage' as const, version: '1.1.0', enabled: true },
    };
    mockGetHandle.mockReturnValue(null);
    mockInstall.mockReturnValue({ promise: Promise.resolve(outcome), cancel: vi.fn() });

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.installPlugin);
    expect(mockInstall).toHaveBeenCalledOnce();
    expect(mockInstall).toHaveBeenCalledWith('/usr/local/bin/claude', '/mock/userData');
    expect(result).toEqual(ok(outcome));
  });

  it('health:cancelInstall calls cancel on the active handle and returns ok(undefined)', async () => {
    const { getActiveInstallHandle } = await import('@main/terminal/pluginInstall');
    const mockGetHandle = vi.mocked(getActiveInstallHandle);
    const mockCancel = vi.fn();
    mockGetHandle.mockReturnValue({ cancel: mockCancel });

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.cancelInstall);
    expect(mockCancel).toHaveBeenCalledOnce();
    expect(result).toEqual(ok(undefined));
  });

  it('health:cancelInstall returns ok(undefined) when no active handle exists', async () => {
    const { getActiveInstallHandle } = await import('@main/terminal/pluginInstall');
    vi.mocked(getActiveInstallHandle).mockReturnValue(null);

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.cancelInstall);
    expect(result).toEqual(ok(undefined));
  });

  it('health:checkPlugin returns CLAUDE_NOT_FOUND when resolveClaudeBin rejects', async () => {
    const { resolveClaudeBin } = await import('@main/terminal/resolveClaudeBin');
    vi.mocked(resolveClaudeBin).mockRejectedValueOnce(new Error('not on PATH'));

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.checkPlugin);
    expect(result).toMatchObject({ ok: false, error: { code: 'CLAUDE_NOT_FOUND' } });
  });

  it('health:installPlugin returns CLAUDE_NOT_FOUND when resolveClaudeBin rejects', async () => {
    const { resolveClaudeBin } = await import('@main/terminal/resolveClaudeBin');
    vi.mocked(resolveClaudeBin).mockRejectedValueOnce(new Error('not on PATH'));

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.installPlugin);
    expect(result).toMatchObject({ ok: false, error: { code: 'CLAUDE_NOT_FOUND' } });
  });

  it('health:installPlugin returns ok(failed) when another install is in flight', async () => {
    const { getActiveInstallHandle } = await import('@main/terminal/pluginInstall');
    vi.mocked(getActiveInstallHandle).mockReturnValue({ cancel: vi.fn() });

    const fake = makeFullFakeIpcMain();
    registerHealthHandlers(fake);

    const result = await fake.invokeChannel(IPC.health.installPlugin);
    expect(result).toMatchObject({
      ok: true,
      data: { kind: 'failed', message: 'another install is in flight' },
    });
  });
});

// ---------------------------------------------------------------------------
// consultation handlers
// ---------------------------------------------------------------------------

describe('consultation wired handlers', () => {
  it('consultation:loadThread dispatches to service.loadThread', async () => {
    const loadResult = ok(null);
    const service = {
      loadThread: vi.fn().mockResolvedValue(loadResult),
      sendMessage: vi.fn(),
      newSession: vi.fn(),
      cancel: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerConsultationHandlers(service as never, fake);

    const result = await fake.invokeChannel(IPC.consultation.loadThread, '/tmp/proj');
    expect(service.loadThread).toHaveBeenCalledOnce();
    expect(service.loadThread).toHaveBeenCalledWith('/tmp/proj');
    expect(result).toEqual(loadResult);
  });

  it('consultation:sendMessage dispatches to service.sendMessage', async () => {
    const sendResult = ok({ messageId: 'm_abc' });
    const service = {
      loadThread: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(sendResult),
      newSession: vi.fn(),
      cancel: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerConsultationHandlers(service as never, fake);

    const result = await fake.invokeChannel(IPC.consultation.sendMessage, '/tmp/proj', 'hello');
    expect(service.sendMessage).toHaveBeenCalledOnce();
    expect(service.sendMessage).toHaveBeenCalledWith('/tmp/proj', 'hello');
    expect(result).toEqual(sendResult);
  });

  it('consultation:newSession dispatches to service.newSession', async () => {
    const newSessionResult = ok({ sessionId: 's_abc', systemPromptVersion: 1 });
    const service = {
      loadThread: vi.fn(),
      sendMessage: vi.fn(),
      newSession: vi.fn().mockResolvedValue(newSessionResult),
      cancel: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerConsultationHandlers(service as never, fake);

    const result = await fake.invokeChannel(IPC.consultation.newSession, '/tmp/proj', 'sonnet');
    expect(service.newSession).toHaveBeenCalledOnce();
    expect(service.newSession).toHaveBeenCalledWith('/tmp/proj', 'sonnet');
    expect(result).toEqual(newSessionResult);
  });

  it('consultation:cancel dispatches to service.cancel', async () => {
    const cancelResult = ok(undefined);
    const service = {
      loadThread: vi.fn(),
      sendMessage: vi.fn(),
      newSession: vi.fn(),
      cancel: vi.fn().mockResolvedValue(cancelResult),
    };
    const fake = makeFullFakeIpcMain();
    registerConsultationHandlers(service as never, fake);

    const result = await fake.invokeChannel(IPC.consultation.cancel, '/tmp/proj', 'm_abc');
    expect(service.cancel).toHaveBeenCalledOnce();
    expect(service.cancel).toHaveBeenCalledWith('/tmp/proj', 'm_abc');
    expect(result).toEqual(cancelResult);
  });

  it('consultation:sendMessage propagates service errors through safeHandle envelope', async () => {
    const errResult = err('CLAUDE_NOT_FOUND' as const, 'claude binary not resolved');
    const service = {
      loadThread: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(errResult),
      newSession: vi.fn(),
      cancel: vi.fn(),
    };
    const fake = makeFullFakeIpcMain();
    registerConsultationHandlers(service as never, fake);

    const result = await fake.invokeChannel(IPC.consultation.sendMessage, '/tmp/proj', 'hello');
    expect(result).toEqual(errResult);
  });
});

// ---------------------------------------------------------------------------
// skill handlers
// ---------------------------------------------------------------------------

describe('skill wired handlers', () => {
  const makeManager = (spawnResult = ok('t_abc' as TerminalId)) => ({
    spawn: vi.fn().mockReturnValue(spawnResult),
    kill: vi.fn(),
    closeAfterExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
  });

  beforeEach(async () => {
    const { runDetached } = await import('@main/skill/runDetached');
    vi.mocked(runDetached).mockClear();
  });

  it.each(['init', 'explore', 'decide', 'map', 'finalize', 'free', 'new', 'triage', 'audit', 'status'] as const)(
    'skill:spawn accepts skill=%s and delegates to manager.spawn',
    async (skill) => {
      const manager = makeManager();
      const fake = makeFullFakeIpcMain();
      registerSkillHandlers(manager as never, fake);

      const result = await fake.invokeChannel(IPC.skill.spawn, { skill, cwd: '/tmp/proj' });
      expect(manager.spawn).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ ok: true });
    },
  );

  it('skill:spawn rejects an unknown skill with INVALID_SKILL', async () => {
    const manager = makeManager();
    const fake = makeFullFakeIpcMain();
    registerSkillHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.skill.spawn, { skill: 'unknown-skill', cwd: '/tmp/proj' });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_SKILL' } });
    expect(manager.spawn).not.toHaveBeenCalled();
  });

  it('skill:runDetached is registered and delegates to runDetached on a valid detached skill', async () => {
    const { runDetached } = await import('@main/skill/runDetached');
    const mockRunDetached = vi.mocked(runDetached);
    const detachedResult = ok({ exitCode: 0, stdout: 'audit done' });
    mockRunDetached.mockResolvedValue(detachedResult as never);

    const manager = makeManager();
    const fake = makeFullFakeIpcMain();
    registerSkillHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.skill.runDetached, { skill: 'audit', cwd: '/tmp/proj' });
    expect(mockRunDetached).toHaveBeenCalledOnce();
    expect(mockRunDetached).toHaveBeenCalledWith({ skill: 'audit', cwd: '/tmp/proj' });
    expect(result).toEqual(detachedResult);
  });

  it('skill:runDetached rejects an unknown skill with INVALID_SKILL', async () => {
    const { runDetached } = await import('@main/skill/runDetached');
    const mockRunDetached = vi.mocked(runDetached);

    const manager = makeManager();
    const fake = makeFullFakeIpcMain();
    registerSkillHandlers(manager as never, fake);

    const result = await fake.invokeChannel(IPC.skill.runDetached, { skill: 'completely-unknown', cwd: '/tmp/proj' });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_SKILL' } });
    expect(mockRunDetached).not.toHaveBeenCalled();
  });
});
