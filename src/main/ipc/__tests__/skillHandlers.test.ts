/**
 * Tests for src/main/ipc/skill.ts — registerSkillHandlers
 *
 * Strategy: inject a fake ipcMainLike and a stub TerminalManager.
 * The handler is extracted by capturing the function passed to handle().
 * skillsPathFactory is injected to avoid electron.app dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { registerSkillHandlers } from '../skill';
import { IPC } from '@shared/ipc';
import { SkillErrorCode } from '@shared/errors';
import type { TerminalId } from '@shared/domain';
import type { SkillSpawnRequest } from '@shared/skill/spawn';

// ---------------------------------------------------------------------------
// Fake ipcMain
// ---------------------------------------------------------------------------

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const handleMap = new Map<string, InvokeHandler>();

const fakeIpcMain = {
  handle(channel: string, listener: InvokeHandler) {
    handleMap.set(channel, listener);
  },
  on() {},
};

// ---------------------------------------------------------------------------
// Fake TerminalManager
// ---------------------------------------------------------------------------

const fakeTerminalManager = {
  spawn: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_SKILLS_DIR = '/fake/skills';
const fakeSkillsFactory = () => FAKE_SKILLS_DIR;
const fakeEvent = {} as IpcMainInvokeEvent;

function getSkillSpawnHandler(): InvokeHandler {
  const handler = handleMap.get(IPC.skill.spawn);
  if (!handler) throw new Error('skill:spawn handler not registered');
  return handler;
}

function invoke(req: SkillSpawnRequest) {
  return getSkillSpawnHandler()(fakeEvent, req);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  handleMap.clear();
  fakeTerminalManager.spawn.mockReset();
  registerSkillHandlers(fakeTerminalManager as never, fakeSkillsFactory, fakeIpcMain);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerSkillHandlers — happy path', () => {
  it('explore: composeCommand receives skillsDir, terminalManager.spawn receives composed args + cwd', async () => {
    const terminalId = 't_abc123' as TerminalId;
    fakeTerminalManager.spawn.mockReturnValue({ ok: true, data: terminalId });

    const req: SkillSpawnRequest = { skill: 'explore', nodes: ['canvas-ui'], cwd: '/p' };
    const result = await invoke(req) as { ok: boolean; data?: TerminalId };

    expect(fakeTerminalManager.spawn).toHaveBeenCalledOnce();
    const [calledArgs, calledCwd] = fakeTerminalManager.spawn.mock.calls[0] as [string[], string];

    expect(calledCwd).toBe('/p');
    // composeCommand for explore produces: ['claude', '/architector:explore canvas-ui', '--append-system-prompt-file', '<dir>/explore.md']
    expect(calledArgs[0]).toBe('claude');
    expect(calledArgs[1]).toContain('explore');
    expect(calledArgs[1]).toContain('canvas-ui');
    expect(calledArgs).toContain('--append-system-prompt-file');
    expect(calledArgs[calledArgs.length - 1]).toContain('explore.md');
    expect(calledArgs[calledArgs.length - 1]).toContain(FAKE_SKILLS_DIR);

    expect(result.ok).toBe(true);
    expect(result.data).toBe(terminalId);
  });

  it('init without prompt: args end with init.md, no prompt in command', async () => {
    const terminalId = 't_init1' as TerminalId;
    fakeTerminalManager.spawn.mockReturnValue({ ok: true, data: terminalId });

    const req: SkillSpawnRequest = { skill: 'init', cwd: '/proj' };
    await invoke(req);

    const [calledArgs] = fakeTerminalManager.spawn.mock.calls[0] as [string[], string];
    expect(calledArgs[1]).toBe('/architector:init');
    expect(calledArgs[calledArgs.length - 1]).toContain('init.md');
  });

  it('init with prompt: prompt is embedded in the slash command', async () => {
    const terminalId = 't_init2' as TerminalId;
    fakeTerminalManager.spawn.mockReturnValue({ ok: true, data: terminalId });

    const req: SkillSpawnRequest = { skill: 'init', prompt: 'my cool project', cwd: '/proj' };
    await invoke(req);

    const [calledArgs] = fakeTerminalManager.spawn.mock.calls[0] as [string[], string];
    expect(calledArgs[1]).toBe('/architector:init my cool project');
  });
});

describe('registerSkillHandlers — error paths', () => {
  it('terminalManager.spawn returns err(SPAWN_FAILED) → handler returns err(SPAWN_FAILED)', async () => {
    fakeTerminalManager.spawn.mockReturnValue({
      ok: false,
      error: { code: 'SPAWN_FAILED', message: 'terminal not idle' },
    });

    const req: SkillSpawnRequest = { skill: 'explore', cwd: '/p' };
    const result = await invoke(req) as { ok: false; error: { code: string; message: string } };

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(SkillErrorCode.SPAWN_FAILED);
    expect(result.error.message).toContain('terminal not idle');
  });

  it('unknown skill string → returns err(INVALID_SKILL) without calling spawn', async () => {
    const req = { skill: 'not-a-skill', cwd: '/p' } as unknown as SkillSpawnRequest;
    const result = await invoke(req) as { ok: false; error: { code: string } };

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(SkillErrorCode.INVALID_SKILL);
    expect(fakeTerminalManager.spawn).not.toHaveBeenCalled();
  });
});
