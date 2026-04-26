import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchDetachedSkill } from '../dispatchDetachedSkill';
import { useAtriumStore } from '../../store/atriumStore';

const mockRunDetached = vi.fn();

beforeEach(() => {
  vi.stubGlobal('atrium', { skill: { runDetached: mockRunDetached } });
  useAtriumStore.setState({
    detachedRuns: { audit: { kind: 'idle' }, status: { kind: 'idle' } },
    lastDetachedError: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('dispatchDetachedSkill — happy path', () => {
  it('calls runDetached IPC and transitions slice to done with stdout', async () => {
    mockRunDetached.mockResolvedValue({ ok: true, data: { exitCode: 0, stdout: 'audit output' } });

    const r = await dispatchDetachedSkill({ skill: 'audit', cwd: '/proj' });

    expect(mockRunDetached).toHaveBeenCalledOnce();
    expect(mockRunDetached).toHaveBeenCalledWith({ skill: 'audit', cwd: '/proj' });
    expect(r.ok).toBe(true);
    const run = useAtriumStore.getState().detachedRuns.audit;
    expect(run.kind).toBe('done');
    if (run.kind === 'done') expect(run.output).toBe('audit output');
    expect(useAtriumStore.getState().lastDetachedError).toBeNull();
  });

  it('works for status skill', async () => {
    mockRunDetached.mockResolvedValue({ ok: true, data: { exitCode: 0, stdout: 'status output' } });

    await dispatchDetachedSkill({ skill: 'status', cwd: '/proj' });

    const run = useAtriumStore.getState().detachedRuns.status;
    expect(run.kind).toBe('done');
    if (run.kind === 'done') expect(run.output).toBe('status output');
  });
});

describe('dispatchDetachedSkill — error path', () => {
  it('calls setDetachedRunError and returns err when IPC returns err', async () => {
    mockRunDetached.mockResolvedValue({
      ok: false,
      error: { code: 'RUN_FAILED', message: 'claude exited 1' },
    });

    const r = await dispatchDetachedSkill({ skill: 'audit', cwd: '/proj' });

    expect(r.ok).toBe(false);
    const run = useAtriumStore.getState().detachedRuns.audit;
    expect(run.kind).toBe('error');
    if (run.kind === 'error') expect(run.message).toBe('claude exited 1');
    expect(useAtriumStore.getState().lastDetachedError).toEqual({
      skill: 'audit',
      message: 'claude exited 1',
    });
  });
});

describe('dispatchDetachedSkill — IPC rejection', () => {
  it('calls setDetachedRunError and returns INTERNAL err when IPC rejects', async () => {
    mockRunDetached.mockRejectedValue(new Error('ipc channel destroyed'));

    const r = await dispatchDetachedSkill({ skill: 'audit', cwd: '/proj' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INTERNAL');
    const run = useAtriumStore.getState().detachedRuns.audit;
    expect(run.kind).toBe('error');
    if (run.kind === 'error') expect(run.message).toBe('ipc channel destroyed');
  });
});

describe('dispatchDetachedSkill — BUSY dedupe', () => {
  it('returns BUSY err without calling IPC when skill is already waiting', async () => {
    useAtriumStore.setState({
      detachedRuns: { audit: { kind: 'waiting', startedAt: 1 }, status: { kind: 'idle' } },
      lastDetachedError: null,
    });

    const r = await dispatchDetachedSkill({ skill: 'audit', cwd: '/proj' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('BUSY');
    expect(mockRunDetached).not.toHaveBeenCalled();
    // State unchanged — still waiting
    expect(useAtriumStore.getState().detachedRuns.audit.kind).toBe('waiting');
  });

  it('concurrent calls for different skills both go through (no cross-slot blocking)', async () => {
    mockRunDetached.mockResolvedValue({ ok: true, data: { exitCode: 0, stdout: '' } });

    const p1 = dispatchDetachedSkill({ skill: 'audit', cwd: '/proj' });
    const p2 = dispatchDetachedSkill({ skill: 'status', cwd: '/proj' });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(mockRunDetached).toHaveBeenCalledTimes(2);
  });
});
