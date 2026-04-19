import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAtriumStore } from '../../store/atriumStore';

const spawnMock = vi.fn();

vi.stubGlobal('atrium', {
  skill: { spawn: spawnMock },
});

// Import after stubbing
const { dispatchSkill } = await import('../dispatchSkill');

const okId = 'term-1' as import('@shared/domain').TerminalId;

beforeEach(() => {
  spawnMock.mockReset();
  useAtriumStore.setState({
    terminal: { id: null, status: 'idle', fullscreen: false },
  });
});

describe('dispatchSkill', () => {
  it('happy path: spawn returns ok → store transitions to spawning with id', async () => {
    spawnMock.mockResolvedValue({ ok: true, data: okId });

    const result = await dispatchSkill({ skill: 'explore', nodes: ['canvas-ui'], cwd: '/p' });

    expect(result).toEqual({ ok: true, data: okId });
    expect(useAtriumStore.getState().terminal.status).toBe('spawning');
    expect(useAtriumStore.getState().terminal.id).toBe(okId);
  });

  it('spawn returns err → no store transition, error propagated', async () => {
    spawnMock.mockResolvedValue({ ok: false, error: { code: 'SPAWN_FAILED', message: 'pty error' } });

    const result = await dispatchSkill({ skill: 'decide', nodes: ['x'], cwd: '/p' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('SPAWN_FAILED');
    expect(useAtriumStore.getState().terminal.status).toBe('idle');
  });

  it('illegal store transition (already spawning) propagated as INTERNAL err', async () => {
    useAtriumStore.setState({
      terminal: { id: null, status: 'spawning', fullscreen: false },
    });
    spawnMock.mockResolvedValue({ ok: true, data: okId });

    const result = await dispatchSkill({ skill: 'map', nodes: [], cwd: '/p' });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('INTERNAL');
  });
});
